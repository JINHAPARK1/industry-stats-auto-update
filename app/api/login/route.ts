// Design Ref: §2 폴더와 파일 구조 — `app/api/login/`은 비밀번호를 확인하고 접속 쿠키를 심는다.
// Plan SC: PLAN 8번 — 비밀번호가 맞기 전에는 통계 화면이 열리지 않는다. 틀려도 이유는 알려 주지 않는다.
import {
  MAX_PASSWORD_LENGTH,
  authErrorResponse,
  buildSessionCookie,
  createSessionToken,
  isAuthConfigured,
  isSameOrigin,
  verifyPassword,
} from "@/lib/auth";

/** 틀렸을 때 잠깐 기다렸다가 답한다. 연속으로 대입해 보는 속도를 늦추려는 것이며, 틀린 횟수 제한(저장소 필요)을 대신하지는 못한다. */
const WRONG_PASSWORD_DELAY_MS = 500;

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return authErrorResponse(403, "bad-origin", "잘못된 요청입니다.");
  }
  if (!isAuthConfigured()) {
    return authErrorResponse(503, "auth-not-configured", "접속 설정이 되어 있지 않습니다. 운영자에게 알려 주세요.");
  }

  let password: unknown;
  try {
    password = ((await request.json()) as { password?: unknown } | null)?.password;
  } catch {
    return authErrorResponse(400, "invalid-body", "요청 내용을 읽을 수 없습니다.");
  }
  if (typeof password !== "string" || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return authErrorResponse(400, "invalid-password", "비밀번호를 입력해 주세요.");
  }

  if (!(await verifyPassword(password))) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
    return authErrorResponse(401, "wrong-password", "비밀번호가 맞지 않습니다.");
  }

  const token = await createSessionToken();
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store", "Set-Cookie": buildSessionCookie(token) } },
  );
}
