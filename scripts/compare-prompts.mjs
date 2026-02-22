/**
 * EXAONE 프롬프트 개선 전/후 비교 스크립트
 *
 * 기존 프롬프트 vs 개선 프롬프트로 EXAONE 분류 결과 비교
 * Claude 결과를 정답 기준으로 사용
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// .env.local 파싱
const envFile = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EXAONE_API_URL = env.EXAONE_API_URL;
const EXAONE_API_KEY = env.EXAONE_API_KEY;

// ── Supabase ──
async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

const companies = await supabaseGet('companies?select=id,name&limit=1');
const company = companies[0];
console.log(`회사: ${company.name}`);

const accounts = await supabaseGet(
  `accounts?company_id=eq.${company.id}&is_active=eq.true&select=code,name,category`
);

const examples = await supabaseGet(
  `classification_results?is_confirmed=eq.true&select=account:accounts!classification_results_account_id_fkey(code,name),transaction:transactions(merchant_name,mcc_code,amount)&order=created_at.desc&limit=10`
);
const recentExamples = (examples || [])
  .filter(ex => ex.transaction && ex.account)
  .map(ex => ({
    merchant_name: ex.transaction.merchant_name || '',
    mcc_code: ex.transaction.mcc_code || '',
    amount: Number(ex.transaction.amount),
    account_code: ex.account.code,
    account_name: ex.account.name,
  }));

// ── 프롬프트 정의 ──
const JSON_INSTRUCTION = `\n\n반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:\n{"account_code": "코드", "account_name": "계정과목명", "confidence": 0.0~1.0, "reason": "분류 사유"}`;

// 기존 프롬프트
const ORIGINAL_SYSTEM = `당신은 기업 회계 전문가입니다. 주어진 거래 내역을 분석하여 해당 회사의 계정과목 체계에 맞는 계정과목을 추천하세요.

반드시 아래 회사 계정과목 목록에서만 선택해야 합니다.

회사 계정과목 목록:
{{accounts_list}}{{examples}}`;

// 개선 프롬프트
const IMPROVED_SYSTEM = `당신은 한국 기업 회계 분류 전문가입니다. 법인카드 거래 내역을 분석하여 가장 적합한 계정과목을 선택하세요.

## 분류 규칙
1. 반드시 아래 계정과목 목록에서만 선택하세요.
2. 적요(description)를 가장 중요한 판단 기준으로 사용하세요.
3. MCC 코드는 보조 참고만 하고, 적요와 충돌하면 적요를 우선하세요.
4. 확신이 낮으면 confidence를 낮게 설정하세요.

## 주요 계정과목 분류 가이드
- 여비교통비: 출장 항공권, 숙박비, 택시비, 기차표 등 이동·출장 관련
- 접대비: 거래처 접대, 팀 회식, 식대(업무 관련 외식)
- 복리후생비: 직원 건강검진, 경조사비, 직원 복지 관련
- 회의비: 회의 중 다과, 커피, 회의실 관련 비용
- 통신비: 전화요금, 인터넷, 화상회의 솔루션 등 통신 관련 구독
- 세금과공과: 각종 세금, 면허세, 공과금, 4대보험 회사부담분
- 지급수수료: 은행 수수료, 카드 수수료, 외부 서비스 수수료
- 차량유지비: 주유비, 차량 수리, 주차비, 톨게이트
- 운반비: 택배비, 화물 운송료
- 도서인쇄비: 서적 구입, 신문/잡지 구독, 인쇄물 제작
- 사무용품비: 문구류, 사무용 소모품
- 소모품비: 사무용품 외 소모성 물품
- 외주용역비: 외부 업체 용역, 클라우드/IT 서비스, 소프트웨어 구독
- 급여: 직원 월급, 상여금 (거래처 결제와 무관)

## 회사 계정과목 목록
{{accounts_list}}{{examples}}`;

const ORIGINAL_USER = `다음 거래를 분류해주세요:
- 가맹점: {{merchant_name}}
- 업종코드(MCC): {{mcc_code}}
- 금액: {{amount}}
- 거래일: {{transaction_date}}
- 적요: {{description}}`;

const IMPROVED_USER = `아래 법인카드 거래를 분류해주세요. 적요를 주의 깊게 읽고 판단하세요.

가맹점: {{merchant_name}}
업종코드(MCC): {{mcc_code}}
금액: {{amount}}
거래일: {{transaction_date}}
적요: {{description}}`;

function buildSystem(template) {
  const accountsList = accounts.map(a => ({ code: a.code, name: a.name, category: a.category }));
  let examplesText = '';
  if (recentExamples.length > 0) {
    examplesText = '\n\n과거 분류 사례:\n' +
      recentExamples.map(ex => `- ${ex.merchant_name} (MCC:${ex.mcc_code}, ${ex.amount}원) → ${ex.account_code} ${ex.account_name}`).join('\n');
  }
  let s = template;
  s = s.replaceAll('{{accounts_list}}', JSON.stringify(accountsList, null, 2));
  s = s.replaceAll('{{examples}}', examplesText);
  s += JSON_INSTRUCTION;
  return s;
}

function buildUser(template, tx) {
  let u = template;
  u = u.replaceAll('{{merchant_name}}', tx.merchant_name || '미상');
  u = u.replaceAll('{{mcc_code}}', tx.mcc_code || '미상');
  u = u.replaceAll('{{amount}}', Number(tx.amount).toLocaleString() + '원');
  u = u.replaceAll('{{transaction_date}}', tx.transaction_date || '미상');
  u = u.replaceAll('{{description}}', tx.description || '없음');
  return u;
}

function parseResult(text) {
  try {
    const cb = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (cb) return JSON.parse(cb[1]);
    const jm = text.match(/\{[^{}]*\}/);
    if (jm) return JSON.parse(jm[0]);
  } catch {}
  return null;
}

async function callExaone(systemPrompt, userPrompt) {
  const res = await fetch(EXAONE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': EXAONE_API_KEY },
    body: JSON.stringify({
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`EXAONE ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Claude 정답 (이전 비교에서) ──
const claudeAnswers = {
  '스타벅스 강남점': '52700',
  '교보문고 광화문점': '52200',
  'GS칼텍스 서초주유소': '51900',
  '쿠팡 온라인': '52300',
  '대한항공': '51200',
  '롯데호텔 서울': '51200',
  '이마트 성수점': '52700',
  'SKT 통신요금': '51300',
  '삼성SDS': '53600',
  '네이버클라우드': '53600',
  'CJ대한통운': '52000',
  '서울시청': '51500',
  '우리은행': '52500',
  '강남세브란스': '51100',
  '피자헛 역삼점': '51400',
  '다이소 강남점': '52300',
  '한국경제신문': '52200',
  '리모트미팅': '51300',
  '현대오일뱅크': '51900',
  '카카오택시': '51200',
};

// ── CSV ──
const csvText = readFileSync(resolve(ROOT, 'data/sample-transactions.csv'), 'utf-8');
const lines = csvText.trim().split('\n');
const headers = lines[0].split(',');
const transactions = lines.slice(1).map(line => {
  const vals = line.split(',');
  const obj = {};
  headers.forEach((h, i) => obj[h.trim()] = vals[i]?.trim());
  return obj;
});

// ── 시스템 프롬프트 빌드 ──
const origSys = buildSystem(ORIGINAL_SYSTEM);
const imprSys = buildSystem(IMPROVED_SYSTEM);

console.log(`\n거래 ${transactions.length}건 × 2 프롬프트 = ${transactions.length * 2}회 EXAONE 호출\n`);

const results = [];

for (let i = 0; i < transactions.length; i++) {
  const tx = transactions[i];
  const origUsr = buildUser(ORIGINAL_USER, tx);
  const imprUsr = buildUser(IMPROVED_USER, tx);
  const expected = claudeAnswers[tx.merchant_name];

  process.stdout.write(`[${i + 1}/${transactions.length}] ${tx.merchant_name}...`);

  const [origRaw, imprRaw] = await Promise.allSettled([
    callExaone(origSys, origUsr),
    callExaone(imprSys, imprUsr),
  ]);

  const origResult = origRaw.status === 'fulfilled' ? parseResult(origRaw.value) : null;
  const imprResult = imprRaw.status === 'fulfilled' ? parseResult(imprRaw.value) : null;

  const origCorrect = origResult?.account_code === expected;
  const imprCorrect = imprResult?.account_code === expected;

  results.push({
    merchant: tx.merchant_name,
    amount: Number(tx.amount).toLocaleString(),
    description: tx.description,
    expected,
    orig_code: origResult?.account_code || 'ERR',
    orig_name: origResult?.account_name || '-',
    orig_conf: origResult?.confidence != null ? origResult.confidence.toFixed(2) : '-',
    orig_correct: origCorrect,
    impr_code: imprResult?.account_code || 'ERR',
    impr_name: imprResult?.account_name || '-',
    impr_conf: imprResult?.confidence != null ? imprResult.confidence.toFixed(2) : '-',
    impr_correct: imprCorrect,
    impr_reason: imprResult?.reason || '-',
  });

  const o = origCorrect ? '✓' : '✗';
  const n = imprCorrect ? '✓' : '✗';
  console.log(` 기존:${o}(${origResult?.account_code || '?'}) 개선:${n}(${imprResult?.account_code || '?'}) 정답:${expected}`);
}

// ── 통계 ──
const total = results.length;
const origCorrectCount = results.filter(r => r.orig_correct).length;
const imprCorrectCount = results.filter(r => r.impr_correct).length;

// ── Markdown ──
let md = `# EXAONE 프롬프트 개선 전/후 비교\n\n`;
md += `- **비교일**: ${new Date().toISOString().slice(0, 10)}\n`;
md += `- **모델**: EXAONE 3.5 7.8B\n`;
md += `- **정답 기준**: Claude Sonnet 4 분류 결과\n`;
md += `- **거래 건수**: ${total}건\n\n`;

md += `## 요약\n\n`;
md += `| 항목 | 기존 프롬프트 | 개선 프롬프트 |\n`;
md += `|------|:---:|:---:|\n`;
md += `| 정확도 | ${origCorrectCount}/${total} (${(origCorrectCount/total*100).toFixed(1)}%) | ${imprCorrectCount}/${total} (${(imprCorrectCount/total*100).toFixed(1)}%) |\n`;
md += `| 개선 | - | ${imprCorrectCount - origCorrectCount > 0 ? '+' : ''}${imprCorrectCount - origCorrectCount}건 |\n\n`;

md += `## 상세 비교\n\n`;
md += `| # | 가맹점 | 적요 | 정답 | 기존 EXAONE | | 개선 EXAONE | |\n`;
md += `|---|--------|------|------|-------------|---|-------------|---|\n`;

results.forEach((r, i) => {
  md += `| ${i + 1} | ${r.merchant} | ${r.description} | ${r.expected} | ${r.orig_code} ${r.orig_name} | ${r.orig_correct ? 'O' : 'X'} | ${r.impr_code} ${r.impr_name} | ${r.impr_correct ? 'O' : 'X'} |\n`;
});

md += `\n## 개선 프롬프트에서 변경된 점\n\n`;
md += `### 시스템 프롬프트 개선 사항\n`;
md += `1. **분류 규칙 명시**: 적요 우선, MCC 보조 참고\n`;
md += `2. **계정과목 가이드 추가**: 주요 계정과목별 분류 기준 예시 제공\n`;
md += `3. **급여 오분류 방지**: "급여는 직원 월급/상여금이며 거래처 결제와 무관" 명시\n\n`;
md += `### 사용자 프롬프트 개선 사항\n`;
md += `1. "법인카드 거래" 컨텍스트 명시\n`;
md += `2. "적요를 주의 깊게 읽고 판단하세요" 강조\n\n`;

md += `## 개선 프롬프트 분류 사유\n\n`;
results.forEach((r, i) => {
  const icon = r.impr_correct ? 'O' : 'X';
  md += `${i + 1}. **${r.merchant}** [${icon}] ${r.impr_code} ${r.impr_name} — ${r.impr_reason}\n`;
});

writeFileSync(resolve(ROOT, 'data/comparison.md'), md, 'utf-8');
console.log(`\n=== 결과 ===`);
console.log(`기존 프롬프트: ${origCorrectCount}/${total} (${(origCorrectCount/total*100).toFixed(1)}%)`);
console.log(`개선 프롬프트: ${imprCorrectCount}/${total} (${(imprCorrectCount/total*100).toFixed(1)}%)`);
console.log(`변화: ${imprCorrectCount - origCorrectCount > 0 ? '+' : ''}${imprCorrectCount - origCorrectCount}건`);
console.log(`\n결과 저장: data/comparison.md`);
