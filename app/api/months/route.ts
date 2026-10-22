// 12개월 화면에 쓸 지표별 기간 수치를 돌려준다. 저장소만 읽고 KOSIS를 부르지 않는다.
// 확정 전 값은 "미확정"으로 들어 있으며, 이 API를 쓰는 화면은 검토 화면(12개월 화면)뿐이다.
import { requireLogin } from "@/lib/auth";
import { NO_STORE, storeErrorResponse } from "@/lib/api-response";
import type { MonthsResponse } from "@/lib/collect-types";
import { DISPLAY_MONTHS, INDICATORS } from "@/lib/indicators";
import { listRecordsByIndicator } from "@/lib/store";

/** GET /api/months → 지표 10개의 최근 기간별 수치 (월간은 최근 12개월, 연간은 저장된 전부) */
export async function GET(request: Request): Promise<Response> {
  const denied = await requireLogin(request);
  if (denied) return denied;

  try {
    const records = await listRecordsByIndicator();
    const body: MonthsResponse = {
      indicators: INDICATORS.map((indicator) => {
        const all = records[indicator.code] ?? [];
        return {
          code: indicator.code,
          name: indicator.name,
          field: indicator.field,
          frequency: indicator.period,
          unit: indicator.unit,
          items: indicator.period === "M" ? all.slice(0, DISPLAY_MONTHS) : all,
        };
      }),
    };
    return Response.json(body, { headers: NO_STORE });
  } catch (error) {
    return storeErrorResponse(error);
  }
}
