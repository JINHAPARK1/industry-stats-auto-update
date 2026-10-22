// Design Ref: §2 폴더와 파일 구조 — 지표 10개의 통계표 번호·분류 코드·주기·이름을 이 파일 한 곳에 모은다.
// Plan SC: PLAN 1번 — 시범 지표 10개(월간 9개 + 연간 1개) 정의. PRD 6번 지표 표와 일치시킨다.

/** 지표가 속한 분야. 그래프 화면의 분야 카드 순서와 같다. */
export type IndicatorField =
  | "제조업 전체"
  | "첨단산업"
  | "자동차"
  | "철강"
  | "석유"
  | "벤처·창업";

/** 통계가 공표되는 주기. M = 월간, Y = 연간 (KOSIS의 prdSe 값과 같다). */
export type IndicatorPeriod = "M" | "Y";

export interface Indicator {
  /** 화면·저장소에서 지표를 구분하는 영문 이름표 */
  code: string;
  /** 화면에 보이는 분야 */
  field: IndicatorField;
  /** 화면에 보이는 지표 이름 */
  name: string;
  /** KOSIS 기관 코드 (101 = 통계청, 지금은 국가데이터처로 표시됨) */
  orgId: string;
  /** KOSIS 통계표 번호 */
  tableId: string;
  /** 출처 표기용 통계표 이름 (통계 조사명 + 통계표명) */
  tableName: string;
  /** KOSIS 항목 코드 (itmId) */
  itemId: string;
  /**
   * 분류 코드를 objL1, objL2 순서로 나열한다.
   * 설비투자지수 표는 첫 분류에 "ALL"을 넣어야 호출이 되어 예외로 둔다. (CLAUDE.md "KOSIS 호출 메모")
   */
  objectCodes: readonly string[];
  /** 공표 주기 */
  period: IndicatorPeriod;
  /** 화면에 보이는 단위. KOSIS가 주는 단위가 이상한 경우(신생기업 수 "개%")에는 여기서 직접 정한다. */
  unit: string;
  /** 한 번에 가져올 기간 수. 월간은 전년동월 비교를 위해 13개월, 연간은 3개년이다. */
  periodCount: number;
}

/** 월간 지표는 전년동월 대비를 계산하려고 최근 13개월을 가져온다. (PRD 6번) */
const MONTHLY_COUNT = 13;
/** 연간 지표는 최근 3개년을 가져온다. (PLAN 3번) */
const ANNUAL_COUNT = 3;

const PRODUCTION_TABLE = {
  orgId: "101",
  tableId: "DT_1F02001",
  tableName: "광업제조업동향조사 시도/산업별 광공업생산지수 (DT_1F02001)",
  itemId: "T10", // 생산지수(원지수)
  period: "M",
  unit: "2020=100",
  periodCount: MONTHLY_COUNT,
} as const;

const INVESTMENT_TABLE = {
  orgId: "101",
  tableId: "DT_1F70011",
  tableName: "설비투자지수 (DT_1F70011)",
  itemId: "T3", // 원지수
  period: "M",
  unit: "2020=100",
  periodCount: MONTHLY_COUNT,
} as const;

/** 시범 지표 10개. 화면 표의 줄 순서와 같다. */
export const INDICATORS: readonly Indicator[] = [
  {
    ...PRODUCTION_TABLE,
    code: "manufacturing-production",
    field: "제조업 전체",
    name: "광공업생산지수(제조업)",
    objectCodes: ["00", "C"], // 전국, 제조업
  },
  {
    ...PRODUCTION_TABLE,
    code: "semiconductor-production",
    field: "첨단산업",
    name: "반도체 생산지수",
    objectCodes: ["00", "C261"], // 전국, 반도체 제조업
  },
  {
    ...PRODUCTION_TABLE,
    code: "pharma-production",
    field: "첨단산업",
    name: "의약품(헬스케어) 생산지수",
    objectCodes: ["00", "C21"], // 전국, 의료용 물질 및 의약품 제조업
  },
  {
    ...INVESTMENT_TABLE,
    code: "semiconductor-equipment-investment",
    field: "첨단산업",
    name: "설비투자지수(반도체 제조용 기계)",
    objectCodes: ["ALL", "C1122"], // 첫 분류는 ALL, 반도체 제조용 기계
  },
  {
    ...PRODUCTION_TABLE,
    code: "auto-production",
    field: "자동차",
    name: "자동차 생산지수",
    objectCodes: ["00", "C30"], // 전국, 자동차 및 트레일러 제조업
  },
  {
    ...INVESTMENT_TABLE,
    code: "auto-investment",
    field: "자동차",
    name: "자동차 설비투자지수",
    objectCodes: ["ALL", "C21"], // 첫 분류는 ALL, 자동차
  },
  {
    ...PRODUCTION_TABLE,
    code: "primary-metal-production",
    field: "철강",
    name: "1차금속 생산지수",
    objectCodes: ["00", "C24"], // 전국, 1차 금속 제조업
  },
  {
    ...PRODUCTION_TABLE,
    code: "petroleum-production",
    field: "석유",
    name: "코크스·연탄·석유정제품 생산지수",
    objectCodes: ["00", "C19"], // 전국, 코크스 연탄 및 석유정제품 제조업
  },
  {
    orgId: "101",
    tableId: "DT_1F32002",
    tableName: "광업제조업동향조사 제조업 평균가동률 (DT_1F32002)",
    itemId: "T50", // 평균가동률
    period: "M",
    unit: "%",
    periodCount: MONTHLY_COUNT,
    code: "manufacturing-utilization",
    field: "제조업 전체",
    name: "제조업 평균가동률",
    objectCodes: ["C"], // 제조업
  },
  {
    orgId: "101",
    tableId: "DT_1BD1122",
    tableName: "기업생멸행정통계 산업별 기업 규모별 기업수 (DT_1BD1122)",
    itemId: "T02", // 신생
    period: "Y",
    unit: "개", // KOSIS 응답의 단위가 "개%"라서 직접 지정한다.
    periodCount: ANNUAL_COUNT,
    code: "new-firms",
    field: "벤처·창업",
    name: "신생기업 수",
    objectCodes: ["0", "0"], // 전체 산업, 규모 합계
  },
];

/** 지표 이름표(code)로 지표를 찾는다. 없으면 undefined. */
export function getIndicator(code: string): Indicator | undefined {
  return INDICATORS.find((indicator) => indicator.code === code);
}
