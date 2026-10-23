// design-samples/industry-stats-intro/index.html 을 로그인 전 공개용으로 다듬어 lib/intro-html.ts 로 만든다.
// 공개 화면이라 내부 운영 정보(이상치 기준 숫자, 직원 수, 접속 방식, 통계표 번호)는 뺀다. 외부 글꼴 서버 호출도 뺀다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/");
let h = fs.readFileSync(ROOT + "/design-samples/industry-stats-intro/index.html", "utf8").replace(/\r\n/g, "\n");
const must = (a, b) => { if (!h.includes(a)) throw new Error("못 찾음: " + a.slice(0, 60)); h = h.split(a).join(b); };

// 1) 외부 글꼴 서버(Google Fonts) 호출 제거: 방문자 정보가 제3자에게 가지 않게 하고, 인터넷 없이도 열리게 한다.
h = h.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n<link href="https:\/\/fonts\.googleapis\.com[^\n]*\n/, "");
if (h.includes("fonts.googleapis")) throw new Error("글꼴 링크가 남았어요");

// 1-1) 메뉴 드롭다운에 들어갈 항목을 세부 화면 내용(lib/intro-content.json)에서 가져와 넣는다. (제목과 소제목만)
const menu = JSON.parse(fs.readFileSync(ROOT + "/lib/intro-content.json", "utf8")).map((s) => ({
  slug: s.slug,
  label: s.label,
  items: s.items.map((i) => ({ id: i.id, heading: i.heading })),
}));
must("var MENU=/*MENU*/[];", "var MENU=" + JSON.stringify(menu) + ";");

// 2) 버튼을 로그인 화면으로 연결
must('<a class="btn" href="#"><span id="ctaLabel">앱 열기</span></a>', '<a class="btn" href="/login"><span id="ctaLabel">앱 열기</span></a>');
must('<a class="btn cta2" href="#"><span id="vpLabel">소개 보기</span></a>', '<a class="btn cta2" href="/login"><span id="vpLabel">들어가기</span></a>');

// 3) 공개 화면에서 내부 운영 정보 제거
must("한글 서식에 채워 넣습니다. 산업경제과 7명이 같은 수치를 봅니다.", "한글 서식에 채워 넣습니다. 담당 부서가 같은 수치를 봅니다.");
must("<span>산업경제과 내부용 · 공용 비밀번호로 접속</span>", "<span>산업경제과 내부용 시스템</span>");
h = h.replace(/ *\{f:'[^\n]*\n/g, (line) => line.replace(/,t:'[^']*'/, ",t:''").replace(/,r:'[^']*'/, ",r:''"));
must("'<div class=\"mt\">'+d.p+' · 전년동월 대비<b>이상치 기준 '+d.r+'</b></div>'+", "'<div class=\"mt\">'+d.p+' · 전년동월 대비<b>이상치는 표시만</b></div>'+");
must("'<div class=\"src\">KOSIS '+d.t+'</div><div class=\"bar\"></div></div>';", "'<div class=\"src\">KOSIS 국가통계포털</div><div class=\"bar\"></div></div>';");

const out =
`// 로그인 전 첫 화면(/intro)의 HTML. 원본 시안은 design-samples/industry-stats-intro/index.html 이고,
// 공개용으로 다듬어(내부 운영 정보·외부 글꼴 호출 제거, 버튼은 /login 연결) 이 파일로 옮겼다.
// 다시 만들 때는 시안을 고친 뒤 같은 규칙으로 옮긴다. 이 화면에는 통계 수치·계정·키가 들어 있지 않다.
export const INTRO_HTML: string = ${JSON.stringify(h)};
`;
fs.writeFileSync(ROOT + "/lib/intro-html.ts", out);
console.log("lib/intro-html.ts 생성", out.length);
