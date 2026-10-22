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
/** 칸 너비. 합계 42520 = 용지 폭(59528) - 좌우 여백(8504 x 2) */
const WIDTHS = [4200, 8200, 4000, 4400, 3600, 4600, 3200, 10320];
/** 칸 맞춤 서식 번호: 11 왼쪽, 20 가운데, 21 오른쪽 */
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
function patchHeader(source: string): string {
  let xml = source;
  const fill = (color: string) => `<hc:fillBrush><hc:winBrush faceColor="${color}" hatchColor="#999999" alpha="0"/></hc:fillBrush>`;
  const borderFill = (id: number, color: string) =>
    `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
    ["leftBorder", "rightBorder", "topBorder", "bottomBorder"].map((n) => `<hh:${n} type="SOLID" width="0.12 mm" color="#000000"/>`).join("") +
    `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>${fill(color)}</hh:borderFill>`;
  const charPr = (id: number, height: number) =>
    `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">` +
    '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>' +
    '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>' +
    '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:bold/><hh:underline type="NONE" shape="SOLID" color="#000000"/>' +
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
  grow("charProperties", 2, charPr(7, 900) + charPr(8, 1600)); // 7 = 굵은 9pt, 8 = 제목 굵은 16pt
  grow("paraProperties", 2, paraPr(20, "CENTER") + paraPr(21, "RIGHT")); // 20 = 가운데, 21 = 오른쪽
  return xml;
}

/** section0.xml: 기본 틀의 첫 문단(쪽 설정 포함) 뒤에 제목·안내 문구·표를 덧붙인다. */
function buildSection(source: string, rows: string[][], dateText: string): string {
  let idSeq = 2_000_000_000;
  const para = (text: string, charId: number, paraId: number) =>
    `<hp:p id="${idSeq++}" paraPrIDRef="${paraId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charId}"><hp:t>${esc(text)}</hp:t></hp:run></hp:p>`;
  const cell = (text: string, col: number, row: number, isHead: boolean) =>
    `<hp:tc name="" header="${isHead ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${isHead ? 4 : 3}">` +
    `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
    `${para(text, isHead ? 7 : 2, isHead ? 20 : alignOf(col))}</hp:subList>` +
    `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${WIDTHS[col]}" height="2600"/><hp:cellMargin left="283" right="283" top="141" bottom="141"/></hp:tc>`;
  const tableRows = [HEADER, ...rows]
    .map((r, ri) => `<hp:tr>${r.map((t, ci) => cell(t, ci, ri, ri === 0)).join("")}</hp:tr>`)
    .join("");
  const totalWidth = WIDTHS.reduce((a, b) => a + b, 0);
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
  return source.replace("</hs:sec>", () => `${extra}</hs:sec>`);
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
  const dateText = now.toISOString().slice(0, 10);
  const title = "산경과 주요 통계";
  return zip([
    ["mimetype", (await read("mimetype")).trim()],
    ["version.xml", await read("version.xml")],
    ["settings.xml", await read("settings.xml")],
    ["META-INF/container.xml", await read("META-INF/container.xml")],
    ["META-INF/container.rdf", await read("META-INF/container.rdf")],
    ["META-INF/manifest.xml", await read("META-INF/manifest.xml")],
    ["Contents/content.hpf", (await read("Contents/content.hpf")).replace("<opf:title/>", `<opf:title>${title}</opf:title>`)],
    ["Contents/header.xml", patchHeader(await read("Contents/header.xml"))],
    ["Contents/section0.xml", buildSection(await read("Contents/section0.xml"), rows, dateText)],
    ["Preview/PrvText.txt", `${title}\n${rows.map((r) => r.slice(0, 5).join(" ")).join("\n")}\n`],
  ]);
}
