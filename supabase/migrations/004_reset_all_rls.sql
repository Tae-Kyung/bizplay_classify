-- ============================================
-- 004: RESET ALL RLS - 한 번에 실행
-- Supabase SQL Editor에서 이 파일 전체를 복사하여 실행하세요
-- ============================================

-- 1) 모든 기존 정책 제거 (에러 무시)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 2) 기존 트리거/함수 제거
DROP TRIGGER IF EXISTS on_company_created ON companies;
DROP FUNCTION IF EXISTS handle_new_company();
DROP FUNCTION IF EXISTS public.get_my_company_ids();

-- 3) RLS 활성화 확인
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_results ENABLE ROW LEVEL SECURITY;

-- 4) 헬퍼 함수: SECURITY DEFINER로 RLS 우회
CREATE OR REPLACE FUNCTION public.get_my_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT company_id FROM company_users WHERE user_id = auth.uid();
$$;

-- 5) companies 정책
CREATE POLICY "companies_select" ON companies
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.get_my_company_ids()));

CREATE POLICY "companies_insert" ON companies
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 6) company_users 정책 (자기 행만 SELECT = 재귀 없음)
CREATE POLICY "company_users_select" ON company_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "company_users_insert" ON company_users
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "company_users_delete" ON company_users
  FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 7) accounts 정책
CREATE POLICY "accounts_all" ON accounts
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_my_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

-- 8) classification_rules 정책
CREATE POLICY "rules_all" ON classification_rules
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_my_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

-- 9) transactions 정책
CREATE POLICY "transactions_all" ON transactions
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_my_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

-- 10) classification_results 정책
CREATE POLICY "results_all" ON classification_results
  FOR ALL TO authenticated
  USING (
    transaction_id IN (
      SELECT id FROM transactions
      WHERE company_id IN (SELECT public.get_my_company_ids())
    )
  )
  WITH CHECK (
    transaction_id IN (
      SELECT id FROM transactions
      WHERE company_id IN (SELECT public.get_my_company_ids())
    )
  );

-- 11) 트리거: 회사 생성 시 자동 admin 추가
CREATE OR REPLACE FUNCTION handle_new_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO company_users (company_id, user_id, role)
  VALUES (NEW.id, auth.uid(), 'admin');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_company_created
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION handle_new_company();
