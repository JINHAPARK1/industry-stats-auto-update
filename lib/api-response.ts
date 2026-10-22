// 여러 API 경로가 함께 쓰는 응답 만들기. 오류 응답의 모양과 저장소 오류의 HTTP 번호를 한 곳에 모은다.
import "server-only";

import type { ApiErrorBody } from "./collect-types";
import { StoreError } from "./store";
import type { StoreErrorKind } from "./store";

/** 모든 응답은 캐시하지 않는다. (매번 최신 값을 보여준다) */
export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** 쉬운 문구의 오류 응답을 만든다. */
export function errorResponse(status: number, code: string, message: string): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status, headers: NO_STORE });
}

/** 저장소 오류의 종류별 HTTP 번호 */
const STORE_ERROR_STATUS: Record<StoreErrorKind, number> = {
  "not-configured": 503,
  io: 500,
  "not-found": 404,
  "already-confirmed": 409,
  "not-confirmed": 409,
  "no-value": 422,
  "check-required": 422,
  "invalid-value": 400,
  "reason-required": 400,
};

/** 저장소 오류를 응답으로 바꾼다. 저장소 오류가 아니면 내용을 감추고 일반 문구로 답한다. */
export function storeErrorResponse(error: unknown): Response {
  if (error instanceof StoreError) {
    return errorResponse(STORE_ERROR_STATUS[error.kind], `store-${error.kind}`, error.message);
  }
  return errorResponse(500, "unknown", "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
}
