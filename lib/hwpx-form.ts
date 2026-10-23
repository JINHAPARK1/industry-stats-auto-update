// Design Ref: §2 흐름 C — 확정된 수치를 한글 서식(.hwpx)의 표에 넣어 내려받게 한다. 서식은 두 가지다.
//   1) 이번 월 서식: 분야별 표에 지표의 확정된 최신 수치 (세로 용지)
//   2) 시계열 추이 서식: 분야별 표에 지표별 직전 12개월 흐름, 연간 지표는 연도별 (세로 용지)
// Plan SC: PLAN 16번 — 확정된 수치와 출처·기준시점을 한글 서식 표에 자동 입력한다. 확정 전 수치는 넣지 않는다.
//
// 표 모양은 사용자가 준 「핵심통계 및 주요제도」 서식을 따른다.
//   - 분야마다 「□ 분야」 제목 아래 표를 따로 두고, 표 위에 단위 줄, 표 아래에 「* 자료 :」 줄을 둔다.
//   - 머리글 칸은 연한 파랑(#E6EEF7), 여러 칸에 걸친 머리글(칸 합치기)을 쓴다.
//   - 음수는 △로 쓰고, 값 옆에 전년동기비를 둔다. 연간 표는 값 아래 줄에 (증감률%)를 괄호로 쓴다.
// 한글이 만든 진짜 .hwpx에서 뽑은 기본 틀(`FORM_TEMPLATE_DIR`)에 표를 얹어 만든다. 직접 처음부터 쓰면 한글이 열지 못한다.
// .hwpx는 압축(zip) 파일이라 별도 라이브러리 없이 Node 기본 기능(zlib)으로 직접 묶는다.
import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { crc32 } from "node:zlib";
import type { CollectItem } from "./collect-types";
import { INDICATORS, type Indicator } from "./indicators";

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
/** 증감 수치를 서식 방식으로 쓴다. 음수는 △, 소수 첫째 자리까지 쓴다. (예: △1.5, 3.0) */
const fmtDelta = (n: number | null) =>
  n === null ? "-" : `${n < 0 ? "△" : ""}${Math.abs(n).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

/** 전년(동월) 대비 숫자. 가동률은 %p 차이, 나머지는 %. 없으면 null */
function changeNumber(item: CollectItem | undefined): number | null {
  const v = item?.variation;
  if (!item?.confirmed || !v) return null;
  return v.measure === "point" ? v.changePoint : v.changePercent;
}

/** 이상치 표시(※)와 고친 값 표시(†)를 값 뒤에 붙인다. */
const OUTLIER_MARK = "※";
const EDITED_MARK = "†";
const changeCell = (item: CollectItem | undefined) => {
  const n = changeNumber(item);
  return n === null ? "-" : `${fmtDelta(n)}${item?.variation?.isOutlier ? OUTLIER_MARK : ""}`;
};
const valueCell = (item: CollectItem | undefined) =>
  item?.confirmed ? `${fmtNum(item.confirmed.value)}${item.confirmed.edited ? EDITED_MARK : ""}` : "-";

/** 좌우 여백은 첨부 서식과 같은 약 2cm(5669). 표 폭은 용지 폭에서 여백을 뺀 값이다. */
const SIDE_MARGIN = 5669;
const TABLE_WIDTH = 59528 - SIDE_MARGIN * 2;
/** 칸 안쪽 좌우 여백(283 x 2)과 계산 오차를 위한 여유 */
const CELL_PAD = 283 * 2;
const SAFETY = 1.04;
/** 글자 크기 9pt(한글 단위 900) */
const FONT_SIZE = 900;
/** 자간(글자 사이 간격)을 줄일 수 있는 한계. 이보다 더 줄이면 읽기 어려워 줄바꿈을 허용한다. */
export const MIN_SPACING = -15;
/** 표 한 줄의 높이 */
const ROW_HEIGHT = 1900;

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

/** 칸 맞춤 서식 번호: 11 왼쪽, 20 가운데, 21 오른쪽 */
const LEFT = 11;
const CENTER = 20;
const RIGHT = 21;

/** 글자 서식 번호: 7 = 굵은 9pt(머리글), 8 = 제목 16pt, 9 = 큰제목 13pt, 10 = 분야 제목 11pt, 11 = 8pt(자료 줄), 12번부터 = 9pt 본문(자간별) */
const CHAR_HEAD = 7;
const CHAR_TITLE = 8;
const CHAR_SECTION = 9;
const CHAR_SUB = 10;
const CHAR_SMALL = 11;
const CHAR_BODY_FIRST = 12;

/** 표의 칸 하나. 칸 합치기(colSpan·rowSpan)를 쓰는 칸만 차지하는 자리를 넓힌다. */
interface Cell {
  text: string;
  colSpan?: number;
  rowSpan?: number;
  /** true면 머리글 칸(연한 파랑 바탕, 굵은 글씨, 가운데 맞춤) */
  head?: boolean;
  align?: number;
}

/** 한글 문서에 넣을 표 하나와 그 둘레의 줄들 */
interface TableSpec {
  /** 표 위의 「□ 분야」 제목. 없으면 생략 */
  sub?: string;
  /** 제목 아래 단위 줄. 예: (2020=100, %) */
  unit?: string;
  /** 칸 너비. 합계가 표 폭과 같아야 한다. */
  widths: number[];
  /** 줄마다, 그 줄에서 시작하는 칸들 (위쪽 줄에서 내려온 칸 합치기 자리는 건너뛰고 쓴다) */
  rows: Cell[][];
  /** 표 아래 줄들. 예: * 자료 : ... */
  notes: string[];
}

/** 한글 문서 하나를 이루는 내용. 큰제목 칸(「1. 주요 산업 통계」)과 표가 번갈아 나온다. */
interface DocumentSpec {
  title: string;
  /** 제목 아래 안내 줄들 */
  intro: string[];
  blocks: Array<{ section: string } | TableSpec>;
  /** 마지막 표 아래의 주석 줄들 */
  closing: string[];
}

/** 칸 주소를 계산해 놓은 칸 */
interface PlacedCell extends Cell {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  width: number;
}

/** 위쪽 줄에서 내려온 칸 합치기를 피해 칸마다 열·줄 주소와 너비를 정한다. */
function place(spec: TableSpec): PlacedCell[][] {
  const taken = new Set<string>();
  return spec.rows.map((cells, row) => {
    let col = 0;
    return cells.map((cell) => {
      while (taken.has(`${row},${col}`)) col++;
      const colSpan = cell.colSpan ?? 1;
      const rowSpan = cell.rowSpan ?? 1;
      for (let r = row; r < row + rowSpan; r++) for (let c = col; c < col + colSpan; c++) taken.add(`${r},${c}`);
      const width = spec.widths.slice(col, col + colSpan).reduce((a, b) => a + b, 0);
      const placed = { ...cell, col, row, colSpan, rowSpan, width };
      col += colSpan;
      return placed;
    });
  });
}

/** header.xml에 표에 필요한 서식(테두리·머리글 색·굵은 글씨·맞춤·자간별 글자 서식)을 덧붙인다. */
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
  grow("borderFills", 2, borderFill(3, "none") + borderFill(4, "#E6EEF7")); // 3 = 본문 칸, 4 = 머리글 칸(연한 파랑, 첨부 서식과 같은 색)
  const charIds = new Map<number, number>();
  spacings.forEach((spacing, index) => charIds.set(spacing, CHAR_BODY_FIRST + index));
  grow(
    "charProperties",
    5 + spacings.length,
    charPr(CHAR_HEAD, 900, true) + charPr(CHAR_TITLE, 1600, true) + charPr(CHAR_SECTION, 1300, true) + charPr(CHAR_SUB, 1100, true) + charPr(CHAR_SMALL, 800, false) +
      spacings.map((spacing) => charPr(charIds.get(spacing) as number, 900, false, spacing)).join(""),
  );
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

type ParaMaker = (text: string, charId: number, paraId: number) => string;

/** 표 한 개의 문단 XML을 만든다. 칸 합치기와 칸별 자간을 반영한다. */
function renderTable(
  placed: PlacedCell[][],
  widths: readonly number[],
  nextId: () => number,
  para: ParaMaker,
  bodyChar: (cell: PlacedCell) => number,
  /** 표 안 글자 서식을 바꾸고 싶을 때(큰제목 칸) 쓴다. */
  headChar = CHAR_HEAD,
): string {
  const cell = (c: PlacedCell) =>
    `<hp:tc name="" header="${c.head ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${c.head ? 4 : 3}">` +
    `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
    `${para(c.text, c.head ? headChar : bodyChar(c), c.head ? (c.align ?? CENTER) : (c.align ?? CENTER))}</hp:subList>` +
    `<hp:cellAddr colAddr="${c.col}" rowAddr="${c.row}"/><hp:cellSpan colSpan="${c.colSpan}" rowSpan="${c.rowSpan}"/><hp:cellSz width="${c.width}" height="${ROW_HEIGHT * c.rowSpan}"/><hp:cellMargin left="283" right="283" top="141" bottom="141"/></hp:tc>`;
  const tableRows = placed.map((cells) => `<hp:tr>${cells.map(cell).join("")}</hp:tr>`).join("");
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  const colCnt = widths.length;
  return (
    `<hp:p id="${nextId()}" paraPrIDRef="${LEFT}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="2">` +
    `<hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${placed.length}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="3" noAdjust="0">` +
    `<hp:sz width="${totalWidth}" widthRelTo="ABSOLUTE" height="${placed.length * ROW_HEIGHT}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="141" right="141" top="141" bottom="141"/>${tableRows}</hp:tbl><hp:t/></hp:run></hp:p>`
  );
}

/** Supabase에서 가져온 기본 틀. 한 번 가져오면 서버가 켜져 있는 동안 다시 가져오지 않는다. */
let remoteTemplate: Promise<Map<string, string>> | null = null;

/** 배포용 저장소(Supabase)의 `app_template` 표에서 기본 틀 전체를 가져온다. 설정이 없으면 null, 실패하면 오류. */
function fetchRemoteTemplate(): Promise<Map<string, string>> | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  remoteTemplate ??= fetch(`${url}/rest/v1/app_template?select=name,content`, {
    cache: "no-store",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("template fetch failed");
      const rows = (await response.json()) as { name: string; content: string }[];
      return new Map(rows.map((row) => [row.name, row.content]));
    })
    .catch((error) => {
      remoteTemplate = null; // 실패한 결과를 붙잡아 두지 않고 다음에 다시 시도한다.
      throw error;
    });
  return remoteTemplate;
}

/**
 * 기본 틀 파일을 읽는다. 내 컴퓨터의 `samples/base-template/`가 있으면 그것을 쓰고,
 * 없으면(Vercel 배포본) Supabase에 비공개로 올려 둔 틀을 쓴다. 둘 다 없으면 FormError("no-template").
 */
async function readTemplate(name: string): Promise<string> {
  let text: string | undefined;
  try {
    text = await readFile(path.join(FORM_TEMPLATE_DIR, name), "utf8");
  } catch {
    try {
      text = (await fetchRemoteTemplate())?.get(name);
    } catch {
      text = undefined;
    }
  }
  if (text === undefined) {
    throw new FormError("no-template", "한글 서식 틀을 찾을 수 없습니다. 운영자에게 알려 주세요.");
  }
  return text.replace(/\r\n/g, "\n");
}

const isSection = (b: DocumentSpec["blocks"][number]): b is { section: string } => "section" in b;

/** 문서 내용(제목·안내·표들)을 한글 서식(.hwpx) 파일로 만든다. 칸마다 자간을 맞춰 한 줄에 들어가게 한다. */
async function composeHwpx(doc: DocumentSpec): Promise<Buffer> {
  // 표마다 칸 주소를 정하고, 칸마다 자간을 골라 쓰인 자간 값마다 글자 서식을 하나씩 만든다.
  const tables = doc.blocks.filter((b): b is TableSpec => !isSection(b));
  const placedOf = new Map(tables.map((t) => [t, place(t)] as const));
  const spacingOf = new Map<PlacedCell, number>();
  for (const placed of placedOf.values()) {
    for (const cell of placed.flat()) if (!cell.head) spacingOf.set(cell, pickSpacing(cell.text, cell.width));
  }
  const usedSpacings = [...new Set(spacingOf.values())].sort((a, b) => b - a);
  const header = patchHeader(await readTemplate("Contents/header.xml"), usedSpacings);

  let idSeq = 2_000_000_000;
  const nextId = () => idSeq++;
  const para: ParaMaker = (text, charId, paraId) =>
    `<hp:p id="${nextId()}" paraPrIDRef="${paraId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charId}"><hp:t>${esc(text)}</hp:t></hp:run></hp:p>`;
  const bodyChar = (cell: PlacedCell) => header.charIds.get(spacingOf.get(cell) as number) as number;

  const blocks = doc.blocks
    .map((block) => {
      if (isSection(block)) {
        // 큰제목: 한 칸짜리 연한 파랑 상자
        const spec: TableSpec = { widths: [TABLE_WIDTH], rows: [[{ text: block.section, head: true, align: LEFT }]], notes: [] };
        return para("", 2, LEFT) + renderTable(place(spec), spec.widths, nextId, para, bodyChar, CHAR_SECTION);
      }
      return (
        para("", 2, LEFT) +
        (block.sub ? para(block.sub, CHAR_SUB, LEFT) : "") +
        (block.unit ? para(block.unit, 2, LEFT) : "") +
        renderTable(placedOf.get(block) as PlacedCell[][], block.widths, nextId, para, bodyChar) +
        block.notes.map((note) => para(note, CHAR_SMALL, LEFT)).join("")
      );
    })
    .join("");

  const body =
    para("", 2, LEFT) +
    para(doc.title, CHAR_TITLE, CENTER) +
    doc.intro.map((line) => para(line, CHAR_SMALL, LEFT)).join("") +
    blocks +
    para("", 2, LEFT) +
    doc.closing.map((line) => para(line, CHAR_SMALL, LEFT)).join("");

  const section = (await readTemplate("Contents/section0.xml"))
    .replace(/left="8504" right="8504"/, `left="${SIDE_MARGIN}" right="${SIDE_MARGIN}"`)
    .replace("</hs:sec>", () => `${body}</hs:sec>`);

  const preview = `${doc.title}\n${tables.flatMap((t) => t.rows.map((r) => r.slice(0, 4).map((c) => c.text).join(" "))).join("\n")}\n`;
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

/** 분야(field) 순서. 지표 정의에 처음 나온 순서를 따른다. */
const FIELDS = [...new Set(INDICATORS.map((i) => i.field))];
const indicatorsOf = (field: string) => INDICATORS.filter((i) => i.field === field);

/** 표 아래 「* 자료 :」 줄. 같은 통계표는 한 번만 쓴다. */
const sourceNote = (list: readonly Indicator[]) =>
  `* 자료 : 통계청 KOSIS 국가통계포털, ${[...new Set(list.map((i) => i.tableName))].join(" / ")}`;

/** 단위 줄. 예: (2020=100, %, 전년동월비 %) */
function unitLine(list: readonly Indicator[], changeLabel: string): string {
  const units = [...new Set(list.map((i) => i.unit))];
  const points = list.some((i) => i.unit === "%") ? " (가동률은 %p)" : "";
  return `(${[...units, `${changeLabel} %${points}`].join(", ")})`;
}

/** 확정 전·이상치·고친 값에 대한 맨 아래 주석 줄들 */
function closingNotes(confirmedItems: readonly (CollectItem | undefined)[], missing: readonly string[]): string[] {
  const lines: string[] = [];
  if (missing.length > 0) lines.push(`※ 확정 전(비워 둠): ${missing.join(", ")}`);
  if (confirmedItems.some((i) => i?.variation?.isOutlier)) {
    lines.push(`${OUTLIER_MARK} 전년(동월) 대비 변동이 기준을 넘은 이상치입니다. 원 통계표와 대조해 확인한 값입니다.`);
  }
  // 고친 값은 원래 KOSIS 값도 함께 적는다. (PRD: 사람이 고친 수치는 원래 값과 고친 값을 모두 기록)
  const edited = confirmedItems.filter((i): i is CollectItem => Boolean(i?.confirmed?.edited));
  if (edited.length > 0) {
    const detail = edited.map((i) => `${i.name} ${i.period ? fmtPeriod(i.period) : ""} KOSIS ${fmtNum(i.originalValue)} → 확정 ${fmtNum(i.confirmed?.value ?? null)}`.replace("  ", " "));
    lines.push(`${EDITED_MARK} 사람이 고친 값: ${detail.join(" / ")}`);
  }
  lines.push('※ 사람이 확인해 확정한 수치만 담았습니다. "-"는 값이 없거나 아직 확정하지 않은 칸입니다.');
  return lines;
}

/**
 * 이번 월 서식: 확정된 최신 수치를 분야별 표에 담는다.
 * 확정된 수치가 하나도 없으면 FormError("no-confirmed"), 서식 기본 틀이 없으면 FormError("no-template")를 던진다.
 */
export async function buildFormHwpx(confirmed: readonly CollectItem[], month: string | null, now: Date = new Date()): Promise<Buffer> {
  if (!confirmed.some((item) => item.state === "confirmed")) {
    throw new FormError("no-confirmed", "확정한 수치가 없습니다. 먼저 수치를 확정해 주세요.");
  }
  const itemOf = (code: string) => confirmed.find((c) => c.code === code && c.state === "confirmed" && c.confirmed);
  const widths = [22000, 8500, 9000, 8690];

  const blocks: DocumentSpec["blocks"] = [{ section: "1. 주요 산업 통계" }];
  for (const field of FIELDS) {
    const list = indicatorsOf(field);
    blocks.push({
      sub: `□ ${field}`,
      unit: unitLine(list, "전년동월비"),
      widths,
      rows: [
        ["구 분", "기준시점", "수치", "전년동월비"].map((text) => ({ text, head: true })),
        ...list.map((indicator): Cell[] => {
          const item = itemOf(indicator.code);
          return [
            { text: `${indicator.name} (${item?.unit ?? indicator.unit})`, align: LEFT },
            { text: item?.period ? fmtPeriod(item.period) : "-" },
            { text: valueCell(item), align: RIGHT },
            { text: changeCell(item), align: RIGHT },
          ];
        }),
      ],
      notes: [sourceNote(list)],
    });
  }

  const items = INDICATORS.map((i) => itemOf(i.code));
  const missing = INDICATORS.filter((i) => !itemOf(i.code)).map((i) => i.name);
  return composeHwpx({
    title: "산경과 주요 통계",
    intro: [`기준 월 ${month ? fmtPeriod(month) : "-"} · 기준일 ${now.toISOString().slice(0, 10)} · 산업경제과`],
    blocks,
    closing: closingNotes(items, missing),
  });
}

/** 칸 너비: 첫 칸은 고정, 나머지는 표 폭을 똑같이 나눈다. 남는 폭은 마지막 칸에 줘서 표 폭을 꼭 맞춘다. */
function evenWidths(first: number, count: number): number[] {
  const each = Math.floor((TABLE_WIDTH - first) / count);
  const widths = [first, ...Array<number>(count).fill(each)];
  widths[widths.length - 1] += TABLE_WIDTH - widths.reduce((a, b) => a + b, 0);
  return widths;
}

/**
 * 시계열 추이 서식: 분야별 표에 지표별로 직전 12개월(연간 지표는 연도별) 흐름을 담는다.
 * 월간 표는 기간을 행으로, 지표(값·전년동월비)를 열로 놓아서 기간이 늘면 표가 아래로 늘어난다. (옆으로 늘어나면 용지 오른쪽이 잘린다)
 * 확정된 수치만 넣고 나머지는 "-"로 둔다.
 * @param recordsByCode 지표별로 저장된 모든 기간의 수치 (lib/store.ts의 listRecordsByIndicator)
 */
export async function buildTrendHwpx(recordsByCode: Readonly<Record<string, CollectItem[]>>, now: Date = new Date()): Promise<Buffer> {
  const confirmedOf = (code: string) =>
    new Map((recordsByCode[code] ?? []).filter((i) => i.state === "confirmed" && i.confirmed && i.period).map((i) => [i.period as string, i]));
  if (INDICATORS.every((indicator) => confirmedOf(indicator.code).size === 0)) {
    throw new FormError("no-confirmed", "확정한 수치가 없습니다. 먼저 수치를 확정해 주세요.");
  }

  const monthlyAll = INDICATORS.filter((i) => i.period === "M");
  // 행 = 월간 지표에 저장된 달 중 가장 최근 12개월(오래된 것이 위). 표마다 같은 달이 나오도록 모든 표가 같은 달을 쓴다.
  const months = [...new Set(monthlyAll.flatMap((i) => (recordsByCode[i.code] ?? []).map((r) => r.period ?? "")).filter(Boolean))].sort().slice(-12);
  /** 첨부 서식처럼 연도가 바뀔 때만 연도를 쓴다. (예: ’25.10, 11, 12, ’26.1, 2) */
  const monthLabel = (p: string, index: number) => (index === 0 || p.slice(4) === "01" ? `’${p.slice(2, 4)}.${Number(p.slice(4))}` : String(Number(p.slice(4))));

  const blocks: DocumentSpec["blocks"] = [{ section: "1. 월별 추이 (직전 12개월)" }];
  for (const field of FIELDS) {
    const list = indicatorsOf(field).filter((i) => i.period === "M");
    if (list.length === 0) continue;
    blocks.push({
      sub: `□ ${field}`,
      unit: unitLine(list, "전년동월비"),
      widths: evenWidths(8349, list.length * 2),
      rows: [
        [{ text: "구 분", head: true, rowSpan: 2 }, ...list.map((i): Cell => ({ text: i.name, head: true, colSpan: 2 }))],
        list.flatMap((): Cell[] => [{ text: "수치", head: true }, { text: "전년동월비", head: true }]),
        ...months.map((p, index): Cell[] => [
          { text: monthLabel(p, index) },
          ...list.flatMap((i): Cell[] => {
            const item = confirmedOf(i.code).get(p);
            return [{ text: valueCell(item), align: RIGHT }, { text: changeCell(item), align: RIGHT }];
          }),
        ]),
      ],
      notes: [sourceNote(list)],
    });
  }

  // 연간 지표: 첨부 서식의 「산업 통계」 표처럼 연도를 열로 놓고, 값 아래 줄에 (증감률%)를 쓴다.
  const annual = INDICATORS.filter((i) => i.period === "Y");
  const years = [...new Set(annual.flatMap((i) => (recordsByCode[i.code] ?? []).map((r) => r.period ?? "")).filter(Boolean))].sort();
  if (annual.length > 0 && years.length > 0) {
    blocks.push({ section: "2. 연간 통계" });
    for (const field of [...new Set(annual.map((i) => i.field))]) {
      const list = annual.filter((i) => i.field === field);
      blocks.push({
        sub: `□ ${field}`,
        unit: unitLine(list, "전년비"),
        widths: evenWidths(12449, years.length),
        rows: [
          [{ text: "구 분", head: true }, ...years.map((y): Cell => ({ text: fmtPeriod(y).replace("년", ""), head: true }))],
          ...list.flatMap((i): Cell[][] => [
            [{ text: `${i.name} (${i.unit})`, rowSpan: 2, align: LEFT }, ...years.map((y): Cell => ({ text: valueCell(confirmedOf(i.code).get(y)), align: RIGHT }))],
            years.map((y): Cell => {
              const n = changeNumber(confirmedOf(i.code).get(y));
              return { text: n === null ? "-" : `(${fmtDelta(n)}%${confirmedOf(i.code).get(y)?.variation?.isOutlier ? OUTLIER_MARK : ""})`, align: RIGHT };
            }),
          ]),
        ],
        notes: [sourceNote(list)],
      });
    }
  }

  const everyItem = INDICATORS.flatMap((i) => [...confirmedOf(i.code).values()]);
  return composeHwpx({
    title: "산경과 주요 통계 시계열 추이",
    intro: [`기준일 ${now.toISOString().slice(0, 10)} · 산업경제과 · 지수는 2020년 = 100 기준`],
    blocks,
    closing: closingNotes(everyItem, []),
  });
}
