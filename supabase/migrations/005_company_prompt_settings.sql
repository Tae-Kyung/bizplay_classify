-- ============================================
-- 005: Company Prompt Settings
-- 회사별 AI 분류 프롬프트 커스터마이즈
-- ============================================

CREATE TABLE company_prompt_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  system_prompt text NOT NULL DEFAULT '당신은 기업 회계 전문가입니다. 주어진 거래 내역을 분석하여 해당 회사의 계정과목 체계에 맞는 계정과목을 추천하세요.

반드시 아래 회사 계정과목 목록에서만 선택해야 합니다.

회사 계정과목 목록:
{{accounts_list}}{{examples}}',
  user_prompt text NOT NULL DEFAULT '다음 거래를 분류해주세요:
- 가맹점: {{merchant_name}}
- 업종코드(MCC): {{mcc_code}}
- 금액: {{amount}}
- 거래일: {{transaction_date}}
- 적요: {{description}}',
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id)
);

CREATE INDEX idx_prompt_settings_company ON company_prompt_settings(company_id);

-- 기존 회사에 기본 프롬프트 삽입
INSERT INTO company_prompt_settings (company_id)
SELECT id FROM companies
ON CONFLICT (company_id) DO NOTHING;

-- 신규 회사 생성 시 자동으로 기본 프롬프트 삽입
CREATE OR REPLACE FUNCTION handle_new_company_prompts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO company_prompt_settings (company_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_company_created_prompts
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION handle_new_company_prompts();

-- RLS
ALTER TABLE company_prompt_settings ENABLE ROW LEVEL SECURITY;

-- 읽기: 회사 멤버 전체
CREATE POLICY "prompt_settings_select" ON company_prompt_settings
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.get_my_company_ids()));

-- 쓰기: 회사 관리자만
CREATE POLICY "prompt_settings_insert" ON company_prompt_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "prompt_settings_update" ON company_prompt_settings
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "prompt_settings_delete" ON company_prompt_settings
  FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM company_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
