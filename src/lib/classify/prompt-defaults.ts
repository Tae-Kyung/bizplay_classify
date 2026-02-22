/**
 * 기본 프롬프트 상수 + 플레이스홀더 정의
 * 클라이언트에서도 import 가능 (설정 페이지 UI용)
 */

export const DEFAULT_SYSTEM_PROMPT = `당신은 기업 회계 전문가입니다. 주어진 거래 내역을 분석하여 해당 회사의 계정과목 체계에 맞는 계정과목을 추천하세요.

반드시 아래 회사 계정과목 목록에서만 선택해야 합니다.

회사 계정과목 목록:
{{accounts_list}}{{examples}}`;

export const DEFAULT_USER_PROMPT = `다음 거래를 분류해주세요:
- 가맹점: {{merchant_name}}
- 업종코드(MCC): {{mcc_code}}
- 금액: {{amount}}
- 거래일: {{transaction_date}}
- 적요: {{description}}`;

/** JSON 응답 형식 지시문 — 항상 시스템 프롬프트 끝에 자동 append (편집 불가) */
export const JSON_FORMAT_INSTRUCTION = `

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:
{"account_code": "코드", "account_name": "계정과목명", "confidence": 0.0~1.0, "reason": "분류 사유"}`;

/** 플레이스홀더 정의 — UI 참조 패널용 */
export const PLACEHOLDERS = [
  { key: '{{accounts_list}}', description: '계정과목 목록 JSON', target: 'system' as const },
  { key: '{{examples}}', description: '과거 확정된 분류 사례', target: 'system' as const },
  { key: '{{merchant_name}}', description: '가맹점명', target: 'user' as const },
  { key: '{{mcc_code}}', description: '업종코드 (MCC)', target: 'user' as const },
  { key: '{{amount}}', description: '금액 (원)', target: 'user' as const },
  { key: '{{transaction_date}}', description: '거래일', target: 'user' as const },
  { key: '{{description}}', description: '적요', target: 'user' as const },
] as const;
