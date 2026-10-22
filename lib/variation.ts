// Design Ref: §2 폴더와 파일 구조 — 전년(동월) 변동률과 이상치 계산, 연간 지표 처리를 이 파일에 모은다.
// Design Ref: §2 흐름 A — 전년동월(연간은 전년) 대비 변동률을 계산하고, ±30% 이상이면 이상치 표시만 붙인다. 값은 바꾸지 않는다.
// Plan SC: PLAN 4번 — 전년동월(연간은 전년) 대비 변동률 계산과 ±30% 이상치 판정.
//
// 이 파일은 계산만 하는 순수한 코드라서 서버·화면 어디서든 쓸 수 있다.
// (타입만 가져오므로 kosis.ts의 서버 전용 제한이 이쪽으로 번지지 않는다.)
import type { IndicatorPoint, IndicatorSeries } from "./kosis";

/**
 * 이상치로 표시하는 기준(%). 전년 같은 달 대비 변동이 이 값 이상이면 이상치다. (임시 기준)
 * 과거 3개년 변동 폭으로 점검한 뒤 조정한다. (PLAN 5번)
 * 가동률(%)에도 같은 상대 변동 기준을 쓰고 있다. %포인트 차이로 볼지는 아직 정해지지 않았다. (DESIGN §6의 8번)
 */
export const OUTLIER_THRESHOLD_PERCENT = 30;

/** 변동률을 계산할 수 없을 때의 이유. */
export type VariationReason =
  | "ok" // 계산함
  | "no-base" // 비교할 전년 값이 가져온 기간에 없음
  | "no-value" // 이번 값이 비어 있음(KOSIS가 숫자를 주지 않음)
  | "no-base-value" // 전년 값이 비어 있음
  | "invalid-base"; // 전년 값이 0 이하라서 비율을 낼 수 없음

export interface Variation {
  /** 이번 기준시점 */
  period: string;
  /** 비교한 전년 기준시점. 월간은 12개월 전, 연간은 1년 전. 없으면 null */
  basePeriod: string | null;
  /** 전년(동월) 대비 변동률(%). 소수 첫째 자리까지. 계산할 수 없으면 null */
  changePercent: number | null;
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

/** 변동률을 소수 첫째 자리로 맞춘다. 화면에 보이는 값과 이상치 판정이 같은 값을 쓰게 하려는 것이다. */
function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 변동률(%)이 이상치 기준 이상인지 판단한다. (±기준 이상, 기준 값 자체도 이상치) */
export function isOutlierChange(changePercent: number): boolean {
  return Math.abs(changePercent) >= OUTLIER_THRESHOLD_PERCENT;
}

/**
 * 수치 한 건의 전년(동월) 대비 변동률과 이상치 여부를 계산한다.
 * 비교할 값이 없거나 비어 있으면 값을 추정하지 않고 이유만 돌려준다.
 */
export function calcVariation(series: IndicatorSeries, point: IndicatorPoint): Variation {
  const basePeriod = getBasePeriod(point.period, series.frequency);
  const empty = (reason: VariationReason): Variation => ({
    period: point.period,
    basePeriod,
    changePercent: null,
    isOutlier: false,
    reason,
  });

  if (basePeriod === null) return empty("no-base");
  const base = series.points.find((candidate) => candidate.period === basePeriod);
  if (!base) return empty("no-base");
  if (point.value === null) return empty("no-value");
  if (base.value === null) return empty("no-base-value");
  if (base.value <= 0) return empty("invalid-base");

  const changePercent = roundToOneDecimal(((point.value - base.value) / base.value) * 100);
  return {
    period: point.period,
    basePeriod,
    changePercent,
    isOutlier: isOutlierChange(changePercent),
    reason: "ok",
  };
}

/** 지표의 모든 수치에 대해 변동률을 계산한다. 기준시점 순서는 series.points와 같다. */
export function calcSeriesVariations(series: IndicatorSeries): Variation[] {
  return series.points.map((point) => calcVariation(series, point));
}

/** 가장 최근 기준시점의 변동률을 돌려준다. 수치가 하나도 없으면 undefined. */
export function getLatestVariation(series: IndicatorSeries): Variation | undefined {
  const latest = series.points.at(-1);
  return latest ? calcVariation(series, latest) : undefined;
}
