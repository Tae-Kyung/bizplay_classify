import { NextRequest } from 'next/server';
import { getAuthenticatedClient, verifyCompanyMembership } from '@/lib/supabase/api-client';
import Papa from 'papaparse';

function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s || null;
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
  if (!user || !client)
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  if (!(await verifyCompanyMembership(user.id, companyId)))
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file)
    return new Response(JSON.stringify({ error: 'CSV 파일을 업로드하세요' }), { status: 400 });

  const text = (await file.text()).replace(/^\uFEFF/, '');
  const { data: rows, errors: parseErrors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (parseErrors.length > 0)
    return new Response(JSON.stringify({ error: 'CSV 파싱 오류' }), { status: 400 });

  const { data: accounts } = await client
    .from('accounts')
    .select('id, code, name')
    .eq('company_id', companyId)
    .eq('is_active', true);

  const codeToAccount = new Map((accounts ?? []).map((a) => [a.code, a]));
  const total = rows.length;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(sseEvent({ type: 'init', total }));

      const results = {
        imported: 0,
        skipped: 0,
        errors: [] as { row: number; error: string }[],
      };

      const BATCH_SIZE = 10;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 1;

        const merchantName = row['가맹점명']?.trim();
        if (!merchantName) {
          results.skipped++;
          results.errors.push({ row: rowNum, error: '가맹점명 없음' });
        } else {
          const supplyAmt = Number(row['공급금액'] ?? 0);
          const vatAmt = Number(row['부가세액'] ?? 0);
          const amount = supplyAmt + vatAmt;

          if (!amount || amount <= 0) {
            results.skipped++;
            results.errors.push({ row: rowNum, error: '금액 오류' });
          } else {
            const accountCode = row['용도코드']?.trim();
            const account = accountCode ? codeToAccount.get(accountCode) : null;

            const { data: newTx, error: txError } = await client
              .from('transactions')
              .insert({
                company_id: companyId,
                user_id: user.id,
                merchant_name: merchantName,
                mcc_code: row['가맹점업종코드']?.trim() || null,
                amount,
                transaction_date: normalizeDate(row['승인일자'] ?? ''),
                description: row['가맹점업종명']?.trim() || null,
                card_type: null,
              })
              .select('id')
              .single();

            if (txError || !newTx) {
              results.skipped++;
              results.errors.push({ row: rowNum, error: txError?.message || '거래 저장 실패' });
            } else {
              if (account) {
                await client.from('classification_results').insert({
                  transaction_id: newTx.id,
                  account_id: account.id,
                  confidence: 1.0,
                  reason: `처리내역 import: ${account.code} ${account.name}`,
                  method: 'rule',
                  is_confirmed: true,
                });
              }
              results.imported++;
            }
          }
        }

        // 배치 단위로 진행 상황 전송
        if ((i + 1) % BATCH_SIZE === 0 || i === rows.length - 1) {
          controller.enqueue(sseEvent({
            type: 'progress',
            processed: i + 1,
            total,
            imported: results.imported,
            skipped: results.skipped,
          }));
        }
      }

      controller.enqueue(sseEvent({ type: 'done', ...results }));
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
