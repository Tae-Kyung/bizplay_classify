export * from './database';

export interface TransactionInput {
  merchant_name?: string;
  mcc_code?: string;
  amount: number;
  transaction_date?: string;
  description?: string;
  card_type?: 'corporate' | 'personal';
}

export interface ClassifyResult {
  account_code: string;
  account_name: string;
  confidence: number;
  reason: string;
}

export interface BatchClassifyResult {
  total: number;
  success: number;
  failed: number;
  rule_classified: number;
  ai_classified: number;
  errors: { row: number; error: string }[];
}

export interface DashboardStats {
  total_transactions: number;
  confirmed_count: number;
  confirmation_rate: number;
  rule_count: number;
  ai_count: number;
  avg_confidence: number;
  top_accounts: {
    code: string;
    name: string;
    count: number;
    total_amount: number;
  }[];
}

export interface PaginationParams {
  page: number;
  per_page: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}
