import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient, verifyCompanyMembership } from '@/lib/supabase/api-client';
import Papa from 'papaparse';
import { z } from 'zod';

const rowSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
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

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'CSV 파일을 업로드하세요' }, { status: 400 });
  }

  const text = (await file.text()).replace(/^\uFEFF/, '');
  const { data: rows, errors } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length > 0) {
    return NextResponse.json({ error: 'CSV 파싱 오류', details: errors }, { status: 400 });
  }

  const results = { imported: 0, skipped: 0, errors: [] as { row: number; error: string }[] };

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] as Record<string, string>;
    // 한국어 컬럼명 매핑 지원 (용도코드→code, 용도명→name, 사용여부→is_active)
    const normalized: Record<string, unknown> = {
      code: raw['code'] ?? raw['용도코드'],
      name: raw['name'] ?? raw['용도명'],
      category: raw['category'] ?? raw['분류'] ?? undefined,
    };
    const isActive = raw['사용여부'];
    if (isActive !== undefined) {
      (normalized as Record<string, unknown>)['is_active'] = isActive.trim().toUpperCase() === 'Y';
    }

    const parsed = rowSchema.safeParse(normalized);
    if (!parsed.success) {
      results.errors.push({ row: i + 1, error: '유효하지 않은 데이터' });
      results.skipped++;
      continue;
    }

    const insertData: Record<string, unknown> = { ...parsed.data, company_id: companyId };
    if ('is_active' in normalized) insertData['is_active'] = normalized['is_active'];

    const { error } = await client
      .from('accounts')
      .insert(insertData);

    if (error) {
      if (error.code === '23505') {
        results.skipped++;
        results.errors.push({ row: i + 1, error: `중복 코드: ${parsed.data.code}` });
      } else {
        results.errors.push({ row: i + 1, error: error.message });
        results.skipped++;
      }
    } else {
      results.imported++;
    }
  }

  return NextResponse.json(results);
}
