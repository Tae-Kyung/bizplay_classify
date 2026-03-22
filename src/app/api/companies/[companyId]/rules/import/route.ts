import { NextRequest } from 'next/server';
import { getAuthenticatedClient, verifyCompanyMembership } from '@/lib/supabase/api-client';
import Papa from 'papaparse';

const TX_BATCH = 100;
const RULE_BATCH = 50;

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

  // 계정과목 + 기존 룰 병렬 로드
  const [{ data: accounts }, { data: existingRules }] = await Promise.all([
    client.from('accounts').select('id, code, name').eq('company_id', companyId).eq('is_active', true),
    client.from('classification_rules').select('conditions').eq('company_id', companyId).eq('is_active', true),
  ]);

  if (!accounts || accounts.length === 0)
    return new Response(JSON.stringify({ error: '계정과목을 먼저 등록하세요' }), { status: 400 });

  const codeToAccount = new Map(accounts.map((a) => [a.code, a]));

  const existingMccs = new Set<string>();
  for (const rule of existingRules ?? [])
    for (const m of (rule.conditions as { mcc_codes?: string[] })?.mcc_codes ?? [])
      existingMccs.add(m);

  const total = rows.length;

  // ── 룰 생성 준비 ──
  const mccAccountCodes = new Map<string, Set<string>>();
  const mccMeta = new Map<string, { mccName: string; accountCode: string; accountName: string }>();

  for (const row of rows) {
    const mcc = row['가맹점업종코드']?.trim();
    const mccName = row['가맹점업종명']?.trim();
    const accountCode = row['용도코드']?.trim();
    const accountName = row['용도명']?.trim();
    if (!mcc || !accountCode) continue;
    if (!mccAccountCodes.has(mcc)) mccAccountCodes.set(mcc, new Set());
    mccAccountCodes.get(mcc)!.add(accountCode);
    if (!mccMeta.has(mcc))
      mccMeta.set(mcc, { mccName: mccName ?? mcc, accountCode, accountName: accountName ?? accountCode });
  }

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(sseEvent({ type: 'init', total }));

      // ── Phase 1: 룰 배치 생성 ──
      const ruleResults = { created: 0, skipped: 0, skipped_ambiguous: 0, skipped_no_account: 0, skipped_duplicate: 0 };
      const rulesToInsert: object[] = [];
      let priority = 10;

      for (const [mcc, codes] of mccAccountCodes.entries()) {
        if (codes.size > 1) { ruleResults.skipped++; ruleResults.skipped_ambiguous++; continue; }
        const meta = mccMeta.get(mcc)!;
        const account = codeToAccount.get(meta.accountCode);
        if (!account) { ruleResults.skipped++; ruleResults.skipped_no_account++; continue; }
        if (existingMccs.has(mcc)) { ruleResults.skipped++; ruleResults.skipped_duplicate++; continue; }

        rulesToInsert.push({
          company_id: companyId,
          name: `${meta.mccName} → ${meta.accountName}`,
          priority: priority++,
          conditions: { mcc_codes: [mcc] },
          account_id: account.id,
          is_active: true,
        });
      }

      // 룰 배치 insert (RULE_BATCH 단위)
      for (let i = 0; i < rulesToInsert.length; i += RULE_BATCH) {
        const chunk = rulesToInsert.slice(i, i + RULE_BATCH);
        const { error } = await client.from('classification_rules').insert(chunk);
        if (!error) ruleResults.created += chunk.length;
        else ruleResults.skipped += chunk.length;
      }

      controller.enqueue(sseEvent({ type: 'rules_done', ...ruleResults }));

      // ── Phase 2: 트랜잭션 배치 저장 ──
      const txResults = { imported: 0, skipped: 0 };

      // 유효 행 전처리
      const validRows: { txData: object; accountCode: string | null }[] = [];
      for (const row of rows) {
        const merchantName = row['가맹점명']?.trim();
        const amount = Number(row['공급금액'] ?? 0) + Number(row['부가세액'] ?? 0);
        if (!merchantName || amount <= 0) { txResults.skipped++; continue; }
        validRows.push({
          txData: {
            company_id: companyId,
            user_id: user.id,
            merchant_name: merchantName,
            mcc_code: row['가맹점업종코드']?.trim() || null,
            amount,
            transaction_date: normalizeDate(row['승인일자'] ?? ''),
            description: row['가맹점업종명']?.trim() || null,
            card_type: null,
          },
          accountCode: row['용도코드']?.trim() || null,
        });
      }

      // TX_BATCH 단위로 배치 insert
      for (let i = 0; i < validRows.length; i += TX_BATCH) {
        const chunk = validRows.slice(i, i + TX_BATCH);
        const { data: newTxs, error: txError } = await client
          .from('transactions')
          .insert(chunk.map((r) => r.txData))
          .select('id');

        if (txError || !newTxs) {
          txResults.skipped += chunk.length;
        } else {
          txResults.imported += newTxs.length;

          // classification_results 배치 준비 (용도코드 있는 건만)
          const classResults: object[] = [];
          for (let j = 0; j < chunk.length; j++) {
            const account = chunk[j].accountCode ? codeToAccount.get(chunk[j].accountCode!) : null;
            if (account && newTxs[j]) {
              classResults.push({
                transaction_id: newTxs[j].id,
                account_id: account.id,
                confidence: 1.0,
                reason: `처리내역 import: ${account.code} ${account.name}`,
                method: 'rule',
                is_confirmed: true,
              });
            }
          }

          if (classResults.length > 0)
            await client.from('classification_results').insert(classResults);
        }

        controller.enqueue(sseEvent({
          type: 'progress',
          processed: Math.min(i + TX_BATCH, validRows.length) + (rows.length - validRows.length),
          total,
          imported: txResults.imported,
          skipped: txResults.skipped,
        }));
      }

      controller.enqueue(sseEvent({ type: 'done', rules: ruleResults, transactions: txResults }));
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
