// 한글 서식 샘플(.hwpx) 만들기 — 지표 10개의 최신 수치를 표로 채운 연습용 파일을 만든다.
// 실제 서식이 아니라 임의로 만든 샘플이다. 저장소(.data/store.json)에 있는 값을 읽어 넣으며, 확정 전 값은 "미확정"으로 표시한다.
// 실행: node samples/make-sample-hwpx.mjs   →   samples/산경과_주요통계_샘플.hwpx
// .hwpx는 압축(zip) 파일이라, 별도 라이브러리 없이 Node 기본 기능(zlib)으로 직접 묶는다.
import { readFileSync, writeFileSync } from "node:fs";
import { crc32 } from "node:zlib";

const root = new URL("../", import.meta.url);
const store = JSON.parse(readFileSync(new URL(".data/store.json", root), "utf8"));
const order = [
  "manufacturing-production", "semiconductor-production", "pharma-production", "semiconductor-equipment-investment",
  "auto-production", "auto-investment", "primary-metal-production", "petroleum-production",
  "manufacturing-utilization", "new-firms",
];

// ── 1. 표에 넣을 줄 만들기 (지표마다 가장 최근 기준시점 한 건) ──
const records = Object.values(store.records);
const codes = [...new Set(records.map((r) => r.code))];
const latestByCode = (code) => records.filter((r) => r.code === code).sort((a, b) => b.period.localeCompare(a.period))[0];
const rows = (order.every((c) => codes.includes(c)) ? order : codes).map(latestByCode);

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
    fmtChange(r.variation) + (r.variation?.isOutlier ? " ⚠" : ""), confirmed ? "확정" : "미확정", r.source,
  ];
});
const widths = [5200, 9800, 4200, 5000, 4400, 5600, 3400, 12000]; // 합계 49600 (가로 방향 용지 폭에 맞춤)
const today = new Date().toISOString().slice(0, 10);

// ── 2. hwpx 안에 들어가는 XML 만들기 ──
const NS =
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" ' +
  'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" ' +
  'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" ' +
  'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" ' +
  'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
  'xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" ' +
  'xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';

const fontfaces = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"]
  .map((lang) => `<hh:fontface lang="${lang}" fontCnt="1"><hh:font id="0" face="맑은 고딕" type="TTF" isEmbedded="0"/></hh:fontface>`)
  .join("");
const charPr = (id, height, bold) =>
  `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">` +
  '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>' +
  '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>' +
  '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>' +
  `${bold ? "<hh:bold/>" : ""}<hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr>`;
const paraPr = (id, align) =>
  `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">` +
  `<hh:align horizontal="${align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>` +
  '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>' +
  '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>' +
  '<hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>';
const line = (type) => `type="${type}" width="0.12 mm" color="#000000"`;
const borderFill = (id, solid) =>
  `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
  ["leftBorder", "rightBorder", "topBorder", "bottomBorder"].map((n) => `<hh:${n} ${line(solid ? "SOLID" : "NONE")}/>`).join("") +
  '<hh:diagonal type="NONE" width="0.1 mm" color="#000000"/></hh:borderFill>';

const headerXml =
  `${XML}<hh:head ${NS} version="1.4" secCnt="1"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList>` +
  `<hh:fontfaces itemCnt="7">${fontfaces}</hh:fontfaces>` +
  `<hh:borderFills itemCnt="2">${borderFill(1, false)}${borderFill(2, true)}</hh:borderFills>` +
  `<hh:charProperties itemCnt="3">${charPr(0, 1000, false)}${charPr(1, 1000, true)}${charPr(2, 1800, true)}</hh:charProperties>` +
  '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>' +
  `<hh:paraProperties itemCnt="3">${paraPr(0, "LEFT")}${paraPr(1, "CENTER")}${paraPr(2, "RIGHT")}</hh:paraProperties>` +
  '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>' +
  "</hh:refList><hh:compatibleDocument targetProgram=\"HWP201X\"><hh:layoutCompatibility/></hh:compatibleDocument><hh:docOption><hh:linkinfo path=\"\" pageInherit=\"0\" footnoteInherit=\"0\"/></hh:docOption></hh:head>";

let idSeq = 1000;
const para = (text, charId = 0, paraId = 0, extraRun = "") =>
  `<hp:p id="${idSeq++}" paraPrIDRef="${paraId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charId}">${extraRun}<hp:t>${esc(text)}</hp:t></hp:run></hp:p>`;
const cell = (text, col, row, w, head, align) =>
  `<hp:tc name="" header="${head ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
  `${para(text, head ? 1 : 0, align)}</hp:subList><hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${w}" height="2400"/><hp:cellMargin left="300" right="300" top="150" bottom="150"/></hp:tc>`;
const alignOf = (c) => (c === 3 || c === 5 ? 2 : c === 1 || c === 7 ? 0 : 1); // 수치·대비는 오른쪽, 지표·출처는 왼쪽, 나머지는 가운데
const tableRows = [header, ...body]
  .map((r, ri) => `<hp:tr>${r.map((t, ci) => cell(t, ci, ri, widths[ci], ri === 0, ri === 0 ? 1 : alignOf(ci))).join("")}</hp:tr>`)
  .join("");
const totalWidth = widths.reduce((a, b) => a + b, 0);
const table =
  `<hp:p id="${idSeq++}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:tbl id="${idSeq++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${body.length + 1}" colCnt="${header.length}" cellSpacing="0" borderFillIDRef="2" noAdjust="0">` +
  `<hp:sz width="${totalWidth}" widthRelTo="ABSOLUTE" height="${(body.length + 1) * 2400}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
  `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>${tableRows}</hp:tbl><hp:t/></hp:run></hp:p>`;

const secPr =
  `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>` +
  `<hp:pagePr landscape="WIDELY" width="84188" height="59528" gutterType="LEFT_ONLY"><hp:margin header="2000" footer="2000" gutter="0" left="5000" right="5000" top="4000" bottom="3500"/></hp:pagePr></hp:secPr>`;

const section =
  `${XML}<hs:sec ${NS}>` +
  para("산경과 주요 통계 (샘플)", 2, 1, secPr) +
  para(`※ 연습용으로 임의로 만든 서식입니다. 기준일 ${today}. 출처는 KOSIS(국가통계포털)이며 공개 통계만 담았습니다.`, 0, 0) +
  para(`※ "미확정" 수치는 아직 사람이 확인·확정하지 않은 값입니다. ⚠는 전년(동월) 대비 변동이 기준을 넘은 이상치 표시입니다.`, 0, 0) +
  para("", 0, 0) + table + para("", 0, 0) +
  para("작성: 산업경제과 (자동 입력 샘플)", 0, 2) +
  "</hs:sec>";

const contentHpf =
  `${XML}<opf:package ${NS} version="" unique-identifier="" id=""><opf:metadata><opf:title>산경과 주요 통계 (샘플)</opf:title><opf:language>ko</opf:language></opf:metadata>` +
  '<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>' +
  '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>';
const container =
  `${XML}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles>` +
  '<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>';
const versionXml =
  `${XML}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="11, 0, 0, 0"/>`;
const settingsXml = `${XML}<ha:HWPApplicationSetting ${NS}><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`;

// ── 3. zip으로 묶기 (mimetype은 맨 앞에 압축 없이 넣는다) ──
const files = [
  ["mimetype", "application/hwp+zip"],
  ["version.xml", versionXml],
  ["settings.xml", settingsXml],
  ["META-INF/container.xml", container],
  ["Contents/content.hpf", contentHpf],
  ["Contents/header.xml", headerXml],
  ["Contents/section0.xml", section],
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
