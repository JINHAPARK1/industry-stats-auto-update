// 이상치가 아니고 전년 값과 비교할 수 있는 수치를 한 번에 확정한다. 화면에서 목록을 사람이 확인한 뒤 누르는 버튼이 부른다.
// 사람의 확인을 건너뛰지 않도록, 이상치이거나 전년 값이 없어 비교할 수 없는 수치는 서버가 직접 걸러 확정하지 않는다. (이런 수치는 하나씩 원 통계표와 대조해 확정한다)
// 항목마다 사람이 화면에서 본 값(value)을 함께 받고, 서버에 지금 저장된 값과 다르면 그 항목은 확정하지 않는다.
// 고친 값은 이 API로 확정하지 않는다. KOSIS 값 그대로 확정한다.
import { requireLogin } from "@/lib/auth";
import { NO_STORE, errorResponse, rejectUnsafeRequest } from "@/lib/api-response";
import type { BatchConfirmResponse } from "@/lib/collect-types";
import { INDICATORS } from "@/lib/indicators";
import { StoreError, confirmRecord } from "@/lib/store";
import type { CollectItem } from "@/lib/collect-types";

/** 한 번에 확정할 수 있는 최대 개수. 지표 10개 × 월 12개를 넘지 않는다. */
const MAX_ITEMS = 130;

export async function POST(request: Request): Promise<Response> {
  const denied = await requireLogin(request);
  if (denied) return denied;
  const unsafe = rejectUnsafeRequest(request);
  if (unsafe) return unsafe;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid-body", "요청 내용을 읽을 수 없습니다.");
  }
  const list = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_ITEMS) {
    return errorResponse(400, "invalid-body", "확정할 수치 목록을 보내 주세요.");
  }
  const targets: { code: string; period: string; value: number }[] = [];
  for (const entry of list) {
    const { code, period, value } = (entry ?? {}) as Record<string, unknown>;
    if (typeof code !== "string" || !INDICATORS.some((i) => i.code === code)) {
      return errorResponse(400, "invalid-code", "지표를 알 수 없습니다.");
    }
    if (typeof period !== "string" || !/^\d{4}(0[1-9]|1[0-2])?$/.test(period)) {
      return errorResponse(400, "invalid-period", "기준시점은 202608 또는 2024처럼 적어 주세요.");
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return errorResponse(400, "invalid-expected", "화면을 새로 고친 뒤 다시 확정해 주세요.");
    }
    targets.push({ code, period, value });
  }

  const confirmed: CollectItem[] = [];
  const skipped: BatchConfirmResponse["skipped"] = [];
  for (const { code, period, value } of targets) {
    try {
      // 대조 확인(checkedAgainstSource)을 보내지 않으므로, 이상치는 저장소가 "check-required"로 거절한다.
      confirmed.push(await confirmRecord(code, period, { expectedValue: value }));
    } catch (error) {
      if (error instanceof StoreError && error.kind === "check-required") {
        skipped.push({ code, period, reason: "이상치이거나 전년 값이 없어 건너뜀 (하나씩 원 통계표와 대조해 확정해 주세요)" });
      } else if (error instanceof StoreError && error.kind === "value-changed") {
        skipped.push({ code, period, reason: "화면을 연 뒤 값이 바뀌어 건너뜀 (화면을 새로 고쳐 확인해 주세요)" });
      } else if (error instanceof StoreError && error.kind === "already-confirmed") {
        skipped.push({ code, period, reason: "이미 확정됨" });
      } else if (error instanceof StoreError && error.kind === "not-configured") {
        return errorResponse(503, "not-configured", error.message);
      } else {
        skipped.push({ code, period, reason: error instanceof StoreError ? error.message : "확정하지 못함" });
      }
    }
  }
  const result: BatchConfirmResponse = { confirmed, skipped };
  return Response.json(result, { headers: NO_STORE });
}
