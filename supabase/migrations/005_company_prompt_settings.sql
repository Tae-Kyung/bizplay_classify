-- ============================================
-- 005: Company Prompt Settings
-- 회사별 AI 분류 프롬프트 커스터마이즈
-- ============================================

CREATE TABLE company_prompt_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  system_prompt text,       -- NULL = 기본 프롬프트 사용
  user_prompt text,         -- NULL = 기본 프롬프트 사용
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id)
);

CREATE INDEX idx_prompt_settings_company ON company_prompt_settings(company_id);

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
