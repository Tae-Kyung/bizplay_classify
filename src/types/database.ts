export interface Company {
  id: string;
  name: string;
  business_number: string | null;
  created_at: string;
}

export interface CompanyUser {
  id: string;
  company_id: string;
  user_id: string;
  role: 'admin' | 'member';
  created_at: string;
}

export interface Account {
  id: string;
  company_id: string;
  code: string;
  name: string;
  category: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ClassificationRule {
  id: string;
  company_id: string;
  name: string;
  priority: number;
  conditions: RuleConditions;
  account_id: string;
  is_active: boolean;
  created_at: string;
}

export interface RuleConditions {
  mcc_codes?: string[];
  merchant_name_contains?: string;
  amount_min?: number;
  amount_max?: number;
}

export interface Transaction {
  id: string;
  company_id: string;
  user_id: string;
  merchant_name: string | null;
  mcc_code: string | null;
  amount: number;
  transaction_date: string | null;
  description: string | null;
  card_type: 'corporate' | 'personal' | null;
  created_at: string;
}

export interface ClassificationResult {
  id: string;
  transaction_id: string;
  account_id: string;
  confidence: number | null;
  reason: string | null;
  method: 'rule' | 'ai';
  is_confirmed: boolean;
  confirmed_account_id: string | null;
  created_at: string;
}

export interface CompanyPromptSettings {
  id: string;
  company_id: string;
  system_prompt: string;
  user_prompt: string;
  updated_by: string | null;
  updated_at: string;
}

// Extended types with joins
export interface ClassificationResultWithAccount extends ClassificationResult {
  account: Account;
  confirmed_account?: Account | null;
}

export interface TransactionWithClassification extends Transaction {
  classification_results: ClassificationResultWithAccount[];
}
