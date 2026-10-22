// Design Ref: §2 흐름 D — 저장된 수치를 조회한다. KOSIS를 다시 부르지 않고 저장소만 읽는다.
// Plan SC: PLAN 10번 — 저장된 미확정 값과 확정 수치의 조회. 새로고침해도, 지난 달도 저장된 값으로 볼 수 있다.
import { requireLogin } from "@/lib/auth";
import { NO_STORE, errorResponse, storeErrorResponse } from "@/lib/api-response";
import type { CollectItem, CollectResponse } from "@/lib/collect-types";
import { getStoredView } from "@/lib/store";

/** 항목들의 상태별 개수를 센다. */
function countState(items: readonly CollectItem[], state: CollectItem["state"]): number {
  return items.filter((item) => item.state === state).length;
}

/**
 * GET /api/records            → 저장된 가장 최근 월의 수치
 * GET /api/records?month=202608 → 그 달의 저장된 수치
 */
export async function GET(request: Request): Promise<Response> {
  const denied = await requireLogin(request);
  if (denied) return denied;

  const month = new URL(request.url).searchParams.get("month") ?? undefined;
  if (month !== undefined && !/^\d{4}(0[1-9]|1[0-2])$/.test(month)) {
    return errorResponse(400, "invalid-month", "대상 월은 2026년 8월이면 202608처럼 적어 주세요.");
  }

  try {
    const view = await getStoredView(month);
    const body: CollectResponse = {
      targetMonth: view.referenceMonth,
      referenceMonth: view.referenceMonth,
      collectedAt: view.collectedAt,
      confirmedCount: countState(view.items, "confirmed"),
      unconfirmedCount: countState(view.items, "unconfirmed"),
      notPublishedCount: 0,
      failedCount: 0,
      outlierCount: view.items.filter((item) => item.variation?.isOutlier).length,
      saved: true,
      saveError: null,
      storedMonths: view.storedMonths,
      items: view.items,
    };
    return Response.json(body, { headers: NO_STORE });
  } catch (error) {
    return storeErrorResponse(error);
  }
}
