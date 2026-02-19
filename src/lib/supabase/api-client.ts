import { createClient, createServiceClient } from './server';

/**
 * API 라우트용 인증 + service client 헬퍼
 * - 인증된 사용자 정보를 가져옴
 * - service role client (RLS 우회)를 반환
 * - 회사 소속 여부를 검증
 */
export async function getAuthenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, client: null, error: 'Unauthorized' as const };

  const client = await createServiceClient();
  return { user, client, error: null };
}

export async function verifyCompanyMembership(
  userId: string,
  companyId: string
) {
  const client = await createServiceClient();
  const { data } = await client
    .from('company_users')
    .select('id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .single();

  return !!data;
}
