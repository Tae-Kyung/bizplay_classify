import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedClient,
  verifyCompanyAdmin,
} from '@/lib/supabase/api-client';
import { anthropic } from '@/lib/claude/client';
import { z } from 'zod';

const requestSchema = z.object({
  limit: z.number().int().min(10).max(500).default(100),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const { user, client } = await getAuthenticatedClient();
  if (!user || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await verifyCompanyAdmin(user.id, companyId)))
    return NextResponse.json({ error: '관리자만 사용할 수 있습니다' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);
  const limit = parsed.success ? parsed.data.limit : 100;

  // 1. 현재 시스템 프롬프트 조회
  const { data: settings } = await client
    .from('company_prompt_settings')
    .select('system_prompt')
    .eq('company_id', companyId)
    .single();

  if (!settings) {
    return NextResponse.json({ error: '프롬프트 설정을 찾을 수 없습니다' }, { status: 404 });
  }

  // 2. 확정된 분류 결과 조회
  const { data: confirmed } = await client
    .from('classification_results')
    .select(`
      confidence,
      method,
      reason,
      account:accounts!classification_results_account_id_fkey(code, name),
      confirmed_account:accounts!classification_results_confirmed_account_id_fkey(code, name),
      transaction:transactions(merchant_name, mcc_code, amount, description)
    `)
    .eq('is_confirmed', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!confirmed || confirmed.length === 0) {
    return NextResponse.json(
      { error: '확정된 거래 내역이 없습니다. 먼저 거래를 분류하고 확정해주세요.' },
      { status: 400 }
    );
  }

  // 3. 중복 제거 (merchant_name + mcc_code + account 조합 기준)
  const seen = new Set<string>();
  const uniqueExamples = confirmed.filter((item: any) => {
    if (!item.transaction || !item.account) return false;
    const finalAccount = item.confirmed_account || item.account;
    const key = `${item.transaction.merchant_name}|${item.transaction.mcc_code}|${finalAccount.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 4. 계정과목 목록 조회
  const { data: accounts } = await client
    .from('accounts')
    .select('code, name')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('code');

  // 5. 거래 패턴 요약 구성
  const exampleLines = uniqueExamples.map((item: any) => {
    const finalAccount = item.confirmed_account || item.account;
    const wasCorreected = item.confirmed_account ? ' (수정됨)' : '';
    return `- 가맹점: ${item.transaction.merchant_name}, MCC: ${item.transaction.mcc_code || '없음'}, 금액: ${item.transaction.amount}원, 적요: ${item.transaction.description || '없음'} → ${finalAccount.code} ${finalAccount.name}${wasCorreected}`;
  });

  const accountList = (accounts || []).map((a: any) => `${a.code}: ${a.name}`).join('\n');

  // 6. Claude에 분석 요청
  const metaPrompt = `당신은 AI 프롬프트 엔지니어링 전문가입니다. 한국 기업의 법인카드 거래 분류용 시스템 프롬프트를 개선해야 합니다.

## 현재 시스템 프롬프트
\`\`\`
${settings.system_prompt}
\`\`\`

## 회사 계정과목 목록
${accountList}

## 확정된 거래 내역 (${uniqueExamples.length}건, 중복 제거 후)
${exampleLines.join('\n')}

## 지시사항
위 확정된 거래 내역의 패턴을 분석하여 시스템 프롬프트를 개선하세요.

개선 방향:
1. 실제 거래 패턴에서 발견된 분류 규칙을 반영하세요 (예: 특정 가맹점 유형 → 특정 계정과목)
2. 수정 확정된 건이 있다면, 기존 분류가 틀렸던 패턴을 파악하여 가이드에 반영하세요
3. 기존 프롬프트의 구조(## 헤더, 플레이스홀더 등)는 유지하세요
4. {{accounts_list}}와 {{examples}} 플레이스홀더는 반드시 유지하세요 — 런타임에 실제 값으로 치환됩니다
5. 불필요한 일반론은 줄이고, 이 회사에 특화된 구체적인 가이드를 추가하세요

반드시 아래 JSON 형식으로만 응답하세요:
{"suggested_prompt": "개선된 시스템 프롬프트 전문", "reasoning": "주요 변경 사항 요약 (한국어, 3-5줄)"}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: 'user', content: metaPrompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    let result: { suggested_prompt: string; reasoning: string };
    try {
      const codeBlockMatch = content.text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (codeBlockMatch) {
        result = JSON.parse(codeBlockMatch[1]);
      } else {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found');
        result = JSON.parse(jsonMatch[0]);
      }
    } catch {
      throw new Error('AI 응답 파싱 실패');
    }

    return NextResponse.json({
      suggested_prompt: result.suggested_prompt,
      reasoning: result.reasoning,
      analyzed_count: uniqueExamples.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `프롬프트 개선 실패: ${err.message}` },
      { status: 500 }
    );
  }
}
