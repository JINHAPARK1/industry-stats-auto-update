// Design Ref: §2 흐름 C — 「한글 서식 내려받기」: 확정된 수치만 한글 서식(.hwpx) 표에 넣어 내려받게 한다. 서식은 두 가지다.
//   GET /api/form             → 이번 월 서식 (확정된 최신 달 기준. ?month=202608 로 달을 고를 수 있다)
//   GET /api/form?type=trend  → 시계열 추이 서식 (지표별 직전 12개월 흐름)
// Plan SC: PLAN 16번 — 확정 전 수치는 서식에 넣지 않는다. 확정한 수치가 없으면 파일을 만들지 않는다.
import { requireLogin } from "@/lib/auth";
import { NO_STORE, errorResponse, storeErrorResponse } from "@/lib/api-response";
import { FormError, buildFormHwpx, buildTrendHwpx } from "@/lib/hwpx-form";
import { listConfirmedForMonth, listRecordsByIndicator } from "@/lib/store";

/** 내려받는 파일 응답을 만든다. 한글 파일 이름은 UTF-8로 인코딩해 알린다. */
function fileResponse(file: Buffer, fileName: string): Response {
  return new Response(new Uint8Array(file), {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/hwp+zip",
      "Content-Disposition": `attachment; filename="form.hwpx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireLogin(request);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "monthly";
  const monthParam = params.get("month") ?? undefined;
  if (monthParam !== undefined && !/^\d{4}(0[1-9]|1[0-2])$/.test(monthParam)) {
    return errorResponse(400, "invalid-month", "대상 월은 2026년 8월이면 202608처럼 적어 주세요.");
  }
  if (type !== "monthly" && type !== "trend") {
    return errorResponse(400, "invalid-type", "서식 종류를 알 수 없습니다.");
  }

  try {
    if (type === "trend") {
      const records = await listRecordsByIndicator();
      const file = await buildTrendHwpx(records);
      // 파일 이름에는 확정된 월간 수치 중 가장 최근 기준시점을 쓴다.
      const month = Object.values(records)
        .flat()
        .filter((item) => item.frequency === "M" && item.state === "confirmed" && item.period)
        .map((item) => item.period as string)
        .sort()
        .at(-1);
      return fileResponse(file, `산경과_지표별_추이${month ? `_${month}` : ""}.hwpx`);
    }

    // 한 달 기준으로 채운다. 고른 달(없으면 확정된 최신 달)에 확정된 값만 넣고, 다른 달의 확정 값으로 채우지 않는다.
    const { month, items } = await listConfirmedForMonth(monthParam);
    const file = await buildFormHwpx(items, month);
    return fileResponse(file, `산경과_주요통계${month ? `_${month}` : ""}.hwpx`);
  } catch (error) {
    if (error instanceof FormError) {
      return errorResponse(error.kind === "no-confirmed" ? 409 : 503, error.kind, error.message);
    }
    return storeErrorResponse(error);
  }
}
