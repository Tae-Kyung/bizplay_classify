import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedClient,
  verifyCompanyMembership,
  verifyCompanyAdmin,
} from '@/lib/supabase/api-client';
import { z } from 'zod';

const updateSchema = z.object({
  system_prompt: z.string().min(1, '시스템 프롬프트는 필수입니다'),
  user_prompt: z.string().min(1, '사용자 프롬프트는 필수입니다'),
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

  const { data } = await client
    .from('company_prompt_settings')
    .select('*')
    .eq('company_id', companyId)
    .single();

  // 관리자 여부도 함께 반환
  const isAdmin = await verifyCompanyAdmin(user.id, companyId);

  return NextResponse.json({
    settings: data,
    is_admin: isAdmin,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const { user, client } = await getAuthenticatedClient();
  if (!user || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await verifyCompanyAdmin(user.id, companyId)))
    return NextResponse.json({ error: '관리자만 프롬프트를 수정할 수 있습니다' }, { status: 403 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { system_prompt, user_prompt } = parsed.data;

  // upsert: 없으면 insert, 있으면 update
  const { data, error } = await client
    .from('company_prompt_settings')
    .upsert(
      {
        company_id: companyId,
        system_prompt,
        user_prompt,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
