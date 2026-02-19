import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient, verifyCompanyMembership } from '@/lib/supabase/api-client';

const SAMPLE_RULES = [
  {
    name: '카페/커피숍 → 복리후생비',
    priority: 10,
    conditions: { mcc_codes: ['5814', '5812'], merchant_name_contains: '스타벅스' },
    account_code: '51100',
  },
  {
    name: '음식점(회식) → 접대비',
    priority: 9,
    conditions: { mcc_codes: ['5812', '5813'], amount_min: 50000 },
    account_code: '51400',
  },
  {
    name: '주유소 → 차량유지비',
    priority: 8,
    conditions: { mcc_codes: ['5541', '5542'] },
    account_code: '51900',
  },
  {
    name: '항공사 → 여비교통비',
    priority: 7,
    conditions: { mcc_codes: ['3000', '3001', '3002', '4511'] },
    account_code: '51200',
  },
  {
    name: '호텔/숙박 → 여비교통비',
    priority: 7,
    conditions: { mcc_codes: ['7011', '7012'] },
    account_code: '51200',
  },
  {
    name: '택시 → 여비교통비',
    priority: 6,
    conditions: { mcc_codes: ['4121'] },
    account_code: '51200',
  },
  {
    name: '서점/도서 → 도서인쇄비',
    priority: 5,
    conditions: { mcc_codes: ['5942', '5192'] },
    account_code: '52200',
  },
  {
    name: '사무용품점 → 사무용품비',
    priority: 5,
    conditions: { mcc_codes: ['5943', '5111'] },
    account_code: '52300',
  },
  {
    name: '다이소/소모품 → 소모품비',
    priority: 4,
    conditions: { mcc_codes: ['5331'], merchant_name_contains: '다이소' },
    account_code: '52400',
  },
  {
    name: '통신요금 → 통신비',
    priority: 4,
    conditions: { mcc_codes: ['4814', '4812'] },
    account_code: '51300',
  },
  {
    name: 'IT/소프트웨어 → 지급수수료',
    priority: 3,
    conditions: { mcc_codes: ['7372', '7379'] },
    account_code: '52500',
  },
  {
    name: '택배/운송 → 운반비',
    priority: 3,
    conditions: { mcc_codes: ['4215', '4214'] },
    account_code: '52000',
  },
  {
    name: '소액 카페 → 회의비',
    priority: 11,
    conditions: { mcc_codes: ['5814'], amount_max: 30000 },
    account_code: '52700',
  },
  {
    name: '병원/의료 → 복리후생비',
    priority: 2,
    conditions: { mcc_codes: ['8011', '8021', '8031'] },
    account_code: '51100',
  },
  {
    name: '관공서/세금 → 세금과공과',
    priority: 2,
    conditions: { mcc_codes: ['9311', '9222'] },
    account_code: '51500',
  },
];

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const { user, client } = await getAuthenticatedClient();
  if (!user || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await verifyCompanyMembership(user.id, companyId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Get existing accounts
  const { data: accounts } = await client
    .from('accounts')
    .select('id, code')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (!accounts || accounts.length === 0) {
    return NextResponse.json(
      { error: '계정과목을 먼저 등록하세요 (CSV Import 권장)' },
      { status: 400 }
    );
  }

  const codeToId = new Map(accounts.map((a) => [a.code, a.id]));

  let created = 0;
  let skipped = 0;

  for (const rule of SAMPLE_RULES) {
    const accountId = codeToId.get(rule.account_code);
    if (!accountId) {
      skipped++;
      continue;
    }

    const { error } = await client.from('classification_rules').insert({
      company_id: companyId,
      name: rule.name,
      priority: rule.priority,
      conditions: rule.conditions,
      account_id: accountId,
      is_active: true,
    });

    if (error) {
      skipped++;
    } else {
      created++;
    }
  }

  return NextResponse.json({ created, skipped, total: SAMPLE_RULES.length });
}
