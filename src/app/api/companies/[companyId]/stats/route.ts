import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient, verifyCompanyMembership } from '@/lib/supabase/api-client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const { user, client } = await getAuthenticatedClient();
  if (!user || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await verifyCompanyMembership(user.id, companyId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const { count: totalTransactions } = await client
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gte('transaction_date', monthStart);

  const { data: allTx } = await client
    .from('transactions')
    .select('id')
    .eq('company_id', companyId);

  const txIds = (allTx || []).map((t) => t.id);

  let confirmedCount = 0;
  let classifiedTxCount = 0;
  let ruleCount = 0;
  let aiCount = 0;
  let totalConfidence = 0;
  let confidenceCount = 0;

  if (txIds.length > 0) {
    const { data: results } = await client
      .from('classification_results')
      .select('*')
      .in('transaction_id', txIds);

    const classifiedTxIds = new Set<string>();
    (results || []).forEach((r) => {
      classifiedTxIds.add(r.transaction_id);
      if (r.is_confirmed) confirmedCount++;
      if (r.method === 'rule') ruleCount++;
      if (r.method === 'ai') aiCount++;
      if (r.confidence !== null) {
        totalConfidence += Number(r.confidence);
        confidenceCount++;
      }
    });
    classifiedTxCount = classifiedTxIds.size;
  }

  const confirmationRate = txIds.length > 0 ? Math.round((classifiedTxCount / txIds.length) * 100) : 0;
  const avgConfidence = confidenceCount > 0 ? Math.round((totalConfidence / confidenceCount) * 100) : 0;

  const { data: topAccountsRaw } = await client
    .from('classification_results')
    .select('account_id, account:accounts!classification_results_account_id_fkey(code, name), transaction:transactions(amount, company_id)')
    .in('transaction_id', txIds.length > 0 ? txIds : ['00000000-0000-0000-0000-000000000000']);

  const accountAgg: Record<string, { code: string; name: string; count: number; total_amount: number }> = {};
  (topAccountsRaw || []).forEach((r: any) => {
    if (!r.account || !r.transaction) return;
    const key = r.account_id;
    if (!accountAgg[key]) {
      accountAgg[key] = { code: r.account.code, name: r.account.name, count: 0, total_amount: 0 };
    }
    accountAgg[key].count++;
    accountAgg[key].total_amount += Number(r.transaction.amount);
  });

  const topAccounts = Object.values(accountAgg).sort((a, b) => b.count - a.count).slice(0, 10);

  return NextResponse.json({
    total_transactions: totalTransactions || 0,
    confirmed_count: confirmedCount,
    confirmation_rate: confirmationRate,
    rule_count: ruleCount,
    ai_count: aiCount,
    avg_confidence: avgConfidence,
    top_accounts: topAccounts,
  });
}
