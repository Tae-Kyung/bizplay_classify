import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient, verifyCompanyMembership } from '@/lib/supabase/api-client';
import { z } from 'zod';

const deleteTransactionsSchema = z.union([
  z.object({ ids: z.array(z.string().uuid()).min(1).max(100), all: z.undefined() }),
  z.object({ all: z.literal(true), ids: z.undefined() }),
]);

const createTransactionSchema = z.object({
  merchant_name: z.string().min(1, '가맹점명을 입력하세요'),
  mcc_code: z.string().optional(),
  amount: z.number().positive('금액은 0보다 커야 합니다'),
  transaction_date: z.string().optional(),
  description: z.string().optional(),
  card_type: z.enum(['corporate', 'personal']).optional(),
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
  const parsed = createTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await client
    .from('transactions')
    .insert({ ...parsed.data, company_id: companyId, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

const BATCH_SIZE = 200;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const { user, client } = await getAuthenticatedClient();
  if (!user || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await verifyCompanyMembership(user.id, companyId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const parsed = deleteTransactionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // 선택 삭제: 기존 방식 유지
  if (!parsed.data.all) {
    const { error, count } = await client
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('company_id', companyId)
      .in('id', parsed.data.ids!);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: count });
  }

  // 전체 삭제: 배치 처리 + SSE 스트리밍
  const { count: totalCount } = await client
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);

  const total = totalCount || 0;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      let deleted = 0;

      while (true) {
        const { data: batch, error: fetchError } = await client
          .from('transactions')
          .select('id')
          .eq('company_id', companyId)
          .limit(BATCH_SIZE);

        if (fetchError) {
          send({ type: 'error', message: fetchError.message });
          break;
        }
        if (!batch || batch.length === 0) break;

        const ids = batch.map((r: any) => r.id);
        const { error: deleteError } = await client
          .from('transactions')
          .delete()
          .in('id', ids);

        if (deleteError) {
          send({ type: 'error', message: deleteError.message });
          break;
        }

        deleted += ids.length;
        send({ type: 'progress', deleted, total });

        if (ids.length < BATCH_SIZE) break;
      }

      send({ type: 'done', deleted, total });
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const { user, client } = await getAuthenticatedClient();
  if (!user || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await verifyCompanyMembership(user.id, companyId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const perPage = parseInt(searchParams.get('per_page') || '20');
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '';
  const dateFrom = searchParams.get('date_from') || '';
  const dateTo = searchParams.get('date_to') || '';

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = client
    .from('transactions')
    .select(
      `*, classification_results(*, account:accounts!classification_results_account_id_fkey(*), confirmed_account:accounts!classification_results_confirmed_account_id_fkey(*))`,
      { count: 'exact' }
    )
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (search) query = query.ilike('merchant_name', `%${search}%`);
  if (dateFrom) query = query.gte('transaction_date', dateFrom);
  if (dateTo) query = query.lte('transaction_date', dateTo);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let filtered = data || [];
  if (status === 'unclassified') {
    filtered = filtered.filter((t: any) => !t.classification_results?.length);
  } else if (status === 'classified') {
    filtered = filtered.filter(
      (t: any) =>
        t.classification_results?.length > 0 &&
        !t.classification_results.some((r: any) => r.is_confirmed)
    );
  } else if (status === 'confirmed') {
    filtered = filtered.filter((t: any) =>
      t.classification_results?.some((r: any) => r.is_confirmed)
    );
  }

  return NextResponse.json({
    data: filtered,
    total: count || 0,
    page,
    per_page: perPage,
    total_pages: Math.ceil((count || 0) / perPage),
  });
}
