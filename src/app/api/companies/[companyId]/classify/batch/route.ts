import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient, verifyCompanyMembership } from '@/lib/supabase/api-client';
import { matchTransaction } from '@/lib/classify/rule-engine';
import { classifyWithAI } from '@/lib/classify/ai-classifier';
import Papa from 'papaparse';
import { z } from 'zod';

const rowSchema = z.object({
  merchant_name: z.string().min(1),
  mcc_code: z.string().optional().default(''),
  amount: z.string().transform((v) => Number(v)).pipe(z.number().positive()),
  transaction_date: z.string().optional().default(''),
  description: z.string().optional().default(''),
  card_type: z.string().optional().default(''),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const { user, client } = await getAuthenticatedClient();
  if (!user || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await verifyCompanyMembership(user.id, companyId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const modelId = (formData.get('model_id') as string) || undefined;
  if (!file) return NextResponse.json({ error: 'CSV 파일을 업로드하세요' }, { status: 400 });

  const text = await file.text();
  const { data: rows, errors } = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (errors.length > 0) return NextResponse.json({ error: 'CSV 파싱 오류' }, { status: 400 });

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

  const result = {
    total: rows.length, success: 0, failed: 0,
    rule_classified: 0, ai_classified: 0,
    errors: [] as { row: number; error: string }[],
  };

  const BATCH_SIZE = 5;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (row, batchIdx) => {
      const rowNum = i + batchIdx + 1;
      const parsed = rowSchema.safeParse(row);
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
        const aiResult = await classifyWithAI(txInput, accounts, recentExamples, modelId);
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
  }

  return NextResponse.json(result);
}
