import { NextRequest } from 'next/server';
import { getAuthenticatedClient, verifyCompanyMembership } from '@/lib/supabase/api-client';
import { matchTransaction } from '@/lib/classify/rule-engine';
import { classifyWithAI, getCompanyPrompts } from '@/lib/classify/ai-classifier';
import Papa from 'papaparse';
import { z } from 'zod';

export const maxDuration = 300;

const rowSchema = z.object({
  merchant_name: z.string().min(1),
  mcc_code: z.string().optional().default(''),
  amount: z.string().transform((v) => Number(v)).pipe(z.number().positive()),
  transaction_date: z.string().optional().default(''),
  description: z.string().optional().default(''),
  card_type: z.string().optional().default(''),
});

// 한국어 컬럼명(처리내역 형식) → 영문 컬럼명으로 정규화
function normalizeRow(raw: Record<string, string>): Record<string, string> {
  if ('가맹점명' in raw) {
    const amount = raw['공급금액'] && raw['부가세액']
      ? String(Number(raw['공급금액']) + Number(raw['부가세액']))
      : raw['공급금액'] ?? raw['amount'] ?? '';
    const rawDate = raw['승인일자'] ?? '';
    const transaction_date = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate;
    return {
      merchant_name: raw['가맹점명'] ?? '',
      mcc_code: raw['가맹점업종코드'] ?? '',
      amount,
      transaction_date,
      description: raw['가맹점업종명'] ?? '',
      card_type: '',
    };
  }
  return raw;
}

function sseEvent(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const { user, client } = await getAuthenticatedClient();
  if (!user || !client) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  if (!(await verifyCompanyMembership(user.id, companyId))) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return new Response(JSON.stringify({ error: 'CSV 파일을 업로드하세요' }), { status: 400 });
  }

  const text = (await file.text()).replace(/^\uFEFF/, '');
  const { data: rows, errors } = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (errors.length > 0) {
    return new Response(JSON.stringify({ error: 'CSV 파싱 오류' }), { status: 400 });
  }

  const { data: rulesData } = await client
    .from('classification_rules')
    .select('*, account:accounts(*)')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  const { data: accountsData } = await client
    .from('accounts')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true);

  const rules = rulesData || [];
  const accounts = accountsData || [];

  const { data: examples } = await client
    .from('classification_results')
    .select('account:accounts!classification_results_account_id_fkey(code, name), transaction:transactions(merchant_name, mcc_code, amount)')
    .eq('is_confirmed', true)
    .order('created_at', { ascending: false })
    .limit(10);

  const recentExamples = (examples || [])
    .filter((ex: any) => ex.transaction && ex.account)
    .map((ex: any) => ({
      merchant_name: ex.transaction.merchant_name || '',
      mcc_code: ex.transaction.mcc_code || '',
      amount: Number(ex.transaction.amount),
      account_code: ex.account.code,
      account_name: ex.account.name,
    }));

  const customPrompts = await getCompanyPrompts(companyId);

  const total = rows.length;
  const result = {
    total,
    success: 0,
    failed: 0,
    rule_classified: 0,
    ai_classified: 0,
    errors: [] as { row: number; error: string }[],
  };

  const stream = new ReadableStream({
    async start(controller) {
      // 초기 이벤트
      controller.enqueue(sseEvent({ type: 'init', total }));

      const BATCH_SIZE = 5;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (row, batchIdx) => {
          const rowNum = i + batchIdx + 1;
          const parsed = rowSchema.safeParse(normalizeRow(row as Record<string, string>));
          if (!parsed.success) {
            result.failed++;
            result.errors.push({ row: rowNum, error: '유효하지 않은 데이터' });
            return;
          }

          const txData = parsed.data;
          const cardType = ['corporate', 'personal'].includes(txData.card_type) ? txData.card_type : null;

          const { data: newTx, error: txError } = await client
            .from('transactions')
            .insert({
              company_id: companyId, user_id: user.id,
              merchant_name: txData.merchant_name, mcc_code: txData.mcc_code || null,
              amount: txData.amount, transaction_date: txData.transaction_date || null,
              description: txData.description || null, card_type: cardType,
            })
            .select().single();

          if (txError || !newTx) {
            result.failed++;
            result.errors.push({ row: rowNum, error: txError?.message || '거래 저장 실패' });
            return;
          }

          const txInput = {
            merchant_name: txData.merchant_name, mcc_code: txData.mcc_code || undefined,
            amount: txData.amount, transaction_date: txData.transaction_date || undefined,
            description: txData.description || undefined,
          };

          const ruleResult = matchTransaction(rules, txInput);
          if (ruleResult.matched && ruleResult.account) {
            await client.from('classification_results').insert({
              transaction_id: newTx.id, account_id: ruleResult.account.id,
              confidence: 1.0, reason: `룰 "${ruleResult.rule!.name}"에 의해 자동 분류`, method: 'rule',
            });
            result.success++;
            result.rule_classified++;
            return;
          }

          if (accounts.length === 0) {
            result.failed++;
            result.errors.push({ row: rowNum, error: '계정과목이 없습니다' });
            return;
          }

          try {
            const aiResult = await classifyWithAI(txInput, accounts, recentExamples, companyId, customPrompts);
            const matchedAccount = accounts.find((a) => a.code === aiResult.account_code);
            if (matchedAccount) {
              await client.from('classification_results').insert({
                transaction_id: newTx.id, account_id: matchedAccount.id,
                confidence: aiResult.confidence, reason: aiResult.reason, method: 'ai',
              });
              result.success++;
              result.ai_classified++;
            } else {
              result.failed++;
              result.errors.push({ row: rowNum, error: 'AI가 유효하지 않은 계정과목 반환' });
            }
          } catch (err: any) {
            result.failed++;
            result.errors.push({ row: rowNum, error: err.message });
          }
        });

        await Promise.allSettled(promises);

        // 배치 완료마다 진행 상황 전송
        controller.enqueue(sseEvent({
          type: 'progress',
          processed: Math.min(i + BATCH_SIZE, total),
          total,
          success: result.success,
          failed: result.failed,
          rule_classified: result.rule_classified,
          ai_classified: result.ai_classified,
        }));
      }

      // 완료 이벤트
      controller.enqueue(sseEvent({ type: 'done', ...result }));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
