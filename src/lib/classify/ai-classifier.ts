import { anthropic } from '@/lib/claude/client';
import { getModelConfig, resolveModelConfig, DEFAULT_MODEL_ID } from '@/lib/models/config';
import { buildPrompts } from './prompt-templates';
import { createServiceClient } from '@/lib/supabase/server';
import type { Account, TransactionInput, ClassifyResult } from '@/types';

interface ConfirmedExample {
  merchant_name: string;
  mcc_code: string;
  amount: number;
  account_code: string;
  account_name: string;
}

/** DB에서 회사별 커스텀 프롬프트 조회 (없으면 null) */
export async function getCompanyPrompts(companyId: string) {
  const client = await createServiceClient();
  const { data } = await client
    .from('company_prompt_settings')
    .select('system_prompt, user_prompt')
    .eq('company_id', companyId)
    .single();

  return data ?? null;
}

async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  modelId: string
): Promise<string> {
  const message = await anthropic.messages.create({
    model: modelId,
    max_tokens: 1024,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude API');
  }
  return content.text;
}

async function callOpenAICompatible(
  systemPrompt: string,
  userPrompt: string,
  apiUrl: string,
  apiKeyHeader: string,
  apiKey: string
): Promise<string> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [apiKeyHeader]: apiKey,
    },
    body: JSON.stringify({
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 호출 실패 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('API 응답에서 텍스트를 찾을 수 없습니다');
  }
  return text;
}

export async function classifyWithAI(
  transaction: TransactionInput,
  accounts: Account[],
  recentExamples: ConfirmedExample[],
  companyId: string,
  selectedModelId?: string,
  preloadedPrompts?: { system_prompt: string | null; user_prompt: string | null } | null
): Promise<ClassifyResult> {
  const baseConfig = getModelConfig(selectedModelId || DEFAULT_MODEL_ID);
  if (!baseConfig) {
    throw new Error(`알 수 없는 모델: ${selectedModelId}`);
  }
  const modelConfig = resolveModelConfig(baseConfig);

  // 커스텀 프롬프트: preloaded가 있으면 사용, 없으면 DB 조회
  const customPrompts = preloadedPrompts !== undefined
    ? preloadedPrompts
    : await getCompanyPrompts(companyId);

  const { systemPrompt, userPrompt } = buildPrompts({
    transaction,
    accounts,
    recentExamples,
    customSystemPrompt: customPrompts?.system_prompt,
    customUserPrompt: customPrompts?.user_prompt,
  });

  let responseText: string;

  if (modelConfig.provider === 'anthropic') {
    responseText = await callAnthropic(
      systemPrompt,
      userPrompt,
      modelConfig.modelId || 'claude-sonnet-4-20250514'
    );
  } else {
    if (!modelConfig.apiUrl || !modelConfig.apiKey) {
      throw new Error('EXAONE API 설정이 없습니다. .env.local에 EXAONE_API_URL과 EXAONE_API_KEY를 설정하세요.');
    }
    responseText = await callOpenAICompatible(
      systemPrompt,
      userPrompt,
      modelConfig.apiUrl,
      modelConfig.apiKeyHeader || 'x-api-key',
      modelConfig.apiKey
    );
  }

  let result: ClassifyResult;
  try {
    // 1) Try extracting from first markdown code block
    const codeBlockMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      result = JSON.parse(codeBlockMatch[1]);
    } else {
      // 2) Fallback: find first flat JSON object
      const jsonMatch = responseText.match(/\{[^{}]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      result = JSON.parse(jsonMatch[0]);
    }
  } catch {
    throw new Error(`AI 응답 파싱 실패: ${responseText}`);
  }

  // Validate that account_code exists in the company's accounts
  const matchedAccount = accounts.find(
    (a) => a.code === result.account_code && a.is_active
  );
  if (!matchedAccount) {
    // Fallback: find closest match by name
    const fallback = accounts.find(
      (a) => a.name.includes(result.account_name) && a.is_active
    );
    if (fallback) {
      result.account_code = fallback.code;
      result.account_name = fallback.name;
    }
  }

  return result;
}
