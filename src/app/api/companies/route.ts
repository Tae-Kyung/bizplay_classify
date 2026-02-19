import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createCompanySchema = z.object({
  name: z.string().min(1, '회사명을 입력하세요'),
  business_number: z.string().optional(),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Use service client to bypass RLS for reading user's companies
  const serviceClient = await createServiceClient();
  const { data: memberships } = await serviceClient
    .from('company_users')
    .select('company_id')
    .eq('user_id', user.id);

  const companyIds = (memberships || []).map((m) => m.company_id);
  if (companyIds.length === 0) return NextResponse.json([]);

  const { data, error } = await serviceClient
    .from('companies')
    .select('*')
    .in('id', companyIds)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  console.log('[POST /api/companies] user:', user?.id, 'authError:', authError?.message);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = createCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Use service role client to bypass RLS
  const serviceClient = await createServiceClient();

  // 1. Create company
  const { data: company, error: companyError } = await serviceClient
    .from('companies')
    .insert(parsed.data)
    .select()
    .single();

  if (companyError) {
    console.log('[POST /api/companies] companyError:', companyError);
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }
  console.log('[POST /api/companies] company created:', company.id);

  // 2. Add current user as admin
  const { error: memberError } = await serviceClient
    .from('company_users')
    .insert({
      company_id: company.id,
      user_id: user.id,
      role: 'admin',
    });

  if (memberError) {
    // Rollback: delete the company
    await serviceClient.from('companies').delete().eq('id', company.id);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json(company, { status: 201 });
}
