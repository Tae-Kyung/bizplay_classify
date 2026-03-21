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

  // 계정과목 로드
  const { data: accounts } = await client
    .from('accounts')
    .select('id, code, name')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (!accounts || accounts.length === 0)
    return new Response(JSON.stringify({ error: '계정과목을 먼저 등록하세요' }), { status: 400 });

  const codeToAccount = new Map(accounts.map((a) => [a.code, a]));

  // ── 룰 생성 준비: MCC별 용도코드 집계 ──
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

  // 1:1 매핑 MCC만 룰 생성 대상
  const mccUnique = new Map<string, { mccName: string; accountCode: string; accountName: string }>();
  for (const [mcc, codes] of mccAccountCodes.entries()) {
    if (codes.size === 1) mccUnique.set(mcc, mccMeta.get(mcc)!);
  }

  // 기존 룰 MCC 조회 (중복 방지)
  const { data: existingRules } = await client
    .from('classification_rules')
    .select('conditions')
    .eq('company_id', companyId)
    .eq('is_active', true);

  const existingMccs = new Set<string>();
  for (const rule of existingRules ?? []) {
    for (const m of (rule.conditions as { mcc_codes?: string[] })?.mcc_codes ?? [])
      existingMccs.add(m);
  }

  const total = rows.length;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(sseEvent({ type: 'init', total }));

      // ── Phase 1: 룰 생성 ──
      const ruleResults = {
        created: 0,
        skipped: 0,
        skipped_ambiguous: 0,
        skipped_no_account: 0,
        skipped_duplicate: 0,
        errors: [] as { mcc: string; reason: string }[],
      };

      for (const [mcc, codes] of mccAccountCodes.entries()) {
        if (codes.size > 1) { ruleResults.skipped++; ruleResults.skipped_ambiguous++; }
      }

      let priority = 10;
      for (const [mcc, meta] of mccUnique.entries()) {
        const account = codeToAccount.get(meta.accountCode);
        if (!account) {
          ruleResults.skipped++; ruleResults.skipped_no_account++;
          ruleResults.errors.push({ mcc, reason: `계정과목 없음: ${meta.accountCode}` });
          continue;
        }
        if (existingMccs.has(mcc)) {
          ruleResults.skipped++; ruleResults.skipped_duplicate++;
          continue;
        }
        const { error } = await client.from('classification_rules').insert({
          company_id: companyId,
          name: `${meta.mccName} → ${meta.accountName}`,
          priority,
          conditions: { mcc_codes: [mcc] },
          account_id: account.id,
          is_active: true,
        });
        if (error) {
          ruleResults.skipped++;
          ruleResults.errors.push({ mcc, reason: error.message });
        } else {
          ruleResults.created++;
          existingMccs.add(mcc);
        }
        priority++;
      }

      controller.enqueue(sseEvent({ type: 'rules_done', ...ruleResults }));

      // ── Phase 2: 트랜잭션 저장 ──
      const txResults = { imported: 0, skipped: 0 };
      const BATCH_SIZE = 10;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const merchantName = row['가맹점명']?.trim();
        const supplyAmt = Number(row['공급금액'] ?? 0);
        const vatAmt = Number(row['부가세액'] ?? 0);
        const amount = supplyAmt + vatAmt;

        if (!merchantName || amount <= 0) {
          txResults.skipped++;
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
            txResults.skipped++;
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
            txResults.imported++;
          }
        }

        if ((i + 1) % BATCH_SIZE === 0 || i === rows.length - 1) {
          controller.enqueue(sseEvent({
            type: 'progress',
            processed: i + 1,
            total,
            imported: txResults.imported,
            skipped: txResults.skipped,
          }));
        }
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
