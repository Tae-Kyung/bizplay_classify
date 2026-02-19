import type { ClassificationRule, Account, RuleConditions, TransactionInput } from '@/types';

export interface RuleMatchResult {
  matched: boolean;
  rule?: ClassificationRule;
  account?: Account;
}

export function matchTransaction(
  rules: (ClassificationRule & { account: Account })[],
  transaction: TransactionInput
): RuleMatchResult {
  // Rules should already be sorted by priority DESC
  for (const rule of rules) {
    if (!rule.is_active) continue;
    if (matchesConditions(rule.conditions, transaction)) {
      return { matched: true, rule, account: rule.account };
    }
  }
  return { matched: false };
}

function matchesConditions(conditions: RuleConditions, tx: TransactionInput): boolean {
  // All specified conditions must match (AND logic)

  if (conditions.mcc_codes && conditions.mcc_codes.length > 0) {
    if (!tx.mcc_code || !conditions.mcc_codes.includes(tx.mcc_code)) {
      return false;
    }
  }

  if (conditions.merchant_name_contains) {
    if (!tx.merchant_name) return false;
    const haystack = tx.merchant_name.toLowerCase();
    const needle = conditions.merchant_name_contains.toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }

  if (conditions.amount_min !== undefined) {
    if (tx.amount < conditions.amount_min) return false;
  }

  if (conditions.amount_max !== undefined) {
    if (tx.amount > conditions.amount_max) return false;
  }

  return true;
}
