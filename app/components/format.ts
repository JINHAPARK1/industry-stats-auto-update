// 화면에 보여줄 글자로 바꾸는 작은 함수들. 계산은 하지 않고 모양만 바꾼다. (DESIGN §1 표의 칸 모양)
import type { CollectItem, VariationView } from "@/lib/collect-types";

/** 기준시점을 읽기 쉽게 바꾼다. 월간 "202608" → "2026.08", 연간 "2024" → "2024년" */
export function formatPeriod(period: string | null): string {
  if (!period) return "-";
  if (/^\d{6}$/.test(period)) return `${period.slice(0, 4)}.${period.slice(4)}`;
  if (/^\d{4}$/.test(period)) return `${period}년`;
  return period;
}

/** 수치를 천 단위 쉼표와 함께 보여준다. 수치가 없으면 "-" */
export function formatValue(value: number | null): string {
  return value === null ? "-" : value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

/** 부호를 붙여 보여준다. 예: 1.4 → "+1.4", -2.9 → "-2.9" */
function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

/** 전년(동월) 대비 칸. 대부분 변동률(%)이고 가동률은 %포인트 차이다. 계산하지 못했으면 이유를 짧게 보여준다. */
export function formatChange(variation: VariationView | null): string {
  if (!variation) return "-";
  if (variation.measure === "point") {
    return variation.changePoint === null ? reasonText(variation.reason) : `${signed(variation.changePoint)}%p`;
  }
  return variation.changePercent === null ? reasonText(variation.reason) : `${signed(variation.changePercent)}%`;
}

/** 이상치 기준을 글자로. 예: "±20%", "±3%p" */
export function formatThreshold(variation: VariationView): string {
  return `±${variation.threshold}${variation.measure === "point" ? "%p" : "%"}`;
}

/** 변동을 계산하지 못한 이유를 짧게 */
function reasonText(reason: string): string {
  switch (reason) {
    case "no-base":
      return "비교할 전년 값 없음";
    case "no-value":
      return "이번 값 없음";
    case "no-base-value":
      return "전년 값 없음";
    case "invalid-base":
      return "비교 불가";
    default:
      return "-";
  }
}

/** 수집 결과의 개수들을 항목 목록에서 다시 센다. (실패한 지표만 다시 가져왔을 때 합쳐진 결과로 세기 위해) */
export function countItems(items: readonly CollectItem[]) {
  return {
    confirmed: items.filter((item) => item.state === "confirmed").length,
    unconfirmed: items.filter((item) => item.state === "unconfirmed").length,
    notPublished: items.filter((item) => item.state === "not-published").length,
    failed: items.filter((item) => item.state === "failed").length,
    outliers: items.filter((item) => item.variation?.isOutlier).length,
  };
}

/** 시각을 "2026-10-22 13:55" 모양으로. 확정·이력 시각에도 쓴다. */
export const formatDateTime = (iso: string): string => formatCollectedAt(iso);

/** 수집한 시각을 "2026-10-22 13:55" 모양으로 */
export function formatCollectedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
