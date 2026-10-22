// Design Ref: §2 흐름 A — 「최신 수치 가져오기」: KOSIS에서 지표 10개를 가져와 변동률·이상치를 계산하고 "미확정" 상태로 돌려준다.
// Design Ref: §2 폴더와 파일 구조 — `app/api/collect/`는 가져오기만 맡는다. 확정·저장은 `app/api/confirm/`과 `lib/store.ts`의 몫이다.
// Plan SC: PLAN 7번 — 10개 지표를 한 번에 가져오고, 응답의 기준시점이 대상 월과 다르면 "아직 공표 전"으로 표시한다.
//
// 접속 확인: proxy.ts가 1차로, 이 API가 `requireLogin`으로 한 번 더 확인한다. (PLAN 8번)
//
// 아직 하지 않는 것 (저장소가 정해지지 않았다)
// - 수집 결과를 "미확정"으로 저장하는 일 → 응답의 saved가 항상 false다.
import { requireLogin } from "@/lib/auth";
import { INDICATORS } from "@/lib/indicators";
import { collectIndicators, getLatestPoint } from "@/lib/kosis";
import type { IndicatorFailure, IndicatorPoint, IndicatorSeries } from "@/lib/kosis";
import { calcVariation } from "@/lib/variation";

/** 화면에서 수치 한 건의 상태를 나타낼 때 쓰는 값. (DESIGN §1 상태 칸) */
type ItemState =
  | "unconfirmed" // 가져왔고 아직 확정 전
  | "not-published" // 고른 달의 값이 아직 공표되지 않음
  | "failed"; // 수집 실패 (빈칸 + 사유)

interface VariationView {
  /** 비교한 전년 기준시점 */
  basePeriod: string | null;
  /** 전년(동월) 대비 변동률(%). 계산할 수 없으면 null */
  changePercent: number | null;
  /** 전년(동월) 대비 %포인트 차이. 계산할 수 없으면 null */
  changePoint: number | null;
  /** 화면에 보여줄 값: percent = 변동률(%), point = %포인트 차이 */
  measure: "percent" | "point";
  /** 이 지표의 이상치 기준 크기 */
  threshold: number;
  /** 이상치 표시 여부. 표시만 하며 값은 바꾸지 않는다. */
  isOutlier: boolean;
  /** 계산 결과 또는 계산하지 못한 이유 */
  reason: string;
}

interface CollectItem {
  code: string;
  name: string;
  field: string;
  frequency: "M" | "Y";
  state: ItemState;
  /** 기준시점. 수치가 없으면(공표 전·실패) null */
  period: string | null;
  /** 수치. 수치가 없으면 null이며, 다른 달 값으로 채우지 않는다. */
  value: number | null;
  unit: string | null;
  /** 출처: "통계표명(번호)" */
  source: string | null;
  /** KOSIS에서 마지막으로 수정된 날짜 */
  lastChangedAt: string | null;
  variation: VariationView | null;
  /** 공표 전일 때 KOSIS에 마지막으로 올라온 기준시점 (참고용, 수치는 붙이지 않는다) */
  latestPublishedPeriod: string | null;
  /** 화면에 보여줄 쉬운 문구. 정상이면 null */
  message: string | null;
  /** 수집 실패 사유. 실패가 아니면 null */
  failure: IndicatorFailure | null;
}

interface ErrorBody {
  error: { code: string; message: string };
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

function errorResponse(status: number, code: string, message: string): Response {
  const body: ErrorBody = { error: { code, message } };
  return Response.json(body, { status, headers: NO_STORE });
}

/** 지금 가져오는 중인지. 여러 명이 동시에 누르는 것을 막는 간단한 장치다. (서버가 여러 대이면 완전하지 않다) */
let collecting = false;

/** 요청 내용. 비어 있어도 된다. */
interface CollectRequest {
  /** 대상 월 "YYYYMM". 없으면 가장 최근에 공표된 월 */
  month?: string;
  /** 가져올 지표 이름표. 없으면 10개 전부. 실패한 지표만 다시 가져올 때 쓴다. */
  codes?: string[];
}

/** 요청 본문을 읽고 검사한다. 잘못되면 쉬운 문구의 오류를 돌려준다. */
async function parseRequest(request: Request): Promise<CollectRequest | Response> {
  const text = await request.text();
  if (text.trim() === "") return {};

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return errorResponse(400, "invalid-body", "요청 내용을 읽을 수 없습니다.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorResponse(400, "invalid-body", "요청 내용을 읽을 수 없습니다.");
  }

  const { month, codes } = body as Record<string, unknown>;
  const result: CollectRequest = {};

  if (month !== undefined) {
    if (typeof month !== "string" || !/^\d{4}(0[1-9]|1[0-2])$/.test(month)) {
      return errorResponse(400, "invalid-month", "대상 월은 2026년 8월이면 202608처럼 적어 주세요.");
    }
    result.month = month;
  }

  if (codes !== undefined) {
    const known = new Set(INDICATORS.map((indicator) => indicator.code));
    if (!Array.isArray(codes) || codes.length === 0 || !codes.every((code) => typeof code === "string" && known.has(code))) {
      return errorResponse(400, "invalid-codes", "가져올 지표를 알 수 없습니다.");
    }
    result.codes = codes as string[];
  }
  return result;
}

/** 변동 계산 결과를 화면용으로 줄인다. */
function toVariationView(series: IndicatorSeries, point: IndicatorPoint): VariationView {
  const variation = calcVariation(series, point);
  return {
    basePeriod: variation.basePeriod,
    changePercent: variation.changePercent,
    changePoint: variation.changePoint,
    measure: variation.rule.mode,
    threshold: variation.rule.threshold,
    isOutlier: variation.isOutlier,
    reason: variation.reason,
  };
}

/** 지표 하나의 기본 항목. 수치 칸은 모두 비워 둔다. */
function emptyItem(series: Pick<IndicatorSeries, "code" | "name" | "field" | "frequency">, state: ItemState): CollectItem {
  return {
    code: series.code,
    name: series.name,
    field: series.field,
    frequency: series.frequency,
    state,
    period: null,
    value: null,
    unit: null,
    source: null,
    lastChangedAt: null,
    variation: null,
    latestPublishedPeriod: null,
    message: null,
    failure: null,
  };
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireLogin(request);
  if (denied) return denied;

  const parsed = await parseRequest(request);
  if (parsed instanceof Response) return parsed;

  if (collecting) {
    return errorResponse(409, "busy", "다른 분이 가져오는 중입니다. 잠시 뒤 다시 눌러 주세요.");
  }
  collecting = true;
  try {
    const indicators = parsed.codes
      ? INDICATORS.filter((indicator) => parsed.codes?.includes(indicator.code))
      : INDICATORS;

    // 가져오기는 이 버튼을 눌렀을 때만 실행하고, 실패해도 자동으로 다시 부르지 않는다.
    const collected = await collectIndicators(indicators);

    // 월간 지표 중 가장 최근에 공표된 월 = 기준이 되는 월
    const monthlyLatest = collected.results.flatMap((result) =>
      result.status === "ok" && result.series.frequency === "M" ? [getLatestPoint(result.series)?.period ?? ""] : [],
    );
    const referenceMonth = monthlyLatest.filter(Boolean).sort().at(-1) ?? null;

    // 이미 지난 달은 새로 가져오지 않는다. (소급 수집 금지) 지난 달은 확정된 값만 조회할 수 있다.
    if (parsed.month && referenceMonth && parsed.month < referenceMonth) {
      return errorResponse(
        400,
        "past-month",
        "이미 지난 달은 새로 가져올 수 없습니다. 확정된 값만 조회할 수 있습니다.",
      );
    }
    const targetMonth = parsed.month ?? referenceMonth;

    const items: CollectItem[] = collected.results.map((result) => {
      if (result.status === "failed") {
        const item = emptyItem({ ...result, frequency: INDICATORS.find((i) => i.code === result.code)?.period ?? "M" }, "failed");
        return { ...item, message: result.failure.message, failure: result.failure };
      }

      const { series } = result;
      const latest = getLatestPoint(series);
      if (!latest) {
        return { ...emptyItem(series, "failed"), message: "통계를 가져오지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
      }

      // 월간 지표인데 고른 달보다 오래된 값뿐이면, 다른 달 값을 붙이지 않고 "아직 공표 전"으로 둔다.
      if (series.frequency === "M" && targetMonth && latest.period < targetMonth) {
        return {
          ...emptyItem(series, "not-published"),
          latestPublishedPeriod: latest.period,
          message: "아직 공표 전입니다.",
        };
      }

      return {
        ...emptyItem(series, "unconfirmed"),
        period: latest.period,
        value: latest.value,
        unit: latest.unit,
        source: latest.source,
        lastChangedAt: latest.lastChangedAt,
        variation: toVariationView(series, latest),
      };
    });

    const count = (state: ItemState) => items.filter((item) => item.state === state).length;
    return Response.json(
      {
        targetMonth,
        referenceMonth,
        collectedAt: collected.collectedAt,
        unconfirmedCount: count("unconfirmed"),
        notPublishedCount: count("not-published"),
        failedCount: count("failed"),
        outlierCount: items.filter((item) => item.variation?.isOutlier).length,
        // 저장소가 정해지기 전이라 수집 결과를 저장하지 않는다. (PLAN 9~10번 이후에 저장)
        saved: false,
        items,
      },
      { headers: NO_STORE },
    );
  } finally {
    collecting = false;
  }
}
