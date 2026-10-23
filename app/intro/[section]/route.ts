// 로그인 전 소개 세부 화면(문제·해결·핵심 기능·신뢰·보안·성공 기준). 주소는 lib/intro-content.json에 있는 5개뿐이다.
// 문지기(proxy.ts)가 이 5개 주소만 로그인 없이 열어 주고, 이 주소 전용 CSP는 next.config.ts에서 붙인다.
import { renderIntroPage } from "@/lib/intro-pages";

export async function GET(_request: Request, ctx: RouteContext<"/intro/[section]">) {
  const { section } = await ctx.params;
  const html = renderIntroPage(section);
  if (!html) return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
