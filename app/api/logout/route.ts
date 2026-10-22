// Design Ref: §2 폴더와 파일 구조 — `app/api/logout/`은 접속 쿠키를 지워 「나가기」를 처리한다.
// Plan SC: PLAN 8번 — 로그인·로그아웃 경로.
import { authErrorResponse, buildClearCookie, isSameOrigin } from "@/lib/auth";

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return authErrorResponse(403, "bad-origin", "잘못된 요청입니다.");
  }
  // 로그인하지 않은 상태에서 불러도 문제없다. 쿠키를 지우기만 한다.
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": buildClearCookie() } });
}
