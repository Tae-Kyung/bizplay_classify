/**
 * 룰에 걸리지 않는 8건만 Claude vs EXAONE(기존/개선) 비교
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const envFile = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EXAONE_API_URL = env.EXAONE_API_URL;
const EXAONE_API_KEY = env.EXAONE_API_KEY;
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

// ── 데이터 조회 ──
const companies = await supabaseGet('companies?select=id,name&limit=1');
const company = companies[0];
const accounts = await supabaseGet(
  `accounts?company_id=eq.${company.id}&is_active=eq.true&select=code,name,category`
);
const promptRows = await supabaseGet(
  `company_prompt_settings?company_id=eq.${company.id}&select=system_prompt,user_prompt&limit=1`
);
const dbPrompts = promptRows[0];

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

// ── 룰에 걸리지 않는 8건 ──
const aiOnlyTransactions = [
  { merchant_name: '쿠팡 온라인', mcc_code: '5411', amount: '25000', transaction_date: '2026-02-12', description: '사무용품 구매' },
  { merchant_name: '대한항공', mcc_code: '3000', amount: '450000', transaction_date: '2026-02-11', description: '출장 항공권' },
  { merchant_name: '롯데호텔 서울', mcc_code: '7011', amount: '180000', transaction_date: '2026-02-11', description: '출장 숙박' },
  { merchant_name: '이마트 성수점', mcc_code: '5411', amount: '45000', transaction_date: '2026-02-10', description: '회의실 다과 구매' },
  { merchant_name: '우리은행', mcc_code: '6012', amount: '5000', transaction_date: '2026-02-07', description: '이체 수수료' },
  { merchant_name: '강남세브란스', mcc_code: '8011', amount: '30000', transaction_date: '2026-02-06', description: '직원 건강검진' },
  { merchant_name: '한국경제신문', mcc_code: '4121', amount: '15000', transaction_date: '2026-02-03', description: '신문 구독료' },
  { merchant_name: '카카오택시', mcc_code: '4121', amount: '25000', transaction_date: '2026-01-31', description: '거래처 방문 택시비' },
];

// ── 프롬프트 ──
const JSON_INSTRUCTION = `\n\n반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:\n{"account_code": "코드", "account_name": "계정과목명", "confidence": 0.0~1.0, "reason": "분류 사유"}`;

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

const IMPROVED_USER = `아래 법인카드 거래를 분류해주세요. 적요를 주의 깊게 읽고 판단하세요.

가맹점: {{merchant_name}}
업종코드(MCC): {{mcc_code}}
금액: {{amount}}
거래일: {{transaction_date}}
적요: {{description}}`;

function buildVars() {
  const accountsList = accounts.map(a => ({ code: a.code, name: a.name, category: a.category }));
  let examplesText = '';
  if (recentExamples.length > 0) {
    examplesText = '\n\n과거 분류 사례:\n' +
      recentExamples.map(ex => `- ${ex.merchant_name} (MCC:${ex.mcc_code}, ${ex.amount}원) → ${ex.account_code} ${ex.account_name}`).join('\n');
  }
  return { accountsList: JSON.stringify(accountsList, null, 2), examplesText };
}

function buildSystem(template) {
  const { accountsList, examplesText } = buildVars();
  return template
    .replaceAll('{{accounts_list}}', accountsList)
    .replaceAll('{{examples}}', examplesText) + JSON_INSTRUCTION;
}

function buildUser(template, tx) {
  return template
    .replaceAll('{{merchant_name}}', tx.merchant_name || '미상')
    .replaceAll('{{mcc_code}}', tx.mcc_code || '미상')
    .replaceAll('{{amount}}', Number(tx.amount).toLocaleString() + '원')
    .replaceAll('{{transaction_date}}', tx.transaction_date || '미상')
    .replaceAll('{{description}}', tx.description || '없음');
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

// ── AI 호출 ──
const anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

async function callClaude(sys, usr) {
  const msg = await anthropicClient.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 1024, temperature: 0,
    system: sys, messages: [{ role: 'user', content: usr }],
  });
  return msg.content[0].text;
}

async function callExaone(sys, usr) {
  const res = await fetch(EXAONE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': EXAONE_API_KEY },
    body: JSON.stringify({ stream: false, messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }] }),
  });
  if (!res.ok) throw new Error(`EXAONE ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── 3가지 프롬프트 빌드 ──
// Claude: 개선 프롬프트
// EXAONE 기존: DB 프롬프트
// EXAONE 개선: 개선 프롬프트
const improvedSys = buildSystem(IMPROVED_SYSTEM);
const dbSys = buildSystem(dbPrompts.system_prompt);

console.log(`회사: ${company.name}`);
console.log(`룰 미매칭 ${aiOnlyTransactions.length}건 × 3모델 = ${aiOnlyTransactions.length * 3}회 호출\n`);

const results = [];

for (let i = 0; i < aiOnlyTransactions.length; i++) {
  const tx = aiOnlyTransactions[i];
  process.stdout.write(`[${i + 1}/${aiOnlyTransactions.length}] ${tx.merchant_name}...`);

  const improvedUsr = buildUser(IMPROVED_USER, tx);
  const dbUsr = buildUser(dbPrompts.user_prompt, tx);

  const [claudeRaw, exOrigRaw, exImprRaw] = await Promise.allSettled([
    callClaude(improvedSys, improvedUsr),
    callExaone(dbSys, dbUsr),
    callExaone(improvedSys, improvedUsr),
  ]);

  const claude = claudeRaw.status === 'fulfilled' ? parseResult(claudeRaw.value) : null;
  const exOrig = exOrigRaw.status === 'fulfilled' ? parseResult(exOrigRaw.value) : null;
  const exImpr = exImprRaw.status === 'fulfilled' ? parseResult(exImprRaw.value) : null;

  results.push({
    merchant: tx.merchant_name,
    mcc: tx.mcc_code,
    amount: Number(tx.amount).toLocaleString(),
    description: tx.description,
    claude_code: claude?.account_code || 'ERR',
    claude_name: claude?.account_name || '-',
    claude_conf: claude?.confidence != null ? claude.confidence.toFixed(2) : '-',
    claude_reason: claude?.reason || '-',
    exOrig_code: exOrig?.account_code || 'ERR',
    exOrig_name: exOrig?.account_name || '-',
    exOrig_conf: exOrig?.confidence != null ? exOrig.confidence.toFixed(2) : '-',
    exOrig_reason: exOrig?.reason || '-',
    exImpr_code: exImpr?.account_code || 'ERR',
    exImpr_name: exImpr?.account_name || '-',
    exImpr_conf: exImpr?.confidence != null ? exImpr.confidence.toFixed(2) : '-',
    exImpr_reason: exImpr?.reason || '-',
    claude_exImpr_match: claude?.account_code === exImpr?.account_code ? 'O' : 'X',
  });

  console.log(` Claude:${claude?.account_code} | EXAONE기존:${exOrig?.account_code} | EXAONE개선:${exImpr?.account_code}`);
}

// ── 일치율 ──
const claudeExOrigMatch = results.filter(r => r.claude_code === r.exOrig_code).length;
const claudeExImprMatch = results.filter(r => r.claude_exImpr_match === 'O').length;
const total = results.length;

// ── Markdown ──
let md = `# 룰 미매칭 거래 AI 분류 결과 비교\n\n`;
md += `- **비교일**: ${new Date().toISOString().slice(0, 10)}\n`;
md += `- **대상**: 룰 엔진에 매칭되지 않는 ${total}건\n`;
md += `- **비교 모델**: Claude Sonnet 4 / EXAONE 3.5 (기존 프롬프트) / EXAONE 3.5 (개선 프롬프트)\n\n`;

md += `## 요약\n\n`;
md += `| 비교 | 일치 건수 |\n`;
md += `|------|----------|\n`;
md += `| Claude vs EXAONE 기존 | ${claudeExOrigMatch}/${total} (${(claudeExOrigMatch/total*100).toFixed(0)}%) |\n`;
md += `| Claude vs EXAONE 개선 | ${claudeExImprMatch}/${total} (${(claudeExImprMatch/total*100).toFixed(0)}%) |\n\n`;

md += `## 상세 비교\n\n`;
md += `| # | 가맹점 | 적요 | Claude | EXAONE 기존 | EXAONE 개선 | Claude=개선 |\n`;
md += `|---|--------|------|--------|-------------|-------------|:-----------:|\n`;

results.forEach((r, i) => {
  md += `| ${i + 1} | ${r.merchant} | ${r.description} | ${r.claude_code} ${r.claude_name} (${r.claude_conf}) | ${r.exOrig_code} ${r.exOrig_name} (${r.exOrig_conf}) | ${r.exImpr_code} ${r.exImpr_name} (${r.exImpr_conf}) | ${r.claude_exImpr_match} |\n`;
});

md += `\n## 분류 사유 비교\n\n`;
results.forEach((r, i) => {
  md += `### ${i + 1}. ${r.merchant} (${r.amount}원) — ${r.description}\n`;
  md += `- **Claude**: ${r.claude_code} ${r.claude_name} — ${r.claude_reason}\n`;
  md += `- **EXAONE 기존**: ${r.exOrig_code} ${r.exOrig_name} — ${r.exOrig_reason}\n`;
  md += `- **EXAONE 개선**: ${r.exImpr_code} ${r.exImpr_name} — ${r.exImpr_reason}\n\n`;
});

writeFileSync(resolve(ROOT, 'data/comparison.md'), md, 'utf-8');
console.log(`\n=== 결과 ===`);
console.log(`Claude vs EXAONE 기존: ${claudeExOrigMatch}/${total}`);
console.log(`Claude vs EXAONE 개선: ${claudeExImprMatch}/${total}`);
console.log(`\n저장: data/comparison.md`);
