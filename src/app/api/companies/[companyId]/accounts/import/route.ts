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

  const text = await file.text();
  const { data: rows, errors } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length > 0) {
    return NextResponse.json({ error: 'CSV 파싱 오류', details: errors }, { status: 400 });
  }

  const results = { imported: 0, skipped: 0, errors: [] as { row: number; error: string }[] };

  for (let i = 0; i < rows.length; i++) {
    const parsed = rowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      results.errors.push({ row: i + 1, error: '유효하지 않은 데이터' });
      results.skipped++;
      continue;
    }

    const { error } = await client
      .from('accounts')
      .insert({ ...parsed.data, company_id: companyId });

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
