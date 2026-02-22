import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient, verifyCompanyMembership } from '@/lib/supabase/api-client';
import { matchTransaction } from '@/lib/classify/rule-engine';
import { classifyWithAI } from '@/lib/classify/ai-classifier';
import { z } from 'zod';
import type { TransactionInput } from '@/types';

const classifySchema = z.object({
  transaction_id: z.string().uuid().optional(),
  merchant_name: z.string().optional(),
  mcc_code: z.string().optional(),
  amount: z.number().positive().optional(),
  transaction_date: z.string().optional(),
  description: z.string().optional(),
  save_transaction: z.boolean().default(false),
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

  const body = await request.json();
  const parsed = classifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let txInput: TransactionInput;
  let transactionId: string | undefined;

  if (parsed.data.transaction_id) {
    const { data: tx, error } = await client
      .from('transactions')
      .select('*')
      .eq('id', parsed.data.transaction_id)
      .eq('company_id', companyId)
      .single();

    if (error || !tx) {
      return NextResponse.json({ error: '거래를 찾을 수 없습니다' }, { status: 404 });
    }
    txInput = {
      merchant_name: tx.merchant_name,
      mcc_code: tx.mcc_code,
      amount: Number(tx.amount),
      transaction_date: tx.transaction_date,
      description: tx.description,
    };
    transactionId = tx.id;
  } else {
    if (!parsed.data.amount) {
      return NextResponse.json({ error: '금액은 필수입니다' }, { status: 400 });
    }
    txInput = {
      merchant_name: parsed.data.merchant_name,
      mcc_code: parsed.data.mcc_code,
      amount: parsed.data.amount,
      transaction_date: parsed.data.transaction_date,
      description: parsed.data.description,
    };

    if (parsed.data.save_transaction) {
      const { data: newTx, error } = await client
        .from('transactions')
        .insert({
          company_id: companyId,
          user_id: user.id,
          merchant_name: txInput.merchant_name,
          mcc_code: txInput.mcc_code,
          amount: txInput.amount,
          transaction_date: txInput.transaction_date,
          description: txInput.description,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      transactionId = newTx.id;
    }
  }

  // 1. Try rule engine
  const { data: rulesData } = await client
    .from('classification_rules')
    .select('*, account:accounts(*)')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  const rules = rulesData || [];
  const ruleResult = matchTransaction(rules, txInput);

  if (ruleResult.matched && ruleResult.account) {
    let resultId: string | undefined;
    if (transactionId) {
      const { data: saved } = await client
        .from('classification_results')
        .insert({
          transaction_id: transactionId,
          account_id: ruleResult.account.id,
          confidence: 1.0,
          reason: `룰 "${ruleResult.rule!.name}"에 의해 자동 분류되었습니다.`,
          method: 'rule',
        })
        .select()
        .single();
      resultId = saved?.id;
    }

    return NextResponse.json({
      classification: {
        id: resultId,
        transaction_id: transactionId,
        account: {
          id: ruleResult.account.id,
          code: ruleResult.account.code,
          name: ruleResult.account.name,
        },
        confidence: 1.0,
        reason: `룰 "${ruleResult.rule!.name}"에 의해 자동 분류되었습니다.`,
        method: 'rule',
        is_confirmed: false,
      },
    });
  }

  // 2. AI classification
  const { data: accountsData } = await client
    .from('accounts')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true);

  const accounts = accountsData || [];

  if (accounts.length === 0) {
    return NextResponse.json(
      { error: '등록된 계정과목이 없습니다. 먼저 계정과목을 등록하세요.' },
      { status: 400 }
    );
  }

  const { data: examples } = await client
    .from('classification_results')
    .select(`
      account:accounts!classification_results_account_id_fkey(code, name),
      transaction:transactions(merchant_name, mcc_code, amount)
    `)
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

  try {
    const aiResult = await classifyWithAI(txInput, accounts, recentExamples, companyId);

    const matchedAccount = accounts.find((a) => a.code === aiResult.account_code);
    if (!matchedAccount) {
      return NextResponse.json(
        { error: 'AI가 유효하지 않은 계정과목을 반환했습니다' },
        { status: 500 }
      );
    }

    let resultId: string | undefined;
    if (transactionId) {
      const { data: saved } = await client
        .from('classification_results')
        .insert({
          transaction_id: transactionId,
          account_id: matchedAccount.id,
          confidence: aiResult.confidence,
          reason: aiResult.reason,
          method: 'ai',
        })
        .select()
        .single();
      resultId = saved?.id;
    }

    return NextResponse.json({
      classification: {
        id: resultId,
        transaction_id: transactionId,
        account: {
          id: matchedAccount.id,
          code: matchedAccount.code,
          name: matchedAccount.name,
        },
        confidence: aiResult.confidence,
        reason: aiResult.reason,
        method: 'ai',
        is_confirmed: false,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `AI 분류 실패: ${err.message}` },
      { status: 500 }
    );
  }
}
