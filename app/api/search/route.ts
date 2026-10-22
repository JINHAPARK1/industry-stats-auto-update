// Design Ref: §2 흐름 D — 조회와 검색(국정감사 때). KOSIS를 다시 부르지 않고 저장된 확정 수치만 찾는다.
// Plan SC: PLAN 18번 — 검색 결과는 확정된 최신 수치만 보여주고, 3초 이내에 끝난다.
import { requireLogin } from "@/lib/auth";
import { NO_STORE, errorResponse, storeErrorResponse } from "@/lib/api-response";
import type { SearchResponse } from "@/lib/collect-types";
import { searchLatestConfirmed } from "@/lib/store";

/** 검색어의 글자 수 상한. 터무니없이 긴 값을 막는다. */
const MAX_QUERY_LENGTH = 50;

/** GET /api/search?q=반도체 → 이름이나 분야에 "반도체"가 들어 있는 지표의 확정된 최신 수치 */
export async function GET(request: Request): Promise<Response> {
  const denied = await requireLogin(request);
  if (denied) return denied;

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length > MAX_QUERY_LENGTH) {
    return errorResponse(400, "invalid-query", `검색어는 ${MAX_QUERY_LENGTH}자 이내로 적어 주세요.`);
  }

  try {
    const body: SearchResponse = { query, items: await searchLatestConfirmed(query) };
    return Response.json(body, { headers: NO_STORE });
  } catch (error) {
    return storeErrorResponse(error);
  }
}
