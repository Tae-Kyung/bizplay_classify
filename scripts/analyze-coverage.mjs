/**
 * 현재 룰 엔진이 sample-transactions.csv를 얼마나 커버하는지 분석
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const envFile = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

async function supabaseGet(path) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  return res.json();
}

const companies = await supabaseGet('companies?select=id&limit=1');
const companyId = companies[0].id;

const rules = await supabaseGet(
  `classification_rules?company_id=eq.${companyId}&is_active=eq.true&select=name,priority,conditions,account:accounts(code,name)&order=priority.desc`
);

const csvText = readFileSync(resolve(ROOT, 'data/sample-transactions.csv'), 'utf-8');
const lines = csvText.trim().split('\n');
const headers = lines[0].split(',');
const txs = lines.slice(1).map(line => {
  const vals = line.split(',');
  const obj = {};
  headers.forEach((h, i) => obj[h.trim()] = vals[i]?.trim());
  return obj;
});

// Claude 정답
const expected = {
  '스타벅스 강남점': { code: '52700', name: '회의비' },
  '교보문고 광화문점': { code: '52200', name: '도서인쇄비' },
  'GS칼텍스 서초주유소': { code: '51900', name: '차량유지비' },
  '쿠팡 온라인': { code: '52300', name: '사무용품비' },
  '대한항공': { code: '51200', name: '여비교통비' },
  '롯데호텔 서울': { code: '51200', name: '여비교통비' },
  '이마트 성수점': { code: '52700', name: '회의비' },
  'SKT 통신요금': { code: '51300', name: '통신비' },
  '삼성SDS': { code: '53600', name: '외주용역비' },
  '네이버클라우드': { code: '53600', name: '외주용역비' },
  'CJ대한통운': { code: '52000', name: '운반비' },
  '서울시청': { code: '51500', name: '세금과공과' },
  '우리은행': { code: '52500', name: '지급수수료' },
  '강남세브란스': { code: '51100', name: '복리후생비' },
  '피자헛 역삼점': { code: '51400', name: '접대비' },
  '다이소 강남점': { code: '52300', name: '사무용품비' },
  '한국경제신문': { code: '52200', name: '도서인쇄비' },
  '리모트미팅': { code: '51300', name: '통신비' },
  '현대오일뱅크': { code: '51900', name: '차량유지비' },
  '카카오택시': { code: '51200', name: '여비교통비' },
};

function matchRules(tx) {
  for (const rule of rules) {
    const c = rule.conditions;
    if (c.mcc_codes?.length > 0) {
      if (!tx.mcc_code || !c.mcc_codes.includes(tx.mcc_code)) continue;
    }
    if (c.merchant_name_contains) {
      if (!tx.merchant_name?.toLowerCase().includes(c.merchant_name_contains.toLowerCase())) continue;
    }
    if (c.amount_min !== undefined && Number(tx.amount) < c.amount_min) continue;
    if (c.amount_max !== undefined && Number(tx.amount) > c.amount_max) continue;
    return rule;
  }
  return null;
}

console.log('=== 룰 엔진 커버리지 분석 ===\n');
console.log(`등록된 룰: ${rules.length}개`);
console.log(`샘플 거래: ${txs.length}건\n`);

let ruleHit = 0, ruleCorrect = 0, ruleWrong = 0, noRule = 0;

for (const tx of txs) {
  const rule = matchRules(tx);
  const exp = expected[tx.merchant_name];

  if (rule) {
    ruleHit++;
    const correct = rule.account.code === exp.code;
    if (correct) ruleCorrect++;
    else ruleWrong++;
    const icon = correct ? 'O' : 'X';
    console.log(`[룰 ${icon}] ${tx.merchant_name} (MCC:${tx.mcc_code}) → 룰"${rule.name}" → ${rule.account.code} ${rule.account.name} ${!correct ? `(정답: ${exp.code} ${exp.name})` : ''}`);
  } else {
    noRule++;
    console.log(`[AI  ] ${tx.merchant_name} (MCC:${tx.mcc_code}) → 룰 없음 → AI로 넘김 (정답: ${exp.code} ${exp.name})`);
  }
}

console.log(`\n--- 요약 ---`);
console.log(`룰 매칭: ${ruleHit}건 (정확 ${ruleCorrect}, 오분류 ${ruleWrong})`);
console.log(`AI 필요: ${noRule}건`);
