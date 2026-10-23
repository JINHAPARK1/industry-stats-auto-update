// 로그인 전에 열리는 소개 세부 화면(/intro/문제 등 5개)의 내용과 HTML을 만든다.
// 내용은 intro-content.json 한 곳에만 두고, 소개 화면의 메뉴(드롭다운)도 같은 파일에서 만든다.
// 공개 화면이라 통계 수치·계정·키·직원 수·이상치 기준 숫자는 넣지 않는다. 외부 주소로 요청하지 않는다.
import content from "./intro-content.json";

export interface IntroItem {
  id: string;
  heading: string;
  body: string[];
}

export interface IntroSection {
  slug: string;
  label: string;
  title: string;
  lead: string;
  items: IntroItem[];
}

export const INTRO_SECTIONS: IntroSection[] = content;

/** 로그인 없이 열리는 세부 화면 주소 (proxy.ts가 이 주소만 허용한다) */
export const INTRO_PAGE_PATHS: string[] = INTRO_SECTIONS.map((section) => `/intro/${section.slug}`);

const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:#05070b;color:#e8edf3;font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif;line-height:1.75;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.top{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px clamp(16px,4vw,40px);background:rgba(5,7,11,.82);backdrop-filter:blur(14px);border-bottom:1px solid rgba(255,255,255,.08)}
.brand{font-weight:900;font-size:18px;letter-spacing:-.01em}
.brand small{display:block;font-size:10px;letter-spacing:.14em;color:#8fe3ff;font-weight:600}
.tabs{display:flex;gap:4px;flex-wrap:wrap;justify-content:center}
.tabs a{padding:7px 14px;border-radius:999px;font-size:14px;color:rgba(255,255,255,.8)}
.tabs a:hover{background:rgba(255,255,255,.07);color:#fff}
.tabs a[aria-current="page"]{background:#fff;color:#05070b;font-weight:700}
.cta{padding:9px 20px;border-radius:999px;font-size:14px;font-weight:700;color:#fff;background:linear-gradient(180deg,#1e6f95,#0f4a6c);border:1px solid rgba(143,227,255,.45)}
.cta:hover{filter:brightness(1.15)}
main{max-width:860px;margin:0 auto;padding:clamp(32px,6vw,72px) clamp(16px,4vw,32px) 80px}
.eyebrow{color:#8fe3ff;font-size:13px;font-weight:700;letter-spacing:.08em}
h1{margin:10px 0 18px;font-size:clamp(26px,5vw,40px);line-height:1.25;letter-spacing:-.02em;font-weight:900}
.lead{margin:0 0 28px;font-size:clamp(16px,2.2vw,18px);color:#b7c0cb}
.toc{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 40px;padding:0;list-style:none}
.toc a{display:block;padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);font-size:14px;color:#cfe9f5}
.toc a:hover{background:rgba(143,227,255,.1)}
section.item{margin:0 0 20px;padding:24px clamp(18px,3vw,28px);border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.09);scroll-margin-top:84px}
section.item h2{margin:0 0 10px;font-size:clamp(18px,2.6vw,22px);letter-spacing:-.01em}
section.item p{margin:0 0 10px;color:#c6ced8;font-size:16px}
section.item p:last-child{margin-bottom:0}
.pager{display:flex;justify-content:space-between;gap:12px;margin-top:40px;flex-wrap:wrap}
.pager a{padding:12px 20px;border-radius:14px;border:1px solid rgba(255,255,255,.14);font-size:15px;color:#cfe9f5}
.pager a:hover{background:rgba(255,255,255,.07)}
footer{margin-top:48px;padding-top:20px;border-top:1px solid rgba(255,255,255,.08);color:#8b95a1;font-size:13px}
@media (max-width:760px){.top{flex-wrap:wrap}.tabs{order:3;width:100%;justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap}.tabs a{white-space:nowrap}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`;

/** 세부 화면 한 장의 HTML. 없는 주소면 null. */
export function renderIntroPage(slug: string): string | null {
  const index = INTRO_SECTIONS.findIndex((section) => section.slug === slug);
  if (index < 0) return null;
  const section = INTRO_SECTIONS[index];
  const prev = INTRO_SECTIONS[index - 1];
  const next = INTRO_SECTIONS[index + 1];

  const tabs = INTRO_SECTIONS.map(
    (s) => `<a href="/intro/${s.slug}"${s.slug === slug ? ' aria-current="page"' : ""}>${esc(s.label)}</a>`,
  ).join("");
  const toc = section.items.map((item) => `<li><a href="#${item.id}">${esc(item.heading)}</a></li>`).join("");
  const items = section.items
    .map(
      (item) =>
        `<section class="item" id="${item.id}"><h2>${esc(item.heading)}</h2>${item.body.map((p) => `<p>${esc(p)}</p>`).join("")}</section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(section.label)} — 산업통계 자동 업데이트 시스템</title>
<style>${STYLE}</style>
</head>
<body>
<header class="top">
<a class="brand" href="/intro"><small>STATS</small>산업통계</a>
<nav class="tabs" aria-label="소개 목차">${tabs}</nav>
<a class="cta" href="/login">앱 열기</a>
</header>
<main>
<div class="eyebrow">${esc(section.label)}</div>
<h1>${esc(section.title)}</h1>
<p class="lead">${esc(section.lead)}</p>
<ul class="toc">${toc}</ul>
${items}
<div class="pager">${prev ? `<a href="/intro/${prev.slug}">← ${esc(prev.label)}</a>` : `<a href="/intro">← 소개 화면</a>`}${next ? `<a href="/intro/${next.slug}">${esc(next.label)} →</a>` : `<a href="/login">앱 열기 →</a>`}</div>
<footer>산업경제과 내부용 시스템 · 공개 통계(KOSIS)만 다룹니다.</footer>
</main>
</body>
</html>`;
}
