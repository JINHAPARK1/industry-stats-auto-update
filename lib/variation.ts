// Design Ref: §2 폴더와 파일 구조 — 전년(동월) 변동률과 이상치 계산, 연간 지표 처리를 이 파일에 모은다.
// Design Ref: §2 흐름 A — 전년동월(연간은 전년) 대비 변동을 계산하고, 지표군별 기준을 넘으면 이상치 표시만 붙인다. 값은 바꾸지 않는다.
// Plan SC: PLAN 4번 — 전년동월(연간은 전년) 대비 변동률 계산과 이상치 판정.
// Plan SC: PLAN 5번 — 과거 3개년(2023.09~2026.08) 변동 폭을 점검해 정한 지표군별 기준을 쓴다.
//
// 이 파일은 계산만 하는 순수한 코드라서 서버·화면 어디서든 쓸 수 있다.
// (타입만 가져오므로 kosis.ts의 서버 전용 제한이 이쪽으로 번지지 않는다.)
import type { IndicatorPoint, IndicatorSeries } from "./kosis";

/**
 * 이상치 기준 한 가지.
 * - percent: 전년(동월) 대비 변동률(%)의 크기가 threshold 이상이면 이상치
 * - point: 전년(동월) 대비 %포인트 차이의 크기가 threshold 이상이면 이상치 (값 자체가 %인 지표용)
 */
export type OutlierRule =
  | { mode: "percent"; threshold: number }
  | { mode: "point"; threshold: number };

/** 기준이 따로 없는 지표에 쓰는 기본 기준. (정해진 지표는 모두 아래 표에 있다) */
export const DEFAULT_OUTLIER_RULE: OutlierRule = { mode: "percent", threshold: 30 };

// 안정 지표: 평소 변동이 5~7% 안팎이라 ±20%면 드물게만 표시된다.
const STABLE_RULE: OutlierRule = { mode: "percent", threshold: 20 };
// 중간 변동 지표: 평소 변동이 12~18% 안팎이다.
const VOLATILE_RULE: OutlierRule = { mode: "percent", threshold: 40 };

/**
 * 지표별 이상치 기준. 지표 이름표(lib/indicators.ts의 code)로 찾는다.
 * 과거 3개년(2023.09~2026.08) 변동 폭을 점검해 정했다. 확정 값이 쌓이면 다시 점검한다.
 */
export const OUTLIER_RULES: Readonly<Record<string, OutlierRule>> = {
  // 안정 4개: ±20%
  "manufacturing-production": STABLE_RULE,
  "auto-production": STABLE_RULE,
  "primary-metal-production": STABLE_RULE,
  "petroleum-production": STABLE_RULE,
  // 중간 변동 3개: ±40%
  "pharma-production": VOLATILE_RULE,
  "semiconductor-production": VOLATILE_RULE,
  "auto-investment": VOLATILE_RULE,
  // 반도체 제조용 기계: 원래 크게 널뛰는 지표라 ±70%
  "semiconductor-equipment-investment": { mode: "percent", threshold: 70 },
  // 가동률: 값이 70~75% 사이에서만 움직여서 %포인트 차이로 본다. ±3%p
  "manufacturing-utilization": { mode: "point", threshold: 3 },
  // 신생기업 수(연간): 전년 대비 ±10%
  "new-firms": { mode: "percent", threshold: 10 },
};

/** 지표의 이상치 기준을 돌려준다. 표에 없으면 기본 기준이다. */
export function getOutlierRule(code: string): OutlierRule {
  return OUTLIER_RULES[code] ?? DEFAULT_OUTLIER_RULE;
}

/** 변동률을 계산할 수 없을 때의 이유. */
export type VariationReason =
  | "ok" // 계산함
  | "no-base" // 비교할 전년 값이 가져온 기간에 없음
  | "no-value" // 이번 값이 비어 있음(KOSIS가 숫자를 주지 않음)
  | "no-base-value" // 전년 값이 비어 있음
  | "invalid-base"; // 전년 값이 0 이하라서 비율을 낼 수 없음 (%를 기준으로 하는 지표만 해당)

export interface Variation {
  /** 이번 기준시점 */
  period: string;
  /** 비교한 전년 기준시점. 월간은 12개월 전, 연간은 1년 전. 없으면 null */
  basePeriod: string | null;
  /** 전년(동월) 대비 변동률(%). 소수 첫째 자리까지. 계산할 수 없으면 null */
  changePercent: number | null;
  /** 전년(동월) 대비 %포인트 차이(이번 값 - 전년 값). 소수 첫째 자리까지. 계산할 수 없으면 null */
  changePoint: number | null;
  /** 이 지표의 이상치 기준. 화면에서 어떤 값(변동률/포인트 차이)을 보여줄지 정할 때 쓴다. */
  rule: OutlierRule;
  /** 이상치 여부. 표시만 하며 값은 바꾸지 않는다. 계산할 수 없으면 false */
  isOutlier: boolean;
  /** 계산 결과 또는 계산하지 못한 이유 */
  reason: VariationReason;
}

/** 이번 기준시점의 전년 기준시점을 구한다. 월간은 "202608" → "202508", 연간은 "2024" → "2023". 모양이 맞지 않으면 null. */
export function getBasePeriod(period: string, frequency: IndicatorSeries["frequency"]): string | null {
  if (frequency === "M") {
    const match = /^(\d{4})(0[1-9]|1[0-2])$/.exec(period);
    return match ? `${Number(match[1]) - 1}${match[2]}` : null;
  }
  const match = /^(\d{4})$/.exec(period);
  return match ? String(Number(match[1]) - 1) : null;
}

/** 소수 첫째 자리로 맞춘다. 화면에 보이는 값과 이상치 판정이 같은 값을 쓰게 하려는 것이다. */
function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 변동이 기준 이상인지 판단한다. (기준 값 자체도 이상치)
 * percent 기준은 변동률(%)을, point 기준은 %포인트 차이를 본다.
 */
export function isOutlierChange(
  rule: OutlierRule,
  change: { changePercent: number | null; changePoint: number | null },
): boolean {
  const measured = rule.mode === "percent" ? change.changePercent : change.changePoint;
  return measured !== null && Math.abs(measured) >= rule.threshold;
}

/**
 * 수치 한 건의 전년(동월) 대비 변동과 이상치 여부를 계산한다.
 * 비교할 값이 없거나 비어 있으면 값을 추정하지 않고 이유만 돌려준다.
 */
export function calcVariation(series: IndicatorSeries, point: IndicatorPoint): Variation {
  const basePeriod = getBasePeriod(point.period, series.frequency);
  const rule = getOutlierRule(series.code);
  const empty = (reason: VariationReason): Variation => ({
    period: point.period,
    basePeriod,
    changePercent: null,
    changePoint: null,
    rule,
    isOutlier: false,
    reason,
  });

  if (basePeriod === null) return empty("no-base");
  const base = series.points.find((candidate) => candidate.period === basePeriod);
  if (!base) return empty("no-base");
  if (point.value === null) return empty("no-value");
  if (base.value === null) return empty("no-base-value");
  // 비율(%)로 판단하는 지표는 전년 값이 0 이하이면 비율을 낼 수 없다. %포인트 차이는 계산할 수 있다.
  if (rule.mode === "percent" && base.value <= 0) return empty("invalid-base");

  const changePoint = roundToOneDecimal(point.value - base.value);
  const changePercent =
    base.value > 0 ? roundToOneDecimal(((point.value - base.value) / base.value) * 100) : null;
  return {
    period: point.period,
    basePeriod,
    changePercent,
    changePoint,
    rule,
    isOutlier: isOutlierChange(rule, { changePercent, changePoint }),
    reason: "ok",
  };
}

/** 지표의 모든 수치에 대해 변동을 계산한다. 기준시점 순서는 series.points와 같다. */
export function calcSeriesVariations(series: IndicatorSeries): Variation[] {
  return series.points.map((point) => calcVariation(series, point));
}

/** 가장 최근 기준시점의 변동을 돌려준다. 수치가 하나도 없으면 undefined. */
export function getLatestVariation(series: IndicatorSeries): Variation | undefined {
  const latest = series.points.at(-1);
  return latest ? calcVariation(series, latest) : undefined;
}
