-- ============================================
-- 006: Add Model Settings to Company Prompt Settings
-- 회사별 기본 AI 모델 및 temperature 설정
-- ============================================

ALTER TABLE company_prompt_settings
  ADD COLUMN IF NOT EXISTS default_model_id text NOT NULL DEFAULT 'claude-sonnet',
  ADD COLUMN IF NOT EXISTS temperature numeric NOT NULL DEFAULT 0
    CHECK (temperature >= 0 AND temperature <= 1);
