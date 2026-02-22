import { JSON_FORMAT_INSTRUCTION } from './prompt-defaults';
import type { Account, TransactionInput } from '@/types';

interface ConfirmedExample {
  merchant_name: string;
  mcc_code: string;
  amount: number;
  account_code: string;
  account_name: string;
}

interface BuildPromptsParams {
  transaction: TransactionInput;
  accounts: Account[];
  recentExamples: ConfirmedExample[];
  systemPromptTemplate: string;
  userPromptTemplate: string;
}

/**
 * 플레이스홀더를 실제 값으로 치환
 */
function resolveTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

/**
 * 시스템/사용자 프롬프트를 빌드
 * - DB에 저장된 프롬프트 템플릿을 사용
 * - JSON 응답 형식 지시문은 항상 시스템 프롬프트 끝에 자동 append
 */
export function buildPrompts({
  transaction,
  accounts,
  recentExamples,
  systemPromptTemplate,
  userPromptTemplate,
}: BuildPromptsParams): { systemPrompt: string; userPrompt: string } {
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

  // 시스템 프롬프트 변수
  const systemVars: Record<string, string> = {
    accounts_list: JSON.stringify(accountsList, null, 2),
    examples: examplesText,
  };

  // 사용자 프롬프트 변수
  const userVars: Record<string, string> = {
    merchant_name: transaction.merchant_name || '미상',
    mcc_code: transaction.mcc_code || '미상',
    amount: transaction.amount.toLocaleString() + '원',
    transaction_date: transaction.transaction_date || '미상',
    description: transaction.description || '없음',
  };

  const systemPrompt = resolveTemplate(systemPromptTemplate, systemVars) + JSON_FORMAT_INSTRUCTION;
  const userPrompt = resolveTemplate(userPromptTemplate, userVars);

  return { systemPrompt, userPrompt };
}
