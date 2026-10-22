// Design Ref: §1 오른쪽 패널 — 수정 이력(원래 값과 고친 값, 확정·취소·재확정, KOSIS 값 변경)을 보여준다.
// Plan SC: PLAN 11번 — 사람이 고친 수치는 원래 값과 고친 값을 모두 기록하고, 확정 취소·재확정도 이력에 남긴다.
import { requireLogin } from "@/lib/auth";
import { NO_STORE, errorResponse, storeErrorResponse } from "@/lib/api-response";
import type { HistoryResponse } from "@/lib/collect-types";
import { INDICATORS } from "@/lib/indicators";
import { getHistory } from "@/lib/store";

/** GET /api/history?code=auto-production&period=202608 → 그 수치의 이력(오래된 것부터) */
export async function GET(request: Request): Promise<Response> {
  const denied = await requireLogin(request);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const code = params.get("code") ?? "";
  const period = params.get("period") ?? "";
  if (!INDICATORS.some((indicator) => indicator.code === code)) {
    return errorResponse(400, "invalid-code", "지표를 알 수 없습니다.");
  }
  if (!/^\d{4}(0[1-9]|1[0-2])?$/.test(period)) {
    return errorResponse(400, "invalid-period", "기준시점은 202608 또는 2024처럼 적어 주세요.");
  }

  try {
    const body: HistoryResponse = { code, period, entries: await getHistory(code, period) };
    return Response.json(body, { headers: NO_STORE });
  } catch (error) {
    return storeErrorResponse(error);
  }
}
