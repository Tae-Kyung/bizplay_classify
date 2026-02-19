import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient, verifyCompanyMembership } from '@/lib/supabase/api-client';
import { z } from 'zod';

const conditionsSchema = z.object({
  mcc_codes: z.array(z.string()).optional(),
  merchant_name_contains: z.string().optional(),
  amount_min: z.number().optional(),
  amount_max: z.number().optional(),
});

const createRuleSchema = z.object({
  name: z.string().min(1, '룰 이름을 입력하세요'),
  priority: z.number().int().default(0),
  conditions: conditionsSchema,
  account_id: z.string().uuid('유효한 계정과목을 선택하세요'),
  is_active: z.boolean().default(true),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const { user, client } = await getAuthenticatedClient();
  if (!user || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await verifyCompanyMembership(user.id, companyId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await client
    .from('classification_rules')
    .select('*, account:accounts(*)')
    .eq('company_id', companyId)
    .order('priority', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

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
  const parsed = createRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await client
    .from('classification_rules')
    .insert({ ...parsed.data, company_id: companyId })
    .select('*, account:accounts(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
