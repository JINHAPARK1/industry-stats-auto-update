// Design Ref: §2 흐름 B — 검토하고 확정하기. 서버에 저장된 원래 값을 기준으로 확정·확정 취소를 처리한다.
// Plan SC: PLAN 11번 — 고친 값은 원래 값과 함께 이력에 남기고, 확정 취소·재확정도 이력에 남긴다.
// Plan SC: PLAN 14번 — 확정 전 수치는 서식·검색·그래프에 반영하지 않는다. (확정된 수치만 저장소에서 "확정" 상태가 된다)
import { requireLogin } from "@/lib/auth";
import { NO_STORE, errorResponse, rejectUnsafeRequest, storeErrorResponse } from "@/lib/api-response";
import type { ConfirmResponse } from "@/lib/collect-types";
import { INDICATORS } from "@/lib/indicators";
import { confirmRecord, unconfirmRecord } from "@/lib/store";
import type { ConfirmInput } from "@/lib/store";

/** 요청 내용 */
interface ConfirmRequest {
  code: string;
  period: string;
  action: "confirm" | "unconfirm";
  input: ConfirmInput;
}

/** 요청 본문을 읽고 검사한다. 잘못되면 쉬운 문구의 오류를 돌려준다. */
async function parseRequest(request: Request): Promise<ConfirmRequest | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid-body", "요청 내용을 읽을 수 없습니다.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorResponse(400, "invalid-body", "요청 내용을 읽을 수 없습니다.");
  }

  const { code, period, action, editedValue, reason, checkedAgainstSource, expectedValue } = body as Record<string, unknown>;
  if (typeof code !== "string" || !INDICATORS.some((indicator) => indicator.code === code)) {
    return errorResponse(400, "invalid-code", "지표를 알 수 없습니다.");
  }
  if (typeof period !== "string" || !/^\d{4}(0[1-9]|1[0-2])?$/.test(period)) {
    return errorResponse(400, "invalid-period", "기준시점은 202608 또는 2024처럼 적어 주세요.");
  }
  if (action !== "confirm" && action !== "unconfirm") {
    return errorResponse(400, "invalid-action", "확정하거나 확정을 취소하는 요청이어야 합니다.");
  }

  const input: ConfirmInput = {};
  if (action === "confirm") {
    // 사람이 화면에서 본 KOSIS 값. 서버에 지금 저장된 값과 다르면 확정하지 않는다.
    if (typeof expectedValue !== "number" || !Number.isFinite(expectedValue)) {
      return errorResponse(400, "invalid-expected", "화면을 새로 고친 뒤 다시 확정해 주세요.");
    }
    input.expectedValue = expectedValue;
  }
  if (editedValue !== undefined && editedValue !== null) {
    if (typeof editedValue !== "number" || !Number.isFinite(editedValue)) {
      return errorResponse(400, "invalid-value", "고친 값은 0 이상의 숫자로 적어 주세요.");
    }
    input.editedValue = editedValue;
  }
  if (reason !== undefined && reason !== null) {
    if (typeof reason !== "string") {
      return errorResponse(400, "invalid-reason", "고친 사유는 글자로 적어 주세요.");
    }
    input.reason = reason;
  }
  if (checkedAgainstSource !== undefined) {
    input.checkedAgainstSource = checkedAgainstSource === true;
  }
  return { code, period, action, input };
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireLogin(request);
  if (denied) return denied;
  const unsafe = rejectUnsafeRequest(request);
  if (unsafe) return unsafe;

  const parsed = await parseRequest(request);
  if (parsed instanceof Response) return parsed;

  try {
    const item =
      parsed.action === "confirm"
        ? await confirmRecord(parsed.code, parsed.period, parsed.input)
        : await unconfirmRecord(parsed.code, parsed.period);
    const body: ConfirmResponse = { item };
    return Response.json(body, { headers: NO_STORE });
  } catch (error) {
    return storeErrorResponse(error);
  }
}
