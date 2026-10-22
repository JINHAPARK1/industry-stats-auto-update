// 한글 서식 샘플(.hwpx) 만들기 — 지표 10개의 최신 수치를 표로 채운 연습용 파일을 만든다.
// 실제 서식이 아니라 임의로 만든 샘플이다. 저장소(.data/store.json)에 있는 값을 읽어 넣으며, 확정 전 값은 "미확정"으로 표시한다.
// 실행: node samples/make-sample-hwpx.mjs   →   samples/산경과_주요통계_샘플.hwpx
//
// 한글이 만든 진짜 .hwpx에서 뽑은 기본 틀(samples/base-template/)을 바탕으로 만든다.
// 직접 처음부터 쓰면 한글이 요구하는 필수 요소가 빠져 열리지 않는다. 기본 틀은 출처의 사용 조건이 없어서 git에는 올리지 않는다.
// .hwpx는 압축(zip) 파일이라, 별도 라이브러리 없이 Node 기본 기능(zlib)으로 직접 묶는다.
import { readFileSync, writeFileSync } from "node:fs";
import { crc32 } from "node:zlib";

const root = new URL("../", import.meta.url);
const base = (path) => readFileSync(new URL(`samples/base-template/${path}`, root), "utf8").replace(/\r\n/g, "\n");
const store = JSON.parse(readFileSync(new URL(".data/store.json", root), "utf8"));
const order = [
  "manufacturing-production", "semiconductor-production", "pharma-production", "semiconductor-equipment-investment",
  "auto-production", "auto-investment", "primary-metal-production", "petroleum-production",
  "manufacturing-utilization", "new-firms",
];

// ── 1. 표에 넣을 줄 만들기 (지표마다 가장 최근 기준시점 한 건) ──
const records = Object.values(store.records);
const latestByCode = (code) => records.filter((r) => r.code === code).sort((a, b) => b.period.localeCompare(a.period))[0];
const rows = order.map(latestByCode).filter(Boolean);

const fmtNum = (n) => (n === null || n === undefined ? "-" : Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 2 }));
const fmtPeriod = (p) => (p.length === 6 ? `${p.slice(0, 4)}.${p.slice(4)}` : `${p}년`);
const fmtChange = (v) => {
  if (!v) return "-";
  if (v.measure === "point") return v.changePoint === null ? "-" : `${v.changePoint > 0 ? "+" : ""}${v.changePoint}%p`;
  return v.changePercent === null ? "-" : `${v.changePercent > 0 ? "+" : ""}${v.changePercent}%`;
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const header = ["분야", "지표", "기준시점", "수치", "단위", "전년(동월) 대비", "상태", "출처"];
const body = rows.map((r) => {
  const confirmed = r.state === "confirmed" && r.confirmed;
  return [
    r.field, r.name, fmtPeriod(r.period), fmtNum(confirmed ? r.confirmed.value : r.originalValue), r.unit,
    fmtChange(r.variation) + (r.variation?.isOutlier ? " (이상치)" : ""), confirmed ? "확정" : "미확정", r.source,
  ];
});
const widths = [4200, 8200, 4000, 4400, 3600, 4600, 3200, 10320]; // 합계 42520 = 용지 폭(59528) - 좌우 여백(8504 x 2)
const alignOf = (c) => (c === 3 || c === 5 ? 21 : c === 1 || c === 7 ? 11 : 20); // 21 오른쪽, 11 왼쪽, 20 가운데
const today = new Date().toISOString().slice(0, 10);

// ── 2. 기본 틀의 header.xml에 필요한 서식(테두리·굵은 글씨·가운데/오른쪽 맞춤)을 덧붙인다 ──
let headerXml = base("Contents/header.xml");
const fill = (color) => `<hc:fillBrush><hc:winBrush faceColor="${color}" hatchColor="#999999" alpha="0"/></hc:fillBrush>`;
const borderFill = (id, color) =>
  `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
  ["leftBorder", "rightBorder", "topBorder", "bottomBorder"].map((n) => `<hh:${n} type="SOLID" width="0.12 mm" color="#000000"/>`).join("") +
  `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>${fill(color)}</hh:borderFill>`;
const charPr = (id, height) =>
  `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">` +
  '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>' +
  '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>' +
  '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:bold/><hh:underline type="NONE" shape="SOLID" color="#000000"/>' +
  '<hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/></hh:charPr>';
const leftPara = headerXml.match(/<hh:paraPr id="11"[\s\S]*?<\/hh:paraPr>/)[0];
const paraPr = (id, align) => leftPara.replace('id="11"', `id="${id}"`).replace('horizontal="LEFT"', `horizontal="${align}"`);

const grow = (tag, addCount, addXml) => {
  const re = new RegExp(`<hh:${tag} itemCnt="(\\d+)">([\\s\\S]*?)</hh:${tag}>`);
  const m = headerXml.match(re);
  if (!m) throw new Error(`header.xml에 ${tag}가 없습니다`);
  headerXml = headerXml.replace(re, () => `<hh:${tag} itemCnt="${Number(m[1]) + addCount}">${m[2]}${addXml}</hh:${tag}>`);
};
grow("borderFills", 2, borderFill(3, "none") + borderFill(4, "#E5E5E5")); // 3 = 본문 칸 테두리, 4 = 머리글 칸(회색)
grow("charProperties", 2, charPr(7, 900) + charPr(8, 1600)); // 7 = 굵은 9pt, 8 = 제목 굵은 16pt
grow("paraProperties", 2, paraPr(20, "CENTER") + paraPr(21, "RIGHT")); // 11 = 왼쪽(기존), 20 = 가운데, 21 = 오른쪽

// ── 3. section0.xml: 기본 틀의 첫 문단(쪽 설정 포함)을 제목 문단으로 쓰고, 안내 문구와 표를 덧붙인다 ──
let section = base("Contents/section0.xml");
let idSeq = 2000000000;
const para = (text, charId, paraId) =>
  `<hp:p id="${idSeq++}" paraPrIDRef="${paraId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charId}"><hp:t>${esc(text)}</hp:t></hp:run></hp:p>`;
const cell = (text, col, row, isHead) =>
  `<hp:tc name="" header="${isHead ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${isHead ? 4 : 3}">` +
  `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
  `${para(text, isHead ? 7 : 2, isHead ? 20 : alignOf(col))}</hp:subList>` +
  `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${widths[col]}" height="2600"/><hp:cellMargin left="283" right="283" top="141" bottom="141"/></hp:tc>`;
const tableRows = [header, ...body]
  .map((r, ri) => `<hp:tr>${r.map((t, ci) => cell(t, ci, ri, ri === 0)).join("")}</hp:tr>`)
  .join("");
const totalWidth = widths.reduce((a, b) => a + b, 0);
const table =
  `<hp:p id="${idSeq++}" paraPrIDRef="11" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="2">` +
  `<hp:tbl id="${idSeq++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${body.length + 1}" colCnt="${header.length}" cellSpacing="0" borderFillIDRef="3" noAdjust="0">` +
  `<hp:sz width="${totalWidth}" widthRelTo="ABSOLUTE" height="${(body.length + 1) * 2600}" heightRelTo="ABSOLUTE" protect="0"/>` +
  `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
  `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="141" right="141" top="141" bottom="141"/>${tableRows}</hp:tbl><hp:t/></hp:run></hp:p>`;

const extra =
  para("", 2, 11) +
  para("산경과 주요 통계 (샘플)", 8, 20) +
  para(`※ 연습용으로 임의로 만든 서식입니다. 기준일 ${today}. 출처는 KOSIS(국가통계포털)이며 공개 통계만 담았습니다.`, 2, 11) +
  para(`※ "미확정" 수치는 아직 사람이 확인·확정하지 않은 값입니다. (이상치)는 전년(동월) 대비 변동이 기준을 넘었다는 표시입니다.`, 2, 11) +
  para("", 2, 11) + table + para("", 2, 11) +
  para("작성: 산업경제과 (자동 입력 샘플)", 2, 21);
section = section.replace("</hs:sec>", () => `${extra}</hs:sec>`);

// ── 4. 나머지 파일은 기본 틀 그대로 쓰되, 제목만 바꾼다 ──
const contentHpf = base("Contents/content.hpf").replace("<opf:title/>", "<opf:title>산경과 주요 통계 (샘플)</opf:title>");
const previewText = `산경과 주요 통계 (샘플)\n${body.map((r) => r.slice(0, 5).join(" ")).join("\n")}\n`;

// ── 5. zip으로 묶기 (mimetype은 맨 앞에 압축 없이 넣는다) ──
const files = [
  ["mimetype", base("mimetype").trim()],
  ["version.xml", base("version.xml")],
  ["settings.xml", base("settings.xml")],
  ["META-INF/container.xml", base("META-INF/container.xml")],
  ["META-INF/container.rdf", base("META-INF/container.rdf")],
  ["META-INF/manifest.xml", base("META-INF/manifest.xml")],
  ["Contents/content.hpf", contentHpf],
  ["Contents/header.xml", headerXml],
  ["Contents/section0.xml", section],
  ["Preview/PrvText.txt", previewText],
];
const chunks = [];
const central = [];
let offset = 0;
for (const [name, text] of files) {
  const nameBuf = Buffer.from(name, "utf8");
  const data = Buffer.from(text, "utf8");
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
  local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
  chunks.push(local, nameBuf, data);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
  c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
  central.push(c, nameBuf);
  offset += local.length + nameBuf.length + data.length;
}
const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);

const outPath = new URL("산경과_주요통계_샘플.hwpx", import.meta.url);
writeFileSync(outPath, Buffer.concat([...chunks, centralBuf, end]));
console.log(`만들었습니다: samples/산경과_주요통계_샘플.hwpx (지표 ${rows.length}개)`);
for (const r of body) console.log(r.slice(0, 7).join(" | "));
