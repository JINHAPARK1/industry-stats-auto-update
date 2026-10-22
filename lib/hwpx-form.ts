// Design Ref: §2 흐름 C — 확정된 수치를 한글 서식(.hwpx)의 표에 넣어 내려받게 한다. 서식은 두 가지다.
//   1) 이번 월 서식: 지표 10개의 확정된 최신 수치 (세로 용지, 표 1개)
//   2) 시계열 추이 서식: 지표별 직전 12개월 흐름 (가로 용지, 표 3개)
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
const signed = (n: number) => (n > 0 ? "+" : "") + n;

/** 전년(동월) 대비를 글자로 만든다. */
function fmtChange(item: CollectItem): string {
  const v = item.variation;
  if (!v) return "-";
  if (v.measure === "point") return v.changePoint === null ? "-" : `${signed(v.changePoint)}%p`;
  return v.changePercent === null ? "-" : `${signed(v.changePercent)}%`;
}

const HEADER = ["분야", "지표", "기준시점", "수치", "단위", "전년(동월) 대비", "상태", "출처"];
/** 좌우 여백을 3cm에서 약 1.8cm로 줄여 표 폭을 넓힌다. */
const SIDE_MARGIN = 5000;
/** 세로(A4) 용지의 표 폭 = 용지 폭(59528) - 좌우 여백(5000 x 2) */
const PORTRAIT_TABLE_WIDTH = 59528 - SIDE_MARGIN * 2;
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
function layoutWidths(header: readonly string[], rows: string[][], tableWidth: number): number[] {
  const last = header.length - 1;
  const needsAt = (spacing: number) =>
    header.slice(0, last).map((title, col) => {
      const widest = Math.max(...rows.map((row) => textWidth(row[col], spacing)));
      // 머리글은 줄바꿈을 허용하므로 머리글 폭은 절반만 반영한다.
      return Math.ceil(Math.max(widest, textWidth(title, spacing) / 2) + CELL_PAD);
    });
  let needs = needsAt(MIN_SPACING);
  for (let spacing = 0; spacing >= MIN_SPACING; spacing--) {
    const candidate = needsAt(spacing);
    if (candidate.reduce((x, y) => x + y, 0) <= tableWidth - MIN_SOURCE_WIDTH) {
      needs = candidate;
      break;
    }
  }
  const used = needs.reduce((x, y) => x + y, 0);
  const scale = used > tableWidth - MIN_SOURCE_WIDTH ? (tableWidth - MIN_SOURCE_WIDTH) / used : 1;
  const widths = needs.map((n) => Math.floor(n * scale));
  return [...widths, tableWidth - widths.reduce((x, y) => x + y, 0)];
}

/** 칸 맞춤 서식 번호: 11 왼쪽, 20 가운데, 21 오른쪽 */
const LEFT = 11;
const CENTER = 20;
const RIGHT = 21;

/** 한글 문서에 넣을 표 하나 */
interface TableSpec {
  /** 표 위에 넣을 제목 문단. 없으면 생략 */
  caption?: string;
  header: string[];
  rows: string[][];
  /** 칸 너비. 합계가 표 폭과 같아야 한다. */
  widths: number[];
  /** 칸마다 맞춤 서식 번호(LEFT·CENTER·RIGHT) */
  aligns: number[];
}

/** 한글 문서 하나를 이루는 내용 */
interface DocumentSpec {
  title: string;
  /** 제목 아래 안내 문구들 */
  notes: string[];
  tables: TableSpec[];
  footer: string;
  /** true면 가로 용지 */
  landscape: boolean;
}

/**
 * 이번 월 서식의 표 줄을 만든다. 지표 10개가 항상 정의 순서대로 들어가며, 확정된 수치가 없는 지표는 빈칸("-")과 "확정 전"으로 둔다.
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

/** header.xml에 표에 필요한 서식(테두리·굵은 글씨·가운데/오른쪽 맞춤·자간별 글자 서식)을 덧붙인다. */
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
  grow("paraProperties", 2, paraPr(CENTER, "CENTER") + paraPr(RIGHT, "RIGHT")); // 11 = 왼쪽(기존), 20 = 가운데, 21 = 오른쪽
  return { xml, charIds };
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

/** 표 한 개의 문단 XML을 만든다. */
function renderTable(
  spec: TableSpec,
  nextId: () => number,
  para: (text: string, charId: number, paraId: number) => string,
  cellChar: (row: number, col: number) => number,
): string {
  const { header, rows, widths, aligns } = spec;
  const cell = (text: string, col: number, row: number, isHead: boolean) =>
    `<hp:tc name="" header="${isHead ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${isHead ? 4 : 3}">` +
    `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
    `${para(text, isHead ? 7 : cellChar(row, col), isHead ? CENTER : aligns[col])}</hp:subList>` +
    `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${widths[col]}" height="2600"/><hp:cellMargin left="283" right="283" top="141" bottom="141"/></hp:tc>`;
  const tableRows = [header, ...rows]
    .map((r, ri) => `<hp:tr>${r.map((t, ci) => cell(t, ci, ri, ri === 0)).join("")}</hp:tr>`)
    .join("");
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  return (
    `<hp:p id="${nextId()}" paraPrIDRef="${LEFT}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="2">` +
    `<hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length + 1}" colCnt="${header.length}" cellSpacing="0" borderFillIDRef="3" noAdjust="0">` +
    `<hp:sz width="${totalWidth}" widthRelTo="ABSOLUTE" height="${(rows.length + 1) * 2600}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="141" right="141" top="141" bottom="141"/>${tableRows}</hp:tbl><hp:t/></hp:run></hp:p>`
  );
}

/** 기본 틀 파일을 읽는다. 없으면 FormError("no-template"). */
async function readTemplate(name: string): Promise<string> {
  try {
    return (await readFile(path.join(FORM_TEMPLATE_DIR, name), "utf8")).replace(/\r\n/g, "\n");
  } catch {
    throw new FormError("no-template", "한글 서식 틀을 찾을 수 없습니다. 운영자에게 알려 주세요.");
  }
}

/** 문서 내용(제목·안내·표들)을 한글 서식(.hwpx) 파일로 만든다. 칸마다 자간을 맞춰 한 줄에 들어가게 한다. */
async function composeHwpx(doc: DocumentSpec): Promise<Buffer> {
  // 칸마다 자간을 고르고, 쓰인 자간 값마다 글자 서식을 하나씩 만든다.
  const spacingOf = doc.tables.map((t) => t.rows.map((row) => row.map((text, col) => pickSpacing(text, t.widths[col]))));
  const usedSpacings = [...new Set(spacingOf.flat(2))].sort((a, b) => b - a);
  const header = patchHeader(await readTemplate("Contents/header.xml"), usedSpacings);

  let idSeq = 2_000_000_000;
  const nextId = () => idSeq++;
  const para = (text: string, charId: number, paraId: number) =>
    `<hp:p id="${nextId()}" paraPrIDRef="${paraId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charId}"><hp:t>${esc(text)}</hp:t></hp:run></hp:p>`;

  const body =
    para("", 2, LEFT) +
    para(doc.title, 8, CENTER) +
    doc.notes.map((note) => para(note, 2, LEFT)).join("") +
    doc.tables
      .map(
        (spec, ti) =>
          para("", 2, LEFT) +
          (spec.caption ? para(spec.caption, 7, LEFT) : "") +
          renderTable(spec, nextId, para, (row, col) => header.charIds.get(spacingOf[ti][row - 1][col]) as number),
      )
      .join("") +
    para("", 2, LEFT) +
    para(doc.footer, 2, RIGHT);

  let section = (await readTemplate("Contents/section0.xml")).replace(/left="8504" right="8504"/, `left="${SIDE_MARGIN}" right="${SIDE_MARGIN}"`);
  if (doc.landscape) {
    // 가로 용지: 폭과 높이를 맞바꾸고 방향 표시를 바꾼다.
    section = section.replace('landscape="WIDELY" width="59528" height="84186"', 'landscape="NARROWLY" width="84186" height="59528"');
  }
  section = section.replace("</hs:sec>", () => `${body}</hs:sec>`);

  const preview = `${doc.title}\n${doc.tables.flatMap((t) => t.rows.map((r) => r.slice(0, 5).join(" "))).join("\n")}\n`;
  return zip([
    ["mimetype", (await readTemplate("mimetype")).trim()],
    ["version.xml", await readTemplate("version.xml")],
    ["settings.xml", await readTemplate("settings.xml")],
    ["META-INF/container.xml", await readTemplate("META-INF/container.xml")],
    ["META-INF/container.rdf", await readTemplate("META-INF/container.rdf")],
    ["META-INF/manifest.xml", await readTemplate("META-INF/manifest.xml")],
    ["Contents/content.hpf", (await readTemplate("Contents/content.hpf")).replace("<opf:title/>", `<opf:title>${esc(doc.title)}</opf:title>`)],
    ["Contents/header.xml", header.xml],
    ["Contents/section0.xml", section],
    ["Preview/PrvText.txt", preview],
  ]);
}

/**
 * 이번 월 서식: 확정된 최신 수치로 지표 10개를 한 표에 담는다.
 * 확정된 수치가 하나도 없으면 FormError("no-confirmed"), 서식 기본 틀이 없으면 FormError("no-template")를 던진다.
 */
export async function buildFormHwpx(confirmed: readonly CollectItem[], now: Date = new Date()): Promise<Buffer> {
  if (!confirmed.some((item) => item.state === "confirmed")) {
    throw new FormError("no-confirmed", "확정한 수치가 없습니다. 먼저 수치를 확정해 주세요.");
  }
  const rows = buildRows(confirmed);
  return composeHwpx({
    title: "산경과 주요 통계",
    notes: [
      `※ 기준일 ${now.toISOString().slice(0, 10)}. 출처는 KOSIS(국가통계포털)이며 공개 통계만 담았습니다.`,
      '※ 사람이 확인해 확정한 수치만 넣었습니다. "확정 전"은 아직 확정하지 않아 비워 둔 지표입니다. (이상치)는 전년(동월) 대비 변동이 기준을 넘었다는 표시입니다.',
    ],
    tables: [
      {
        header: HEADER,
        rows,
        widths: layoutWidths(HEADER, rows, PORTRAIT_TABLE_WIDTH),
        aligns: [CENTER, LEFT, CENTER, RIGHT, CENTER, RIGHT, CENTER, LEFT],
      },
    ],
    footer: "작성: 산업경제과",
    landscape: false,
  });
}

const monthLabel = (p: string) => `${p.slice(2, 4)}.${p.slice(4)}`;

/**
 * 시계열 추이 서식: 지표별로 직전 12개월(연간 지표는 연도별) 흐름을 가로 용지 표로 담는다.
 * 값 표, 전년(동월) 대비 표, 연간 지표 표이며, 확정된 수치만 넣고 나머지는 "-"로 둔다.
 * @param recordsByCode 지표별로 저장된 모든 기간의 수치 (lib/store.ts의 listRecordsByIndicator)
 */
export async function buildTrendHwpx(recordsByCode: Readonly<Record<string, CollectItem[]>>, now: Date = new Date()): Promise<Buffer> {
  const confirmedOf = (code: string) =>
    new Map((recordsByCode[code] ?? []).filter((i) => i.state === "confirmed" && i.confirmed && i.period).map((i) => [i.period as string, i]));
  if (INDICATORS.every((indicator) => confirmedOf(indicator.code).size === 0)) {
    throw new FormError("no-confirmed", "확정한 수치가 없습니다. 먼저 수치를 확정해 주세요.");
  }

  const monthly = INDICATORS.filter((i) => i.period === "M");
  const annual = INDICATORS.filter((i) => i.period === "Y");
  // 열 = 월간 지표에 저장된 달 중 가장 최근 12개월(오래된 것부터)
  const months = [...new Set(monthly.flatMap((i) => (recordsByCode[i.code] ?? []).map((r) => r.period ?? "")).filter(Boolean))].sort().slice(-12);
  const years = [...new Set(annual.flatMap((i) => (recordsByCode[i.code] ?? []).map((r) => r.period ?? "")).filter(Boolean))].sort();

  const valueCell = (item: CollectItem | undefined) =>
    item?.confirmed ? `${fmtNum(item.confirmed.value)}${item.confirmed.edited ? "†" : ""}` : "-";
  const changeCell = (item: CollectItem | undefined) => {
    if (!item?.confirmed || !item.variation) return "-";
    const v = item.variation;
    const n = v.measure === "point" ? v.changePoint : v.changePercent;
    return n === null ? "-" : `${signed(n)}${v.isOutlier ? "*" : ""}`;
  };

  /** 분야·지표·단위 칸 뒤에 기간 칸을 같은 너비로 늘어놓는다. 가로 용지 폭 안에 들어가게 한다. */
  const widthsFor = (count: number): number[] => [5500, 15500, 4400, ...Array<number>(count).fill(Math.floor(48000 / Math.max(count, 12)))];
  const alignsFor = (count: number): number[] => [CENTER, LEFT, CENTER, ...Array<number>(count).fill(RIGHT)];

  const tables: TableSpec[] = [
    {
      caption: "1. 월별 지수 (직전 12개월)",
      header: ["분야", "지표", "단위", ...months.map(monthLabel)],
      rows: monthly.map((i) => [i.field, i.name, i.unit, ...months.map((p) => valueCell(confirmedOf(i.code).get(p)))]),
      widths: widthsFor(months.length),
      aligns: alignsFor(months.length),
    },
    {
      caption: "2. 전년동월 대비 증감 (가동률은 %p, 나머지는 %)",
      header: ["분야", "지표", "단위", ...months.map(monthLabel)],
      rows: monthly.map((i) => {
        const sample = (recordsByCode[i.code] ?? []).find((r) => r.variation)?.variation;
        return [i.field, i.name, sample?.measure === "point" ? "%p" : "%", ...months.map((p) => changeCell(confirmedOf(i.code).get(p)))];
      }),
      widths: widthsFor(months.length),
      aligns: alignsFor(months.length),
    },
  ];
  if (annual.length > 0 && years.length > 0) {
    tables.push({
      caption: "3. 연간 지표",
      header: ["분야", "지표", "단위", ...years.map((y) => `${y}년`)],
      rows: annual.flatMap((i) => [
        [i.field, i.name, i.unit, ...years.map((y) => valueCell(confirmedOf(i.code).get(y)))],
        [i.field, `${i.name} 전년 대비`, "%", ...years.map((y) => changeCell(confirmedOf(i.code).get(y)))],
      ]),
      widths: widthsFor(years.length),
      aligns: alignsFor(years.length),
    });
  }

  return composeHwpx({
    title: "산경과 주요 통계 시계열 추이",
    notes: [
      `※ 기준일 ${now.toISOString().slice(0, 10)}. 출처는 KOSIS(국가통계포털)이며 공개 통계만 담았습니다.`,
      '※ 사람이 확인해 확정한 수치만 넣었습니다. "-"는 아직 확정하지 않았거나 값이 없는 칸입니다. * 는 전년(동월) 대비 변동이 기준을 넘은 이상치, † 는 사람이 고친 값입니다.',
      "※ 지수는 2020년 = 100 기준이며, 제조업 평균가동률은 %, 신생기업 수는 개입니다.",
    ],
    tables,
    footer: "작성: 산업경제과",
    landscape: true,
  });
}
