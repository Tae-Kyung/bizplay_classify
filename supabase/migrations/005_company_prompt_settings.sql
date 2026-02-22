-- ============================================
-- 005: Company Prompt Settings
-- 회사별 AI 분류 프롬프트 커스터마이즈
-- ============================================

-- 기존 테이블/트리거/함수 정리 (재실행 안전)
DROP TRIGGER IF EXISTS on_company_created_prompts ON companies;
DROP FUNCTION IF EXISTS handle_new_company_prompts();
DROP TABLE IF EXISTS company_prompt_settings;

CREATE TABLE company_prompt_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  system_prompt text NOT NULL DEFAULT '당신은 한국 기업 회계 분류 전문가입니다. 법인카드 거래 내역을 분석하여 가장 적합한 계정과목을 선택하세요.

## 분류 규칙
1. 반드시 아래 계정과목 목록에서만 선택하세요.
2. 적요(description)를 가장 중요한 판단 기준으로 사용하세요.
3. MCC 코드는 보조 참고만 하고, 적요와 충돌하면 적요를 우선하세요.
4. 확신이 낮으면 confidence를 낮게 설정하세요.

## 주요 계정과목 분류 가이드
- 여비교통비: 출장 항공권, 숙박비, 택시비, 기차표 등 이동·출장 관련
- 접대비: 거래처 접대, 팀 회식, 식대(업무 관련 외식)
- 복리후생비: 직원 건강검진, 경조사비, 직원 복지 관련
- 회의비: 회의 중 다과, 커피, 회의실 관련 비용
- 통신비: 전화요금, 인터넷, 화상회의 솔루션 등 통신 관련 구독
- 세금과공과: 각종 세금, 면허세, 공과금, 4대보험 회사부담분
- 지급수수료: 은행 수수료, 카드 수수료, 외부 서비스 수수료
- 차량유지비: 주유비, 차량 수리, 주차비, 톨게이트
- 운반비: 택배비, 화물 운송료
- 도서인쇄비: 서적 구입, 신문/잡지 구독, 인쇄물 제작
- 사무용품비: 문구류, 사무용 소모품
- 소모품비: 사무용품 외 소모성 물품
- 외주용역비: 외부 업체 용역, 클라우드/IT 서비스, 소프트웨어 구독
- 급여: 직원 월급, 상여금 (거래처 결제와 무관)

## 회사 계정과목 목록
{{accounts_list}}{{examples}}',
  user_prompt text NOT NULL DEFAULT '아래 법인카드 거래를 분류해주세요. 적요를 주의 깊게 읽고 판단하세요.

가맹점: {{merchant_name}}
업종코드(MCC): {{mcc_code}}
금액: {{amount}}
거래일: {{transaction_date}}
적요: {{description}}',
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
