// Design Ref: §3 기본 Next.js — `proxy.ts`는 비밀번호를 확인하지 않은 사람을 `/login`으로 돌려보내는 1차 문지기다.
// Next.js 안내서: proxy는 1차(낙관적) 확인용이고 완전한 인증 수단이 아니다. 그래서 각 API가 `requireLogin`으로 한 번 더 확인한다.
// Plan SC: PLAN 8번 — 비밀번호를 입력하기 전에는 어떤 통계 화면도 보이지 않는다.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isLoggedIn } from "@/lib/auth";

/** 로그인하지 않아도 열 수 있는 주소. 로그인 화면과 로그인·로그아웃 API뿐이다. */
const PUBLIC_PATHS = new Set(["/login", "/api/login", "/api/logout"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const loggedIn = await isLoggedIn(request);

  if (PUBLIC_PATHS.has(pathname)) {
    // 이미 들어와 있는데 로그인 화면을 열면 첫 화면으로 보낸다.
    if (pathname === "/login" && loggedIn) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (loggedIn) return NextResponse.next();

  // API는 화면 이동 대신 오류로 답한다.
  if (pathname.startsWith("/api/")) {
    return Response.json(
      { error: { code: "login-required", message: "먼저 비밀번호를 입력해 주세요." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // 화면 파일(_next/static, _next/image)과 탭 아이콘만 빼고 모든 요청을 확인한다. API도 포함한다.
  matcher: ["/((?!_next/static/|_next/image/|favicon\.ico$).*)"],
};
