import { anthropic } from '@/lib/claude/client';
import { getModelConfig, resolveModelConfig, DEFAULT_MODEL_ID } from '@/lib/models/config';
import type { Account, TransactionInput, ClassifyResult } from '@/types';

interface ConfirmedExample {
  merchant_name: string;
  mcc_code: string;
  amount: number;
  account_code: string;
  account_name: string;
}

function buildPrompts(
  transaction: TransactionInput,
  accounts: Account[],
  recentExamples: ConfirmedExample[]
) {
  const accountsList = accounts
    .filter((a) => a.is_active)
    .map((a) => ({
      code: a.code,
      name: a.name,
      category: a.category,
    }));

  let examplesText = '';
  if (recentExamples.length > 0) {
    examplesText =
      '\n\n과거 분류 사례:\n' +
      recentExamples
        .map(
          (ex) =>
            `- ${ex.merchant_name} (MCC:${ex.mcc_code}, ${ex.amount}원) → ${ex.account_code} ${ex.account_name}`
        )
        .join('\n');
  }

  const systemPrompt = `당신은 기업 회계 전문가입니다. 주어진 거래 내역을 분석하여 해당 회사의 계정과목 체계에 맞는 계정과목을 추천하세요.

반드시 아래 회사 계정과목 목록에서만 선택해야 합니다.

회사 계정과목 목록:
${JSON.stringify(accountsList, null, 2)}${examplesText}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:
{"account_code": "코드", "account_name": "계정과목명", "confidence": 0.0~1.0, "reason": "분류 사유"}`;

  const userPrompt = `다음 거래를 분류해주세요:
- 가맹점: ${transaction.merchant_name || '미상'}
- 업종코드(MCC): ${transaction.mcc_code || '미상'}
- 금액: ${transaction.amount.toLocaleString()}원
- 거래일: ${transaction.transaction_date || '미상'}
- 적요: ${transaction.description || '없음'}`;

  return { systemPrompt, userPrompt };
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
  selectedModelId?: string
): Promise<ClassifyResult> {
  const baseConfig = getModelConfig(selectedModelId || DEFAULT_MODEL_ID);
  if (!baseConfig) {
    throw new Error(`알 수 없는 모델: ${selectedModelId}`);
  }
  const modelConfig = resolveModelConfig(baseConfig);

  const { systemPrompt, userPrompt } = buildPrompts(
    transaction,
    accounts,
    recentExamples
  );

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
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    result = JSON.parse(jsonMatch[0]);
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
