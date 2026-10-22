// Design Ref: §1 화면 구성 3) 그래프 화면 — 분야별 카드에 그릴 확정된 수치를 돌려준다.
// Plan SC: PLAN 17번 — 확정된 수치만 그린다. 확정 전 수치는 이 API에 나오지 않는다. 소급 수집을 하지 않으므로 확정 값이 쌓인 만큼만 나온다.
import { requireLogin } from "@/lib/auth";
import { NO_STORE, storeErrorResponse } from "@/lib/api-response";
import type { SeriesResponse } from "@/lib/collect-types";
import { INDICATORS } from "@/lib/indicators";
import { listAllConfirmedSeries } from "@/lib/store";

/** GET /api/series → 지표 10개의 확정된 수치들 (지표 정의 순서) */
export async function GET(request: Request): Promise<Response> {
  const denied = await requireLogin(request);
  if (denied) return denied;

  try {
    const confirmed = await listAllConfirmedSeries();
    const body: SeriesResponse = {
      indicators: INDICATORS.map((indicator) => ({
        code: indicator.code,
        name: indicator.name,
        field: indicator.field,
        frequency: indicator.period,
        unit: indicator.unit,
        points: confirmed[indicator.code] ?? [],
      })),
    };
    return Response.json(body, { headers: NO_STORE });
  } catch (error) {
    return storeErrorResponse(error);
  }
}
