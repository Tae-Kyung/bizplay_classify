-- ============================================
-- 001: Initial Schema for Bizplay Classify MVP
-- ============================================

-- 1. companies
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_number text UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- 2. company_users
CREATE TABLE company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- 3. accounts
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  category text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, code)
);

-- 4. classification_rules
CREATE TABLE classification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  priority int DEFAULT 0,
  conditions jsonb NOT NULL DEFAULT '{}',
  account_id uuid NOT NULL REFERENCES accounts(id),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 5. transactions
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  merchant_name text,
  mcc_code text,
  amount numeric NOT NULL,
  transaction_date date,
  description text,
  card_type text CHECK (card_type IN ('corporate', 'personal')),
  created_at timestamptz DEFAULT now()
);

-- 6. classification_results
CREATE TABLE classification_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  reason text,
  method text NOT NULL CHECK (method IN ('rule', 'ai')),
  is_confirmed boolean DEFAULT false,
  confirmed_account_id uuid REFERENCES accounts(id),
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_company_users_user ON company_users(user_id);
CREATE INDEX idx_company_users_company ON company_users(company_id);
CREATE INDEX idx_accounts_company ON accounts(company_id);
CREATE INDEX idx_accounts_company_active ON accounts(company_id) WHERE is_active = true;
CREATE INDEX idx_rules_company ON classification_rules(company_id);
CREATE INDEX idx_rules_company_priority ON classification_rules(company_id, priority DESC);
CREATE INDEX idx_transactions_company ON transactions(company_id);
CREATE INDEX idx_transactions_company_date ON transactions(company_id, transaction_date DESC);
CREATE INDEX idx_results_transaction ON classification_results(transaction_id);
CREATE INDEX idx_results_confirmed ON classification_results(transaction_id) WHERE is_confirmed = true;
