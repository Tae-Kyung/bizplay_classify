# 계정과목 자동 분류 로직

## 개요

거래 내역이 입력되면 **룰 엔진 → AI 분류** 순서로 2단계 파이프라인을 거쳐 계정과목을 매핑한다.
룰 엔진에서 매칭되면 즉시 결과를 반환하고, 매칭되지 않을 때만 AI 분류를 수행한다.

```
거래 입력 → [1] 룰 엔진 매칭 시도
              ├─ 매칭 성공 → 결과 저장 (confidence: 1.0, method: "rule")
              └─ 매칭 실패 → [2] AI 분류
                               ├─ 분류 성공 → 결과 저장 (confidence: 0.0~1.0, method: "ai")
                               └─ 분류 실패 → 에러 반환
```

---

## 입력 데이터 (TransactionInput)

| 필드              | 타입     | 필수 | 설명                     |
|-------------------|----------|------|--------------------------|
| merchant_name     | string   |      | 가맹점명                 |
| mcc_code          | string   |      | 가맹점 업종코드 (4자리)  |
| amount            | number   | O    | 거래 금액                |
| transaction_date  | string   |      | 거래일 (YYYY-MM-DD)      |
| description       | string   |      | 적요                     |

---

## 1단계: 룰 기반 분류

> 소스: `src/lib/classify/rule-engine.ts`

### 룰 구조

각 룰은 `classification_rules` 테이블에 저장되며 다음 필드를 갖는다:

| 필드       | 설명                                    |
|------------|-----------------------------------------|
| name       | 룰 이름 (예: "카페/커피숍 → 복리후생비") |
| priority   | 우선순위 (높을수록 먼저 평가)            |
| conditions | 매칭 조건 (JSON, 아래 참고)              |
| account_id | 매칭 시 매핑할 계정과목 ID               |
| is_active  | 활성화 여부                              |

### 매칭 조건 (RuleConditions)

조건은 **AND 로직**으로 결합된다. 지정된 모든 조건을 동시에 만족해야 매칭 성공이다.

| 조건 키                 | 타입       | 매칭 방식                                           |
|------------------------|------------|-----------------------------------------------------|
| mcc_codes              | string[]   | 거래의 mcc_code가 배열에 포함되어야 함               |
| merchant_name_contains | string     | 거래의 merchant_name에 해당 문자열 포함 (대소문자 무시)|
| amount_min             | number     | 거래 금액 >= amount_min                              |
| amount_max             | number     | 거래 금액 <= amount_max                              |

### 매칭 프로세스

```
1. 회사의 활성 룰 목록을 priority DESC 순으로 정렬하여 조회
2. 각 룰을 순서대로 순회:
   a. is_active가 false면 건너뜀
   b. matchesConditions()로 거래와 조건을 비교
   c. 모든 조건을 만족하면 → 해당 룰의 계정과목으로 즉시 반환
3. 어떤 룰도 매칭되지 않으면 → 2단계(AI)로 넘어감
```

### 결과

- **confidence**: 항상 `1.0` (룰 매칭은 확정적)
- **method**: `"rule"`
- **reason**: `룰 "{룰명}"에 의해 자동 분류되었습니다.`

### 기본 제공 룰 예시 (seed)

| 우선순위 | 룰 이름               | 조건                                    | 계정과목     |
|---------|----------------------|----------------------------------------|-------------|
| 11      | 소액 카페 → 회의비    | MCC 5814 + 금액 ≤ 30,000              | 52700 회의비  |
| 10      | 카페/커피숍 → 복리후생비| MCC 5814,5812 + 가맹점명 "스타벅스"    | 51100 복리후생비|
| 9       | 음식점(회식) → 접대비  | MCC 5812,5813 + 금액 ≥ 50,000         | 51400 접대비  |
| 8       | 주유소 → 차량유지비    | MCC 5541,5542                          | 51900 차량유지비|
| 7       | 항공사 → 여비교통비    | MCC 3000,3001,3002,4511               | 51200 여비교통비|
| 7       | 호텔/숙박 → 여비교통비 | MCC 7011,7012                          | 51200 여비교통비|
| 6       | 택시 → 여비교통비      | MCC 4121                               | 51200 여비교통비|
| 5       | 서점/도서 → 도서인쇄비 | MCC 5942,5192                          | 52200 도서인쇄비|
| 5       | 사무용품점 → 사무용품비| MCC 5943,5111                          | 52300 사무용품비|
| 4       | 다이소/소모품 → 소모품비| MCC 5331 + 가맹점명 "다이소"           | 52400 소모품비 |
| 4       | 통신요금 → 통신비      | MCC 4814,4812                          | 51300 통신비  |
| 3       | IT/소프트웨어 → 지급수수료| MCC 7372,7379                        | 52500 지급수수료|
| 3       | 택배/운송 → 운반비     | MCC 4215,4214                          | 52000 운반비  |
| 2       | 병원/의료 → 복리후생비 | MCC 8011,8021,8031                     | 51100 복리후생비|
| 2       | 관공서/세금 → 세금과공과| MCC 9311,9222                          | 51500 세금과공과|

**우선순위 충돌 예시**: MCC 5814(카페) + 금액 25,000원인 거래는 우선순위 11의 "소액 카페 → 회의비" 룰이 먼저 매칭되어 회의비로 분류된다.

---

## 2단계: AI 기반 분류

> 소스: `src/lib/classify/ai-classifier.ts`

룰 엔진에서 매칭되지 않은 거래에 대해 Claude API를 호출하여 분류한다.

### 모델 설정

| 항목        | 값                         |
|-------------|----------------------------|
| 모델        | claude-sonnet-4-20250514   |
| temperature | 0 (결정적 응답)             |
| max_tokens  | 1024                       |

### 프롬프트 구성

**System Prompt에 포함되는 정보:**

1. **역할 지정**: "기업 회계 전문가"
2. **회사 계정과목 목록**: 해당 회사의 활성 계정과목을 JSON으로 제공 (code, name, category)
3. **과거 분류 사례** (Few-shot): 사용자가 확인(confirm)한 최근 10건의 분류 결과
   - 형식: `가맹점명 (MCC:코드, 금액원) → 계정코드 계정명`
4. **응답 형식 제약**: 반드시 JSON으로만 응답하도록 지시

**User Prompt에 포함되는 거래 정보:**
- 가맹점명, 업종코드(MCC), 금액, 거래일, 적요

### AI 응답 형식

```json
{
  "account_code": "계정과목 코드",
  "account_name": "계정과목명",
  "confidence": 0.0~1.0,
  "reason": "분류 사유"
}
```

### 후처리 (Validation & Fallback)

```
1. AI가 반환한 account_code가 회사 계정과목에 존재하는지 검증
2. 존재하면 → 그대로 사용
3. 존재하지 않으면 → account_name으로 부분 일치 검색하여 대체
4. 대체도 실패하면 → 에러 반환 ("AI가 유효하지 않은 계정과목을 반환했습니다")
```

### 결과

- **confidence**: AI가 판단한 신뢰도 (`0.0` ~ `1.0`)
- **method**: `"ai"`
- **reason**: AI가 생성한 분류 사유

---

## 일괄 분류 (Batch)

> 소스: `src/app/api/companies/[companyId]/classify/batch/route.ts`

CSV 파일을 업로드하면 각 행에 대해 동일한 2단계 파이프라인을 실행한다.

### 처리 방식

- CSV 파싱: `papaparse` 라이브러리 사용 (header 모드)
- **동시 처리**: 5건 단위 배치(`BATCH_SIZE = 5`)로 `Promise.allSettled` 병렬 처리
- 각 행마다: 거래 저장 → 룰 매칭 → (실패 시) AI 분류

### CSV 필수 컬럼

| 컬럼             | 필수 | 설명          |
|------------------|------|---------------|
| merchant_name    | O    | 가맹점명      |
| amount           | O    | 거래 금액     |
| mcc_code         |      | MCC 코드      |
| transaction_date |      | 거래일        |
| description      |      | 적요          |
| card_type        |      | corporate / personal |

### 응답

```json
{
  "total": 100,
  "success": 95,
  "failed": 5,
  "rule_classified": 60,
  "ai_classified": 35,
  "errors": [{ "row": 3, "error": "에러 메시지" }]
}
```

---

## 분류 결과 확인 (Confirm)

분류 결과는 `is_confirmed = false` 상태로 저장된다.
사용자가 수동으로 결과를 검토하고 "확인"하면 `is_confirmed = true`로 업데이트된다.
확인된 결과는 이후 AI 분류 시 **Few-shot 예시**로 활용되어 분류 정확도가 점진적으로 향상된다.

---

## 관련 파일 구조

```
src/lib/classify/
├── rule-engine.ts          # 룰 기반 매칭 엔진
└── ai-classifier.ts        # Claude AI 분류기

src/lib/claude/
└── client.ts               # Anthropic SDK 클라이언트

src/app/api/companies/[companyId]/
├── classify/
│   ├── route.ts            # 단건 분류 API
│   └── batch/route.ts      # 일괄(CSV) 분류 API
└── rules/
    ├── route.ts            # 룰 CRUD
    ├── [id]/route.ts       # 룰 개별 수정/삭제
    └── seed/route.ts       # 기본 룰 시드 데이터
```
