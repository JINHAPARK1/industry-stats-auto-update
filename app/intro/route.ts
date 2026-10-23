// 로그인 전 첫 화면(/intro). 소개 문구와 「들어가기」 버튼만 있고, 통계 수치·계정·키는 들어 있지 않다.
// 화면 자체가 한 장짜리 HTML이라 라우트 핸들러로 그대로 내려 준다. 문지기(proxy.ts)가 이 주소만 로그인 없이 열어 준다.
// 이 주소 전용 내용 보안 정책은 next.config.ts에서 붙인다. (lib/intro-csp.ts)
import { INTRO_HTML } from "@/lib/intro-html";

export function GET() {
  return new Response(INTRO_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
