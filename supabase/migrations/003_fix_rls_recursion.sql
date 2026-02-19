-- ============================================
-- 003: Fix RLS infinite recursion
-- Drop all old policies, create helper function, re-create policies
-- ============================================

-- Drop all existing policies
DROP POLICY IF EXISTS "companies_select" ON companies;
DROP POLICY IF EXISTS "companies_insert" ON companies;
DROP POLICY IF EXISTS "company_users_select" ON company_users;
DROP POLICY IF EXISTS "company_users_insert" ON company_users;
DROP POLICY IF EXISTS "company_users_delete" ON company_users;
DROP POLICY IF EXISTS "accounts_select" ON accounts;
DROP POLICY IF EXISTS "accounts_insert" ON accounts;
DROP POLICY IF EXISTS "accounts_update" ON accounts;
DROP POLICY IF EXISTS "accounts_delete" ON accounts;
DROP POLICY IF EXISTS "rules_select" ON classification_rules;
DROP POLICY IF EXISTS "rules_insert" ON classification_rules;
DROP POLICY IF EXISTS "rules_update" ON classification_rules;
DROP POLICY IF EXISTS "rules_delete" ON classification_rules;
DROP POLICY IF EXISTS "transactions_select" ON transactions;
DROP POLICY IF EXISTS "transactions_insert" ON transactions;
DROP POLICY IF EXISTS "transactions_update" ON transactions;
DROP POLICY IF EXISTS "results_select" ON classification_results;
DROP POLICY IF EXISTS "results_insert" ON classification_results;
DROP POLICY IF EXISTS "results_update" ON classification_results;

-- Drop old trigger/function
DROP TRIGGER IF EXISTS on_company_created ON companies;
DROP FUNCTION IF EXISTS handle_new_company();

-- ============================================
-- Helper function: SECURITY DEFINER bypasses RLS
-- ============================================
CREATE OR REPLACE FUNCTION public.get_my_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT company_id FROM company_users WHERE user_id = auth.uid();
$$;

-- ============================================
-- companies
-- ============================================
CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (id IN (SELECT public.get_my_company_ids()));

CREATE POLICY "companies_insert" ON companies
  FOR INSERT WITH CHECK (true);

-- ============================================
-- company_users: direct user_id check (no self-reference)
-- ============================================
CREATE POLICY "company_users_select" ON company_users
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "company_users_insert" ON company_users
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "company_users_delete" ON company_users
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- accounts
-- ============================================
CREATE POLICY "accounts_select" ON accounts
  FOR SELECT USING (company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "accounts_insert" ON accounts
  FOR INSERT WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "accounts_update" ON accounts
  FOR UPDATE USING (company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "accounts_delete" ON accounts
  FOR DELETE USING (company_id IN (SELECT public.get_my_company_ids()));

-- ============================================
-- classification_rules
-- ============================================
CREATE POLICY "rules_select" ON classification_rules
  FOR SELECT USING (company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "rules_insert" ON classification_rules
  FOR INSERT WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "rules_update" ON classification_rules
  FOR UPDATE USING (company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "rules_delete" ON classification_rules
  FOR DELETE USING (company_id IN (SELECT public.get_my_company_ids()));

-- ============================================
-- transactions
-- ============================================
CREATE POLICY "transactions_select" ON transactions
  FOR SELECT USING (company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "transactions_insert" ON transactions
  FOR INSERT WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "transactions_update" ON transactions
  FOR UPDATE USING (company_id IN (SELECT public.get_my_company_ids()));

-- ============================================
-- classification_results
-- ============================================
CREATE POLICY "results_select" ON classification_results
  FOR SELECT USING (
    transaction_id IN (SELECT id FROM transactions WHERE company_id IN (SELECT public.get_my_company_ids()))
  );
CREATE POLICY "results_insert" ON classification_results
  FOR INSERT WITH CHECK (
    transaction_id IN (SELECT id FROM transactions WHERE company_id IN (SELECT public.get_my_company_ids()))
  );
CREATE POLICY "results_update" ON classification_results
  FOR UPDATE USING (
    transaction_id IN (SELECT id FROM transactions WHERE company_id IN (SELECT public.get_my_company_ids()))
  );

-- ============================================
-- Trigger: auto-add creator as admin (SECURITY DEFINER)
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_company()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO company_users (company_id, user_id, role)
  VALUES (NEW.id, auth.uid(), 'admin');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_company_created
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION handle_new_company();
