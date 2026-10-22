// Design Ref: §2 폴더와 파일 구조 — KOSIS 호출은 서버 전용 코드이며 `.env`의 키를 쓴다. 인증키가 브라우저로 나가면 안 된다.
// Design Ref: §2 오류 처리 — KOSIS 오류 번호별로 화면에 보일 쉬운 문구를 정하고, 실패해도 자동으로 다시 부르지 않는다.
// Plan SC: PLAN 2번 — 키 읽기, HTTPS, 오류 번호별 처리, 설비투자지수의 별도 호출 방식(첫 분류 ALL)을 포함한다.
// Plan SC: PLAN 3번 — 지표별로 가져온 값에 출처·기준시점·단위를 붙여 모든 지표가 같은 모양(IndicatorSeries)이 되게 정리한다.
// Plan SC: PLAN 6번 — 10개 중 일부만 실패해도 성공한 지표는 그대로 쓰고, 실패한 지표만 빈칸과 사유로 남긴다. 자동으로 다시 부르지 않고, 호출 제한 등에 걸리면 더 부르지 않는다.
import "server-only";

import type { Indicator } from "./indicators";

/** KOSIS 통계자료 조회 주소. HTTPS만 쓸 수 있다. (HTTP는 종료됨) */
const KOSIS_DATA_URL = "https://kosis.kr/openapi/Param/statisticsParameterData.do";

/** 응답을 기다리는 최대 시간. 넘으면 "응답 시간 초과"로 처리한다. */
const DEFAULT_TIMEOUT_MS = 15_000;

/** 오류의 종류. 화면에서 문구와 다음 행동을 고를 때 쓴다. */
export type KosisErrorKind =
  | "missing-key" // .env에 키가 없음
  | "auth" // 인증키 오류 (KOSIS 오류 번호 10·11)
  | "bad-request" // 요청 설정 오류 (오류 번호 20·21)
  | "no-data" // 결과 없음 (오류 번호 30): 아직 공표 전이거나 통계표가 바뀜
  | "too-large" // 한 번에 요청한 양이 너무 큼 (오류 번호 31)
  | "rate-limit" // 호출 제한 (오류 번호 40번대, HTTP 429)
  | "server" // KOSIS 서버 쪽 문제 (오류 번호 50, HTTP 5xx)
  | "timeout" // 응답 시간 초과
  | "network" // 인터넷 연결 문제
  | "unknown"; // 위에 없는 경우

/** 종류별로 화면에 보여줄 쉬운 문구. (DESIGN §2 오류 처리 표) */
const USER_MESSAGES: Record<KosisErrorKind, string> = {
  "missing-key": "통계 서버 인증에 문제가 있습니다. 운영자에게 알려 주세요.",
  auth: "통계 서버 인증에 문제가 있습니다. 운영자에게 알려 주세요.",
  "bad-request": "지표 설정에 문제가 있습니다. 운영자에게 알려 주세요.",
  "no-data": "아직 공표 전이거나 통계표가 바뀌었을 수 있습니다.",
  "too-large": "한 번에 요청한 양이 너무 많습니다. 운영자에게 알려 주세요.",
  "rate-limit": "요청이 많습니다. 1분 뒤 다시 눌러 주세요.",
  server: "통계 서버에 문제가 있습니다. 잠시 뒤 다시 눌러 주세요.",
  timeout: "통계 서버가 늦게 응답합니다. 잠시 뒤 다시 눌러 주세요.",
  network: "통계 서버에 연결하지 못했습니다. 잠시 뒤 다시 눌러 주세요.",
  unknown: "통계를 가져오지 못했습니다. 잠시 뒤 다시 눌러 주세요.",
};

/**
 * KOSIS 호출이 실패했을 때 던지는 오류.
 * message에는 인증키나 요청 주소를 절대 넣지 않는다. (로그에 키가 남지 않게)
 */
export class KosisError extends Error {
  readonly kind: KosisErrorKind;
  /** KOSIS가 준 오류 번호. 없으면 undefined */
  readonly code?: string;
  /** 화면에 그대로 보여줄 수 있는 쉬운 문구 */
  readonly userMessage: string;

  constructor(kind: KosisErrorKind, code?: string) {
    const detail = code ? ` (오류 번호 ${code})` : "";
    super(`KOSIS 호출 실패: ${kind}${detail}`);
    this.name = "KosisError";
    this.kind = kind;
    this.code = code;
    this.userMessage = USER_MESSAGES[kind];
  }
}

/** KOSIS 오류 번호를 오류 종류로 바꾼다. 40번대·31번은 KOSIS 안내 기준이며 실제 응답으로는 확인하지 못했다. */
function kindFromErrorCode(code: string): KosisErrorKind {
  switch (code) {
    case "10":
    case "11":
      return "auth";
    case "20":
    case "21":
      return "bad-request";
    case "30":
      return "no-data";
    case "31":
      return "too-large";
    case "40":
    case "41":
    case "42":
      return "rate-limit";
    case "50":
      return "server";
    default:
      return "unknown";
  }
}

/** KOSIS가 한 줄(한 기준시점의 한 수치)로 돌려주는 값을 쓰기 쉽게 정리한 모양. */
export interface KosisRow {
  /** 기준시점. 월간은 "202608", 연간은 "2024" */
  period: string;
  /** 수치. 숫자가 아니거나 비어 있으면 null (추정해서 채우지 않는다) */
  value: number | null;
  /** KOSIS가 준 수치 원본 글자 */
  rawValue: string;
  /** KOSIS가 준 단위 글자. 화면 단위는 지표 정의의 unit을 쓴다. */
  kosisUnit: string;
  /** KOSIS가 준 항목 이름 (예: 생산지수(원지수)) */
  itemName: string;
  /** KOSIS가 준 통계표 이름 */
  tableName: string;
  /** KOSIS에서 마지막으로 수정된 날짜 (예: 2026-09-22). 없으면 빈 글자 */
  lastChangedAt: string;
}

export interface FetchOptions {
  /** 응답을 기다리는 시간(밀리초). 기본 15초 */
  timeoutMs?: number;
}

/** 서버 환경변수에서 인증키를 읽는다. 값은 어디에도 출력하지 않는다. */
function readApiKey(): string {
  const key = process.env.KOSIS_API_KEY?.trim();
  if (!key) {
    throw new KosisError("missing-key");
  }
  return key;
}

/** 지표 정의로 KOSIS 요청 주소를 만든다. 반환값에는 인증키가 들어 있으므로 로그에 남기지 않는다. */
function buildRequestUrl(indicator: Indicator, apiKey: string): URL {
  const url = new URL(KOSIS_DATA_URL);
  const params: Record<string, string> = {
    method: "getList",
    apiKey,
    format: "json",
    jsonVD: "Y",
    orgId: indicator.orgId,
    tblId: indicator.tableId,
    itmId: indicator.itemId,
    prdSe: indicator.period,
    newEstPrdCnt: String(indicator.periodCount),
  };
  // 분류 코드는 objL1, objL2 순서로 넣는다. (설비투자지수는 첫 분류가 ALL이다)
  indicator.objectCodes.forEach((code, index) => {
    params[`objL${index + 1}`] = code;
  });
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return url;
}

/** KOSIS가 준 글자를 숫자로 바꾼다. 숫자가 아니면 null. (값을 추정하지 않는다) */
function parseValue(raw: string): number | null {
  const text = raw.trim();
  if (text === "" || text === "-") return null;
  const value = Number(text.replaceAll(",", ""));
  return Number.isFinite(value) ? value : null;
}

/** 응답 한 줄을 KosisRow로 바꾼다. 필요한 값(기준시점)이 없으면 null을 돌려 건너뛴다. */
function toRow(raw: unknown): KosisRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const period = typeof item.PRD_DE === "string" ? item.PRD_DE : "";
  if (!period) return null;
  const rawValue = typeof item.DT === "string" ? item.DT : "";
  return {
    period,
    value: parseValue(rawValue),
    rawValue,
    kosisUnit: typeof item.UNIT_NM === "string" ? item.UNIT_NM : "",
    itemName: typeof item.ITM_NM === "string" ? item.ITM_NM : "",
    tableName: typeof item.TBL_NM === "string" ? item.TBL_NM : "",
    lastChangedAt: typeof item.LST_CHN_DE === "string" ? item.LST_CHN_DE : "",
  };
}

/**
 * 지표 하나의 최근 값들을 KOSIS에서 가져온다. 기준시점이 오래된 것부터 정렬해서 돌려준다.
 * 실패하면 KosisError를 던진다. 자동으로 다시 부르지 않는다. (분당 호출 제한 대응)
 */
export async function fetchIndicatorRows(
  indicator: Indicator,
  options: FetchOptions = {},
): Promise<KosisRow[]> {
  const apiKey = readApiKey();
  const url = buildRequestUrl(indicator, apiKey);

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store", // 매번 최신 값을 가져온다
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    // 오류 객체에 요청 주소(키 포함)가 들어 있을 수 있어서, 종류만 남기고 원본은 버린다.
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new KosisError("timeout");
    }
    throw new KosisError("network");
  }

  if (response.status === 429) throw new KosisError("rate-limit");
  if (response.status >= 500) throw new KosisError("server");
  if (!response.ok) throw new KosisError("unknown", String(response.status));

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new KosisError("unknown");
  }

  // 오류일 때 KOSIS는 { err: "30", errMsg: "..." } 모양으로 답한다.
  if (!Array.isArray(body)) {
    const code =
      typeof body === "object" && body !== null && "err" in body
        ? String((body as { err: unknown }).err)
        : undefined;
    throw new KosisError(code ? kindFromErrorCode(code) : "unknown", code);
  }

  const rows = body.map(toRow).filter((row): row is KosisRow => row !== null);
  if (rows.length === 0) {
    throw new KosisError("no-data");
  }
  return rows.sort((a, b) => a.period.localeCompare(b.period));
}

/** 정리된 수치 한 건. 수치 옆에는 출처·기준시점·단위가 항상 붙는다. (DESIGN 공통 원칙 2) */
export interface IndicatorPoint {
  /** 기준시점. 월간은 "202608", 연간은 "2024" */
  period: string;
  /** 수치. KOSIS가 숫자를 주지 않으면 null이며, 추정해서 채우지 않는다. */
  value: number | null;
  /** 화면에 보이는 단위 (지표 정의의 unit) */
  unit: string;
  /** 출처 표기. "통계표명(번호)" (지표 정의의 tableName) */
  source: string;
  /** KOSIS에서 마지막으로 수정된 날짜. 다시 가져온 값이 바뀌었는지 볼 때 쓴다. */
  lastChangedAt: string;
}

/** 지표 하나의 정리된 결과. 월간·연간 모두 같은 모양이다. */
export interface IndicatorSeries {
  /** 지표 이름표 (lib/indicators.ts의 code) */
  code: string;
  /** 화면에 보이는 지표 이름 */
  name: string;
  /** 화면에 보이는 분야 */
  field: Indicator["field"];
  /** 공표 주기. M = 월간, Y = 연간 */
  frequency: Indicator["period"];
  /** 화면에 보이는 단위 */
  unit: string;
  /** 출처 표기. "통계표명(번호)" */
  source: string;
  /** 수치들. 기준시점이 오래된 것부터 최신 순서로 정렬되어 있다. */
  points: IndicatorPoint[];
  /** KOSIS에서 가져온 시각 (ISO 형식) */
  fetchedAt: string;
}

/**
 * 지표 하나를 KOSIS에서 가져와 출처·기준시점·단위를 붙인 같은 모양으로 정리한다.
 * 월간은 최근 13개월, 연간은 최근 3개년이다. (기간 수는 지표 정의에 있다)
 * 실패하면 KosisError를 던진다.
 */
export async function fetchIndicatorSeries(
  indicator: Indicator,
  options: FetchOptions = {},
): Promise<IndicatorSeries> {
  const rows = await fetchIndicatorRows(indicator, options);
  return {
    code: indicator.code,
    name: indicator.name,
    field: indicator.field,
    frequency: indicator.period,
    unit: indicator.unit,
    source: indicator.tableName,
    points: rows.map((row) => ({
      period: row.period,
      value: row.value,
      unit: indicator.unit, // KOSIS가 준 단위 글자는 쓰지 않고 지표 정의의 단위를 쓴다.
      source: indicator.tableName,
      lastChangedAt: row.lastChangedAt,
    })),
    fetchedAt: new Date().toISOString(),
  };
}

/** 정리된 결과에서 가장 최근 기준시점의 수치 한 건을 돌려준다. 수치가 하나도 없으면 undefined. */
export function getLatestPoint(series: IndicatorSeries): IndicatorPoint | undefined {
  return series.points.at(-1);
}

/** 수집에 실패한 지표의 사유. 화면에는 message를 그대로 보여주면 된다. */
export interface IndicatorFailure {
  /** 실패 종류 */
  kind: KosisErrorKind;
  /** KOSIS가 준 오류 번호. 없으면 undefined */
  errorCode?: string;
  /** 화면에 보여줄 쉬운 문구 (DESIGN §2 오류 처리 표) */
  message: string;
  /** true면 이 지표는 호출하지 않았다. 앞선 실패(키 문제·호출 제한 등) 때문에 더 부르지 않은 경우다. */
  skipped: boolean;
}

/** 지표 하나의 수집 결과. 성공하면 정리된 수치가, 실패하면 빈칸과 사유가 들어 있다. */
export type IndicatorResult =
  | { code: string; name: string; field: Indicator["field"]; status: "ok"; series: IndicatorSeries }
  | { code: string; name: string; field: Indicator["field"]; status: "failed"; failure: IndicatorFailure };

/** 지표 여러 개를 수집한 결과 묶음. */
export interface CollectResult {
  /** 요청한 지표 순서대로의 결과 */
  results: IndicatorResult[];
  /** 성공한 지표 수 */
  okCount: number;
  /** 실패한 지표 수 (호출하지 않고 건너뛴 것도 포함) */
  failedCount: number;
  /** 수집을 마친 시각 (ISO 형식) */
  collectedAt: string;
}

/**
 * 이 종류의 실패가 나면 나머지 지표도 같은 이유로 실패할 가능성이 크다.
 * 그래서 더 부르지 않고 멈춘다. (분당 호출 제한 대응, 같은 오류를 헛되이 반복하지 않기)
 */
const STOP_EARLY_KINDS: readonly KosisErrorKind[] = ["missing-key", "auth", "rate-limit", "network"];

/** 실패 결과를 만든다. KosisError가 아닌 오류는 내용을 버리고 "알 수 없음"으로만 남긴다. (키가 새지 않게) */
function toFailure(error: unknown): IndicatorFailure {
  const kosisError = error instanceof KosisError ? error : new KosisError("unknown");
  return {
    kind: kosisError.kind,
    errorCode: kosisError.code,
    message: kosisError.userMessage,
    skipped: false,
  };
}

/**
 * 지표 여러 개를 하나씩 차례로 수집한다. 일부가 실패해도 나머지는 계속 수집한다.
 * - 실패한 지표는 빈칸과 사유만 남기고, 값을 추정하지 않는다.
 * - 실패해도 자동으로 다시 부르지 않는다. 사용자가 실패한 지표만 골라 다시 부르면 된다.
 * - 키 문제·호출 제한·연결 문제가 나면 남은 지표는 부르지 않고 같은 사유로 "건너뜀" 처리한다.
 * 이 함수는 오류를 던지지 않는다. 결과의 status로 성공·실패를 구분한다.
 */
export async function collectIndicators(
  indicators: readonly Indicator[],
  options: FetchOptions = {},
): Promise<CollectResult> {
  const results: IndicatorResult[] = [];
  let stopped: IndicatorFailure | null = null;

  for (const indicator of indicators) {
    const base = { code: indicator.code, name: indicator.name, field: indicator.field };

    if (stopped) {
      results.push({ ...base, status: "failed", failure: { ...stopped, skipped: true } });
      continue;
    }

    try {
      const series = await fetchIndicatorSeries(indicator, options);
      results.push({ ...base, status: "ok", series });
    } catch (error) {
      const failure = toFailure(error);
      results.push({ ...base, status: "failed", failure });
      if (STOP_EARLY_KINDS.includes(failure.kind)) {
        stopped = failure;
      }
    }
  }

  const okCount = results.filter((result) => result.status === "ok").length;
  return {
    results,
    okCount,
    failedCount: results.length - okCount,
    collectedAt: new Date().toISOString(),
  };
}
