// Design Ref: §2 흐름 C — 「한글 서식 내려받기」: 확정된 수치만 한글 서식(.hwpx) 표에 넣어 내려받게 한다.
// Plan SC: PLAN 16번 — 확정 전 수치는 서식에 넣지 않는다. 확정한 수치가 없으면 파일을 만들지 않는다.
import { requireLogin } from "@/lib/auth";
import { NO_STORE, errorResponse, storeErrorResponse } from "@/lib/api-response";
import { FormError, buildFormHwpx } from "@/lib/hwpx-form";
import { listLatestConfirmed } from "@/lib/store";

/** GET /api/form → 확정된 최신 수치로 만든 한글 서식(.hwpx) 파일 */
export async function GET(request: Request): Promise<Response> {
  const denied = await requireLogin(request);
  if (denied) return denied;

  try {
    const confirmed = await listLatestConfirmed();
    const file = await buildFormHwpx(confirmed);

    // 파일 이름에는 확정된 월간 수치 중 가장 최근 기준시점을 쓴다.
    const month = confirmed
      .filter((item) => item.frequency === "M" && item.period)
      .map((item) => item.period as string)
      .sort()
      .at(-1);
    const fileName = `산경과_주요통계${month ? `_${month}` : ""}.hwpx`;
    return new Response(new Uint8Array(file), {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/hwp+zip",
        "Content-Disposition": `attachment; filename="form.hwpx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    if (error instanceof FormError) {
      return errorResponse(error.kind === "no-confirmed" ? 409 : 503, error.kind, error.message);
    }
    return storeErrorResponse(error);
  }
}
