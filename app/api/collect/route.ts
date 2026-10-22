// Design Ref: §2 흐름 A — 「최신 수치 가져오기」: KOSIS에서 지표 10개를 가져와 변동률·이상치를 계산하고 "미확정" 상태로 돌려준다.
// Design Ref: §2 폴더와 파일 구조 — `app/api/collect/`는 가져오기와 "미확정" 저장까지 맡는다. 확정은 `app/api/confirm/`의 몫이다.
// Plan SC: PLAN 7번 — 10개 지표를 한 번에 가져오고, 응답의 기준시점이 대상 월과 다르면 "아직 공표 전"으로 표시한다.
// Plan SC: PLAN 10번 — 가져온 수치를 "미확정"으로 저장한다. 이미 확정한 수치는 값을 바꾸지 않고 "KOSIS 값 변경" 표시만 남긴다.
//
// 접속 확인: proxy.ts가 1차로, 이 API가 `requireLogin`으로 한 번 더 확인한다. (PLAN 8번)
// 저장에 실패해도 가져온 수치는 화면에 보여주고, saved=false와 사유(saveError)를 함께 돌려준다.
import { requireLogin } from "@/lib/auth";
import { DISPLAY_MONTHS, INDICATORS } from "@/lib/indicators";
import { collectIndicators, getLatestPoint } from "@/lib/kosis";
import type { IndicatorPoint, IndicatorSeries } from "@/lib/kosis";
import { StoreError, getStoredView, saveCollected } from "@/lib/store";
import { calcVariation } from "@/lib/variation";
import { NO_STORE, errorResponse, rejectUnsafeRequest } from "@/lib/api-response";
import type { CollectItem, CollectResponse, ItemState, VariationView } from "@/lib/collect-types";

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
    originalValue: null,
    unit: null,
    source: null,
    lastChangedAt: null,
    variation: null,
    confirmed: null,
    kosisChanged: null,
    latestPublishedPeriod: null,
    message: null,
    failure: null,
  };
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireLogin(request);
  if (denied) return denied;
  const unsafe = rejectUnsafeRequest(request);
  if (unsafe) return unsafe;

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
        originalValue: latest.value,
        unit: latest.unit,
        source: latest.source,
        lastChangedAt: latest.lastChangedAt,
        variation: toVariationView(series, latest),
      };
    });

    // 지표마다 최근 12개월(연간은 가져온 전부)의 앞선 달 값도 "미확정"으로 함께 저장한다. 확정은 12개월 화면에서 달마다 한다.
    const earlier: CollectItem[] = [];
    for (const result of collected.results) {
      if (result.status !== "ok") continue;
      const { series } = result;
      const latest = getLatestPoint(series);
      if (!latest) continue;
      const shown = series.frequency === "M" ? series.points.slice(-DISPLAY_MONTHS) : series.points;
      for (const point of shown) {
        if (point.period === latest.period || point.value === null) continue;
        earlier.push({
          ...emptyItem(series, "unconfirmed"),
          period: point.period,
          value: point.value,
          originalValue: point.value,
          unit: point.unit,
          source: point.source,
          lastChangedAt: point.lastChangedAt,
          variation: toVariationView(series, point),
        });
      }
    }

    // 가져온 수치를 "미확정"으로 저장한다. 이미 확정한 수치는 저장소가 값을 지켜 주므로, 저장된 모양으로 다시 읽어 보여준다.
    let finalItems = items;
    let saved = false;
    let saveError: string | null = null;
    let storedMonths: string[] = [];
    try {
      await saveCollected([...items, ...earlier]);
      const view = await getStoredView(targetMonth ?? undefined);
      finalItems = items.map((item) =>
        item.state === "unconfirmed"
          ? (view.items.find((stored) => stored.code === item.code && stored.period === item.period) ?? item)
          : item,
      );
      storedMonths = view.storedMonths;
      saved = true;
    } catch (error) {
      saveError = error instanceof StoreError ? error.message : "저장하지 못했습니다. 운영자에게 알려 주세요.";
    }

    const count = (state: ItemState) => finalItems.filter((item) => item.state === state).length;
    const body: CollectResponse = {
      targetMonth,
      referenceMonth,
      collectedAt: collected.collectedAt,
      confirmedCount: count("confirmed"),
      unconfirmedCount: count("unconfirmed"),
      notPublishedCount: count("not-published"),
      failedCount: count("failed"),
      outlierCount: finalItems.filter((item) => item.variation?.isOutlier).length,
      saved,
      saveError,
      storedMonths,
      items: finalItems,
    };
    return Response.json(body, { headers: NO_STORE });
  } finally {
    collecting = false;
  }
}
