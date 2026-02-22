/**
 * 두 AI 모델(Claude Sonnet, EXAONE)의 분류 결과 비교 스크립트
 *
 * 사용법: node scripts/compare-models.mjs
 *
 * .env.local에서 환경변수를 읽어 Supabase + AI API를 직접 호출합니다.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

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
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;

// ── Supabase 헬퍼 ──
async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

// ── 회사 ID + 계정과목 + 프롬프트 조회 ──
const companies = await supabaseGet('companies?select=id,name&limit=1');
if (!companies.length) { console.error('회사 없음'); process.exit(1); }
const company = companies[0];
console.log(`회사: ${company.name} (${company.id})`);

const accounts = await supabaseGet(
  `accounts?company_id=eq.${company.id}&is_active=eq.true&select=code,name,category`
);
console.log(`계정과목: ${accounts.length}개`);

const promptRows = await supabaseGet(
  `company_prompt_settings?company_id=eq.${company.id}&select=system_prompt,user_prompt&limit=1`
);
const prompts = promptRows[0];
if (!prompts) { console.error('프롬프트 설정 없음'); process.exit(1); }

// 확정 사례 조회
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

// ── 프롬프트 빌드 ──
const JSON_FORMAT_INSTRUCTION = `\n\n반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:\n{"account_code": "코드", "account_name": "계정과목명", "confidence": 0.0~1.0, "reason": "분류 사유"}`;

function buildPrompts(tx) {
  const accountsList = accounts.map(a => ({ code: a.code, name: a.name, category: a.category }));

  let examplesText = '';
  if (recentExamples.length > 0) {
    examplesText = '\n\n과거 분류 사례:\n' +
      recentExamples.map(ex => `- ${ex.merchant_name} (MCC:${ex.mcc_code}, ${ex.amount}원) → ${ex.account_code} ${ex.account_name}`).join('\n');
  }

  let sys = prompts.system_prompt;
  sys = sys.replaceAll('{{accounts_list}}', JSON.stringify(accountsList, null, 2));
  sys = sys.replaceAll('{{examples}}', examplesText);
  sys += JSON_FORMAT_INSTRUCTION;

  let usr = prompts.user_prompt;
  usr = usr.replaceAll('{{merchant_name}}', tx.merchant_name || '미상');
  usr = usr.replaceAll('{{mcc_code}}', tx.mcc_code || '미상');
  usr = usr.replaceAll('{{amount}}', Number(tx.amount).toLocaleString() + '원');
  usr = usr.replaceAll('{{transaction_date}}', tx.transaction_date || '미상');
  usr = usr.replaceAll('{{description}}', tx.description || '없음');

  return { systemPrompt: sys, userPrompt: usr };
}

function parseResult(text) {
  try {
    const codeBlock = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlock) return JSON.parse(codeBlock[1]);
    const jsonMatch = text.match(/\{[^{}]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {}
  return null;
}

// ── AI 호출 ──
const anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

async function callClaude(systemPrompt, userPrompt) {
  const msg = await anthropicClient.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  return msg.content[0].text;
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
  if (!res.ok) throw new Error(`EXAONE ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── CSV 파싱 ──
const csvText = readFileSync(resolve(ROOT, 'data/sample-transactions.csv'), 'utf-8');
const lines = csvText.trim().split('\n');
const headers = lines[0].split(',');
const transactions = lines.slice(1).map(line => {
  const vals = line.split(',');
  const obj = {};
  headers.forEach((h, i) => obj[h.trim()] = vals[i]?.trim());
  return obj;
});

console.log(`\n거래 ${transactions.length}건 분류 시작...\n`);

// ── 분류 실행 ──
const results = [];

for (let i = 0; i < transactions.length; i++) {
  const tx = transactions[i];
  const { systemPrompt, userPrompt } = buildPrompts(tx);

  process.stdout.write(`[${i + 1}/${transactions.length}] ${tx.merchant_name}...`);

  let claudeResult, exaoneResult;

  // 두 모델 병렬 호출
  const [claudeRaw, exaoneRaw] = await Promise.allSettled([
    callClaude(systemPrompt, userPrompt),
    callExaone(systemPrompt, userPrompt),
  ]);

  if (claudeRaw.status === 'fulfilled') {
    claudeResult = parseResult(claudeRaw.value);
  } else {
    console.error(` Claude 실패: ${claudeRaw.reason.message}`);
    claudeResult = null;
  }

  if (exaoneRaw.status === 'fulfilled') {
    exaoneResult = parseResult(exaoneRaw.value);
  } else {
    console.error(` EXAONE 실패: ${exaoneRaw.reason.message}`);
    exaoneResult = null;
  }

  const match = claudeResult && exaoneResult && claudeResult.account_code === exaoneResult.account_code;

  results.push({
    merchant: tx.merchant_name,
    amount: Number(tx.amount).toLocaleString(),
    description: tx.description,
    claude_code: claudeResult?.account_code || 'ERROR',
    claude_name: claudeResult?.account_name || '-',
    claude_conf: claudeResult?.confidence != null ? claudeResult.confidence.toFixed(2) : '-',
    claude_reason: claudeResult?.reason || '-',
    exaone_code: exaoneResult?.account_code || 'ERROR',
    exaone_name: exaoneResult?.account_name || '-',
    exaone_conf: exaoneResult?.confidence != null ? exaoneResult.confidence.toFixed(2) : '-',
    exaone_reason: exaoneResult?.reason || '-',
    match: match ? 'O' : 'X',
  });

  console.log(` ${match ? '✓ 일치' : '✗ 불일치'} (Claude: ${claudeResult?.account_code || '?'} / EXAONE: ${exaoneResult?.account_code || '?'})`);
}

// ── 통계 ──
const total = results.length;
const matched = results.filter(r => r.match === 'O').length;

// ── Markdown 생성 ──
let md = `# AI 모델 분류 결과 비교\n\n`;
md += `- **비교일**: ${new Date().toISOString().slice(0, 10)}\n`;
md += `- **회사**: ${company.name}\n`;
md += `- **거래 건수**: ${total}건\n`;
md += `- **일치율**: ${matched}/${total} (${(matched / total * 100).toFixed(1)}%)\n`;
md += `- **모델**: Claude Sonnet 4 vs EXAONE 3.5 7.8B\n\n`;

md += `## 분류 결과\n\n`;
md += `| # | 가맹점 | 금액 | 적요 | Claude 계정 | Claude 신뢰도 | EXAONE 계정 | EXAONE 신뢰도 | 일치 |\n`;
md += `|---|--------|------|------|-------------|--------------|-------------|--------------|------|\n`;

results.forEach((r, i) => {
  md += `| ${i + 1} | ${r.merchant} | ${r.amount}원 | ${r.description} | ${r.claude_code} ${r.claude_name} | ${r.claude_conf} | ${r.exaone_code} ${r.exaone_name} | ${r.exaone_conf} | ${r.match} |\n`;
});

md += `\n## 분류 사유 상세\n\n`;
results.forEach((r, i) => {
  md += `### ${i + 1}. ${r.merchant} (${r.amount}원)\n`;
  md += `- **Claude**: ${r.claude_code} ${r.claude_name} — ${r.claude_reason}\n`;
  md += `- **EXAONE**: ${r.exaone_code} ${r.exaone_name} — ${r.exaone_reason}\n\n`;
});

writeFileSync(resolve(ROOT, 'data/comparison.md'), md, 'utf-8');
console.log(`\n결과 저장: data/comparison.md`);
console.log(`일치율: ${matched}/${total} (${(matched / total * 100).toFixed(1)}%)`);
