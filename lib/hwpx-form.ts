// Design Ref: §2 흐름 C — 확정된 수치를 한글 서식(.hwpx)의 표에 넣어 내려받게 한다.
// Plan SC: PLAN 16번 — 확정된 수치와 출처·기준시점을 한글 서식 표에 자동 입력한다. 확정 전 수치는 넣지 않는다.
//
// 한글이 만든 진짜 .hwpx에서 뽑은 기본 틀(`FORM_TEMPLATE_DIR`)에 표를 얹어 만든다. 직접 처음부터 쓰면 한글이 열지 못한다.
// 지금 틀은 연습용 기본 틀이고, 실제 서식 파일을 받으면 이 폴더의 파일과 칸 위치 규칙만 바꾸면 된다.
// .hwpx는 압축(zip) 파일이라 별도 라이브러리 없이 Node 기본 기능(zlib)으로 직접 묶는다.
import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { crc32 } from "node:zlib";
import type { CollectItem } from "./collect-types";
import { INDICATORS } from "./indicators";

/** 서식 기본 틀이 들어 있는 폴더. 사용 조건을 알 수 없는 외부 파일이라 git에는 올리지 않는다. */
export const FORM_TEMPLATE_DIR = path.join(process.cwd(), "samples", "base-template");

export class FormError extends Error {
  constructor(
    readonly kind: "no-template" | "no-confirmed",
    message: string,
  ) {
    super(message);
  }
}

const fmtNum = (n: number | null) => (n === null ? "-" : n.toLocaleString("ko-KR", { maximumFractionDigits: 2 }));
const fmtPeriod = (p: string) => (p.length === 6 ? `${p.slice(0, 4)}.${p.slice(4)}` : `${p}년`);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 전년(동월) 대비를 글자로 만든다. */
function fmtChange(item: CollectItem): string {
  const v = item.variation;
  if (!v) return "-";
  const sign = (n: number) => (n > 0 ? "+" : "");
  if (v.measure === "point") return v.changePoint === null ? "-" : `${sign(v.changePoint)}${v.changePoint}%p`;
  return v.changePercent === null ? "-" : `${sign(v.changePercent)}${v.changePercent}%`;
}

const HEADER = ["분야", "지표", "기준시점", "수치", "단위", "전년(동월) 대비", "상태", "출처"];
/** 좌우 여백을 3cm에서 약 1.8cm로 줄여 표 폭을 넓힌다. 표 폭 = 용지 폭(59528) - 좌우 여백(5000 x 2) */
const SIDE_MARGIN = 5000;
const TABLE_WIDTH = 59528 - SIDE_MARGIN * 2;
/** 칸 안쪽 좌우 여백(283 x 2)과 계산 오차를 위한 여유 */
const CELL_PAD = 283 * 2;
const SAFETY = 1.04;
/** 글자 크기 9pt(한글 단위 900) */
const FONT_SIZE = 900;
/** 자간(글자 사이 간격)을 줄일 수 있는 한계. 이보다 더 줄이면 읽기 어려워 줄바꿈을 허용한다. */
export const MIN_SPACING = -15;

/** 글자 하나의 폭(글자 크기 대비 비율). 한글은 1, 숫자·영문·기호는 더 좁게 어림한다. */
function charEm(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x1100) return 1;
  if (ch === " ") return 0.3;
  if (/[0-9]/.test(ch)) return 0.55;
  if (/[A-Z]/.test(ch)) return 0.65;
  if (/[a-z]/.test(ch)) return 0.55;
  if (ch === "(" || ch === ")") return 0.4;
  if (ch === "." || ch === ",") return 0.3;
  if (ch === "%") return 0.85;
  if (ch === "/") return 0.45;
  return 0.6;
}

/** 글자들이 한 줄에 차지하는 폭(한글 단위)을 어림한다. spacing은 자간(%, 0 이하)이다. */
function textWidth(text: string, spacing: number): number {
  return [...text].reduce((sum, ch) => sum + charEm(ch), 0) * FONT_SIZE * (1 + spacing / 100) * SAFETY;
}

/** 한 줄에 들어가는 가장 큰 자간(0에 가까운 값)을 고른다. 한계(-15%)로도 안 들어가면 한계 값을 쓰고 줄바꿈은 그대로 둔다. */
function pickSpacing(text: string, cellWidth: number): number {
  for (let spacing = 0; spacing >= MIN_SPACING; spacing--) {
    if (textWidth(text, spacing) <= cellWidth - CELL_PAD) return spacing;
  }
  return MIN_SPACING;
}

/** 출처 칸에 최소로 남겨 둘 너비. 출처는 길어서 줄바꿈을 허용하지만 너무 좁으면 줄이 너무 많아진다. */
const MIN_SOURCE_WIDTH = 10500;

/**
 * 칸 너비를 정한다. 출처(마지막 칸)를 뺀 칸은 가장 긴 글자가 한 줄에 들어갈 만큼만 주고, 남는 폭은 모두 출처 칸에 준다.
 * 자간은 0에서 시작해 한계(-15%)까지 조금씩 줄여 가며, 출처 칸에 최소 너비가 남는 가장 느슨한 자간을 고른다.
 */
function layoutWidths(rows: string[][]): number[] {
  const last = HEADER.length - 1;
  const needsAt = (spacing: number) =>
    HEADER.slice(0, last).map((title, col) => {
      const widest = Math.max(...rows.map((row) => textWidth(row[col], spacing)));
      // 머리글은 줄바꿈을 허용하므로 머리글 폭은 절반만 반영한다.
      return Math.ceil(Math.max(widest, textWidth(title, spacing) / 2) + CELL_PAD);
    });
  let needs = needsAt(MIN_SPACING);
  for (let spacing = 0; spacing >= MIN_SPACING; spacing--) {
    const candidate = needsAt(spacing);
    if (candidate.reduce((x, y) => x + y, 0) <= TABLE_WIDTH - MIN_SOURCE_WIDTH) {
      needs = candidate;
      break;
    }
  }
  const used = needs.reduce((x, y) => x + y, 0);
  const scale = used > TABLE_WIDTH - MIN_SOURCE_WIDTH ? (TABLE_WIDTH - MIN_SOURCE_WIDTH) / used : 1;
  const widths = needs.map((n) => Math.floor(n * scale));
  return [...widths, TABLE_WIDTH - widths.reduce((x, y) => x + y, 0)];
}

/** 칸 맞춤 서식 번호: 11 왼쪽, 20 가운데, 21 오른쪽 (수치·전년 대비는 오른쪽, 지표·출처는 왼쪽) */
const alignOf = (c: number) => (c === 3 || c === 5 ? 21 : c === 1 || c === 7 ? 11 : 20);

/**
 * 표의 줄을 만든다. 지표 10개가 항상 정의 순서대로 들어가며, 확정된 수치가 없는 지표는 빈칸("-")과 "확정 전"으로 둔다.
 * 수치를 추정해서 채우지 않는다.
 */
function buildRows(confirmed: readonly CollectItem[]): string[][] {
  return INDICATORS.map((indicator) => {
    const item = confirmed.find((c) => c.code === indicator.code && c.state === "confirmed" && c.confirmed);
    if (!item || !item.confirmed || item.period === null) {
      return [indicator.field, indicator.name, "-", "-", indicator.unit, "-", "확정 전", indicator.tableName];
    }
    const status = item.confirmed.edited ? `확정(고침, KOSIS ${fmtNum(item.originalValue)})` : "확정";
    return [
      item.field, item.name, fmtPeriod(item.period), fmtNum(item.confirmed.value), item.unit ?? indicator.unit,
      fmtChange(item) + (item.variation?.isOutlier ? " (이상치)" : ""), status, item.source ?? indicator.tableName,
    ];
  });
}

/** header.xml에 표에 필요한 서식(테두리·굵은 글씨·가운데/오른쪽 맞춤)을 덧붙인다. */
function patchHeader(source: string, spacings: readonly number[]): { xml: string; charIds: Map<number, number> } {
  let xml = source;
  const fill = (color: string) => `<hc:fillBrush><hc:winBrush faceColor="${color}" hatchColor="#999999" alpha="0"/></hc:fillBrush>`;
  const borderFill = (id: number, color: string) =>
    `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
    ["leftBorder", "rightBorder", "topBorder", "bottomBorder"].map((n) => `<hh:${n} type="SOLID" width="0.12 mm" color="#000000"/>`).join("") +
    `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>${fill(color)}</hh:borderFill>`;
  const charPr = (id: number, height: number, bold: boolean, spacing = 0) =>
    `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">` +
    '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>' +
    `<hh:spacing hangul="${spacing}" latin="${spacing}" hanja="${spacing}" japanese="${spacing}" other="${spacing}" symbol="${spacing}" user="${spacing}"/>` +
    '<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>' +
    `<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${bold ? "<hh:bold/>" : ""}<hh:underline type="NONE" shape="SOLID" color="#000000"/>` +
    '<hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/></hh:charPr>';
  const leftPara = xml.match(/<hh:paraPr id="11"[\s\S]*?<\/hh:paraPr>/)?.[0];
  if (!leftPara) throw new FormError("no-template", "서식 틀 파일의 구조가 예상과 다릅니다. 운영자에게 알려 주세요.");
  const paraPr = (id: number, align: string) => leftPara.replace('id="11"', `id="${id}"`).replace('horizontal="LEFT"', `horizontal="${align}"`);

  const grow = (tag: string, addCount: number, addXml: string) => {
    const re = new RegExp(`<hh:${tag} itemCnt="(\\d+)">([\\s\\S]*?)</hh:${tag}>`);
    const m = xml.match(re);
    if (!m) throw new FormError("no-template", "서식 틀 파일의 구조가 예상과 다릅니다. 운영자에게 알려 주세요.");
    xml = xml.replace(re, () => `<hh:${tag} itemCnt="${Number(m[1]) + addCount}">${m[2]}${addXml}</hh:${tag}>`);
  };
  grow("borderFills", 2, borderFill(3, "none") + borderFill(4, "#E5E5E5")); // 3 = 본문 칸 테두리, 4 = 머리글 칸(회색)
  // 7 = 굵은 9pt(머리글), 8 = 제목 굵은 16pt, 9번부터 = 9pt 본문(자간별)
  const charIds = new Map<number, number>();
  spacings.forEach((spacing, index) => charIds.set(spacing, 9 + index));
  grow("charProperties", 2 + spacings.length, charPr(7, 900, true) + charPr(8, 1600, true) + spacings.map((spacing) => charPr(charIds.get(spacing) as number, 900, false, spacing)).join(""));
  grow("paraProperties", 2, paraPr(20, "CENTER") + paraPr(21, "RIGHT")); // 20 = 가운데, 21 = 오른쪽
  return { xml, charIds };
}

/** section0.xml: 기본 틀의 첫 문단(쪽 설정 포함) 뒤에 제목·안내 문구·표를 덧붙인다. */
function buildSection(source: string, rows: string[][], dateText: string, widths: number[], cellChar: (row: number, col: number) => number): string {
  let idSeq = 2_000_000_000;
  const para = (text: string, charId: number, paraId: number) =>
    `<hp:p id="${idSeq++}" paraPrIDRef="${paraId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charId}"><hp:t>${esc(text)}</hp:t></hp:run></hp:p>`;
  const cell = (text: string, col: number, row: number, isHead: boolean) =>
    `<hp:tc name="" header="${isHead ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${isHead ? 4 : 3}">` +
    `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
    `${para(text, isHead ? 7 : cellChar(row, col), isHead ? 20 : alignOf(col))}</hp:subList>` +
    `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${widths[col]}" height="2600"/><hp:cellMargin left="283" right="283" top="141" bottom="141"/></hp:tc>`;
  const tableRows = [HEADER, ...rows]
    .map((r, ri) => `<hp:tr>${r.map((t, ci) => cell(t, ci, ri, ri === 0)).join("")}</hp:tr>`)
    .join("");
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  const table =
    `<hp:p id="${idSeq++}" paraPrIDRef="11" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="2">` +
    `<hp:tbl id="${idSeq++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length + 1}" colCnt="${HEADER.length}" cellSpacing="0" borderFillIDRef="3" noAdjust="0">` +
    `<hp:sz width="${totalWidth}" widthRelTo="ABSOLUTE" height="${(rows.length + 1) * 2600}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="141" right="141" top="141" bottom="141"/>${tableRows}</hp:tbl><hp:t/></hp:run></hp:p>`;

  const extra =
    para("", 2, 11) +
    para("산경과 주요 통계", 8, 20) +
    para(`※ 기준일 ${dateText}. 출처는 KOSIS(국가통계포털)이며 공개 통계만 담았습니다.`, 2, 11) +
    para("※ 사람이 확인해 확정한 수치만 넣었습니다. \"확정 전\"은 아직 확정하지 않아 비워 둔 지표입니다. (이상치)는 전년(동월) 대비 변동이 기준을 넘었다는 표시입니다.", 2, 11) +
    para("", 2, 11) + table + para("", 2, 11) +
    para("작성: 산업경제과", 2, 21);
  return source
    .replace(/left="8504" right="8504"/, `left="${SIDE_MARGIN}" right="${SIDE_MARGIN}"`)
    .replace("</hs:sec>", () => `${extra}</hs:sec>`);
}

/** 파일 이름과 내용을 zip(.hwpx)으로 묶는다. mimetype은 맨 앞에 압축 없이 넣는다. */
function zip(files: ReadonlyArray<readonly [string, string]>): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
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
  return Buffer.concat([...chunks, centralBuf, end]);
}

/**
 * 확정된 수치로 한글 서식(.hwpx) 파일 내용을 만든다.
 * 확정된 수치가 하나도 없으면 FormError("no-confirmed"), 서식 기본 틀이 없으면 FormError("no-template")를 던진다.
 */
export async function buildFormHwpx(confirmed: readonly CollectItem[], now: Date = new Date()): Promise<Buffer> {
  if (!confirmed.some((item) => item.state === "confirmed")) {
    throw new FormError("no-confirmed", "확정한 수치가 없습니다. 먼저 수치를 확정해 주세요.");
  }
  const read = async (name: string) => {
    try {
      return (await readFile(path.join(FORM_TEMPLATE_DIR, name), "utf8")).replace(/\r\n/g, "\n");
    } catch {
      throw new FormError("no-template", "한글 서식 틀을 찾을 수 없습니다. 운영자에게 알려 주세요.");
    }
  };
  const rows = buildRows(confirmed);
  const widths = layoutWidths(rows);
  // 칸마다 자간을 고르고, 쓰인 자간 값마다 글자 서식을 하나씩 만든다.
  const spacingOf = rows.map((row) => row.map((text, col) => pickSpacing(text, widths[col])));
  const usedSpacings = [...new Set(spacingOf.flat())].sort((a, b) => b - a);
  const dateText = now.toISOString().slice(0, 10);
  const title = "산경과 주요 통계";
  const header = patchHeader(await read("Contents/header.xml"), usedSpacings);
  return zip([
    ["mimetype", (await read("mimetype")).trim()],
    ["version.xml", await read("version.xml")],
    ["settings.xml", await read("settings.xml")],
    ["META-INF/container.xml", await read("META-INF/container.xml")],
    ["META-INF/container.rdf", await read("META-INF/container.rdf")],
    ["META-INF/manifest.xml", await read("META-INF/manifest.xml")],
    ["Contents/content.hpf", (await read("Contents/content.hpf")).replace("<opf:title/>", `<opf:title>${title}</opf:title>`)],
    ["Contents/header.xml", header.xml],
    ["Contents/section0.xml", buildSection(await read("Contents/section0.xml"), rows, dateText, widths, (row, col) => header.charIds.get(spacingOf[row - 1][col]) as number)],
    ["Preview/PrvText.txt", `${title}\n${rows.map((r) => r.slice(0, 5).join(" ")).join("\n")}\n`],
  ]);
}
