// Design Ref: §2 폴더와 파일 구조 — `lib/store.ts`는 미확정·확정 수치와 수정 이력의 저장·조회를 한 곳에 모은다.
//   저장 방식을 나중에 바꿔도 화면과 계산 코드는 고치지 않게, 저장하고 읽는 부분(StoreBackend)만 갈아 끼울 수 있게 했다.
// Plan SC: PLAN 9번 — 저장 방식. 지금은 개발용 "파일 저장소"만 있다. (아래 getBackend 참고)
// Plan SC: PLAN 10번 — 수집한 미확정 값과 확정 수치의 저장·조회. 확정은 서버에 저장된 원래 값을 기준으로 한다.
// Plan SC: PLAN 11번 — 사람이 고친 수치의 원래 값과 고친 값, 확정 취소·재확정, "KOSIS 값 변경"을 이력으로 남긴다.
//
// 저장소 정책
// - 개발 중(npm run dev)에는 `.data/store.json` 파일에 저장한다. (git에는 올라가지 않는다)
// - 배포(운영) 환경에서는 저장소가 설정되기 전까지 저장·조회를 모두 막는다. Vercel은 파일을 저장할 수 없어서,
//   실수로 파일 저장소로 배포해 값이 사라지는 일을 막으려는 것이다. 배포용 저장소는 PLAN 21번 전에 정한다.
import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  CollectItem,
  ConfirmedInfo,
  HistoryEntry,
  KosisChange,
  VariationView,
} from "./collect-types";
import { INDICATORS } from "./indicators";

/** 저장소에서 생길 수 있는 문제의 종류 */
export type StoreErrorKind =
  | "not-configured" // 저장소가 설정되지 않음 (배포 환경)
  | "io" // 파일을 읽거나 쓰지 못함
  | "not-found" // 해당 수치가 저장돼 있지 않음
  | "already-confirmed" // 이미 확정됨
  | "not-confirmed" // 확정된 수치가 아님
  | "no-value" // 수치가 비어 있음
  | "check-required" // 이상치인데 원 통계표 대조 확인이 없음
  | "invalid-value" // 고친 값이 올바르지 않음
  | "reason-required"; // 고친 사유가 없음

/** 저장소 작업이 실패했을 때 던지는 오류. message는 화면에 그대로 보여줘도 되는 쉬운 문구다. */
export class StoreError extends Error {
  readonly kind: StoreErrorKind;

  constructor(kind: StoreErrorKind, message: string) {
    super(message);
    this.name = "StoreError";
    this.kind = kind;
  }
}

/** 저장소에 들어 있는 수치 한 건 (지표 + 기준시점 하나) */
export interface StoredRecord {
  code: string;
  period: string;
  frequency: "M" | "Y";
  /** 화면에 보여줄 이름과 분야. 가져올 때의 지표 정의를 그대로 담아 둔다. */
  name: string;
  field: string;
  state: "unconfirmed" | "confirmed";
  /** KOSIS에서 가져온 원래 값. 고친 값이 아니다. */
  originalValue: number | null;
  unit: string;
  source: string;
  lastChangedAt: string;
  variation: VariationView | null;
  collectedAt: string;
  confirmed: ConfirmedInfo | null;
  kosisChanged: KosisChange | null;
}

interface StoreFile {
  version: 1;
  /** 키는 "지표이름표|기준시점" */
  records: Record<string, StoredRecord>;
  /** 키는 records와 같다. 오래된 것부터 쌓인다. */
  history: Record<string, HistoryEntry[]>;
}

/** 저장하고 읽는 부분. 저장 방식을 바꿀 때 이것만 새로 만든다. */
interface StoreBackend {
  read(): Promise<StoreFile>;
  write(file: StoreFile): Promise<void>;
}

const EMPTY_FILE = (): StoreFile => ({ version: 1, records: {}, history: {} });

/** 개발용 파일 저장소. `.data/store.json`에 JSON으로 저장한다. */
class FileBackend implements StoreBackend {
  private readonly filePath = process.env.STORE_FILE ?? path.join(process.cwd(), ".data", "store.json");

  async read(): Promise<StoreFile> {
    let text: string;
    try {
      text = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return EMPTY_FILE();
      throw new StoreError("io", "저장된 값을 읽지 못했습니다. 운영자에게 알려 주세요.");
    }
    try {
      const parsed = JSON.parse(text) as StoreFile;
      if (parsed.version !== 1 || typeof parsed.records !== "object" || typeof parsed.history !== "object") {
        throw new Error("unexpected shape");
      }
      return parsed;
    } catch {
      // 깨진 파일 위에 덮어쓰지 않는다. 원본을 그대로 둔 채 멈춘다.
      throw new StoreError("io", "저장된 파일이 손상되어 읽을 수 없습니다. 운영자에게 알려 주세요.");
    }
  }

  async write(file: StoreFile): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      // 임시 파일에 쓴 뒤 바꿔 치기해서, 쓰는 도중에 멈춰도 기존 파일이 깨지지 않게 한다.
      const temp = `${this.filePath}.tmp`;
      await fs.writeFile(temp, JSON.stringify(file, null, 2), "utf8");
      await fs.rename(temp, this.filePath);
    } catch {
      throw new StoreError("io", "저장하지 못했습니다. 운영자에게 알려 주세요.");
    }
  }
}

/**
 * 쓸 저장소를 고른다.
 * - STORE_BACKEND=file 이면 파일 저장소. 설정이 없으면 개발 중에만 파일 저장소를 쓴다.
 * - 배포(운영) 환경에서 설정이 없으면 막는다.
 */
function getBackend(): StoreBackend {
  const mode = process.env.STORE_BACKEND ?? (process.env.NODE_ENV === "production" ? "" : "file");
  // 운영(Vercel)에서는 파일 저장이 사라지거나 실패하므로 파일 저장소를 쓰지 못하게 막는다.
  if (mode === "file" && process.env.NODE_ENV !== "production") return new FileBackend();
  throw new StoreError("not-configured", "저장소가 설정되지 않았습니다. 운영자에게 알려 주세요.");
}

/** 한 번에 하나의 저장 작업만 하게 줄 세운다. (읽고-고치고-쓰는 사이에 다른 작업이 끼어들어 값이 사라지는 것을 막는다) */
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** 읽기만 한다. */
function readOnly<T>(use: (file: StoreFile) => T): Promise<T> {
  return exclusive(async () => use(await getBackend().read()));
}

/** 읽고, 고치고, 쓴다. */
function mutate<T>(change: (file: StoreFile) => T): Promise<T> {
  return exclusive(async () => {
    const backend = getBackend();
    const file = await backend.read();
    const result = change(file);
    await backend.write(file);
    return result;
  });
}

const keyOf = (code: string, period: string) => `${code}|${period}`;

function pushHistory(file: StoreFile, key: string, entry: HistoryEntry): void {
  (file.history[key] ??= []).push(entry);
}

/** 저장된 수치를 화면용 항목으로 바꾼다. */
function toItem(record: StoredRecord): CollectItem {
  return {
    code: record.code,
    name: record.name,
    field: record.field,
    frequency: record.frequency,
    state: record.state,
    period: record.period,
    // 확정된 값이 있으면 그 값을, 아니면 KOSIS에서 가져온 값을 보여준다.
    value: record.confirmed ? record.confirmed.value : record.originalValue,
    originalValue: record.originalValue,
    unit: record.unit,
    source: record.source,
    lastChangedAt: record.lastChangedAt,
    variation: record.variation,
    confirmed: record.confirmed,
    kosisChanged: record.kosisChanged,
    latestPublishedPeriod: null,
    message: record.kosisChanged ? "확정한 뒤 KOSIS 값이 바뀌었습니다. 원 통계표를 확인해 주세요." : null,
    failure: null,
  };
}

/** 가져온 수치(미확정)를 저장한다. 이미 확정한 수치는 값을 바꾸지 않고, KOSIS 값이 달라졌다는 표시만 남긴다. */
export async function saveCollected(items: readonly CollectItem[], now: Date = new Date()): Promise<void> {
  const nowIso = now.toISOString();
  await mutate((file) => {
    for (const item of items) {
      if (item.state !== "unconfirmed" || item.period === null) continue;
      const key = keyOf(item.code, item.period);
      const existing = file.records[key];
      const base = {
        unit: item.unit ?? "",
        source: item.source ?? "",
        lastChangedAt: item.lastChangedAt ?? "",
        variation: item.variation,
        collectedAt: nowIso,
      };

      if (!existing) {
        file.records[key] = {
          code: item.code,
          period: item.period,
          frequency: item.frequency,
          name: item.name,
          field: item.field,
          state: "unconfirmed",
          originalValue: item.originalValue ?? item.value,
          confirmed: null,
          kosisChanged: null,
          ...base,
        };
        pushHistory(file, key, {
          at: nowIso,
          type: "collected",
          originalValue: item.originalValue ?? item.value,
          value: item.originalValue ?? item.value,
          reason: null,
          note: "KOSIS에서 가져옴",
        });
        continue;
      }

      const incoming = item.originalValue ?? item.value;
      if (existing.state === "unconfirmed") {
        const changed = existing.originalValue !== incoming;
        Object.assign(existing, base, { originalValue: incoming });
        if (changed) {
          pushHistory(file, key, {
            at: nowIso,
            type: "collected",
            originalValue: incoming,
            value: incoming,
            reason: null,
            note: "KOSIS에서 다시 가져옴 (값이 달라짐)",
          });
        }
        continue;
      }

      // 이미 확정된 수치: 확정 값은 건드리지 않는다.
      existing.collectedAt = nowIso;
      if (existing.originalValue === incoming) {
        existing.kosisChanged = null;
      } else if (!existing.kosisChanged || existing.kosisChanged.value !== incoming) {
        existing.kosisChanged = { value: incoming, lastChangedAt: item.lastChangedAt ?? "", detectedAt: nowIso };
        pushHistory(file, key, {
          at: nowIso,
          type: "kosis-changed",
          originalValue: existing.originalValue,
          value: incoming,
          reason: null,
          note: `확정한 뒤 KOSIS 값이 바뀜 (${existing.originalValue ?? "-"} → ${incoming ?? "-"})`,
        });
      }
    }
  });
}

export interface StoredView {
  /** 보여주는 기준 월("202608" 형식). 저장된 월간 수치가 없으면 null */
  referenceMonth: string | null;
  /** 저장된 수치들. 지표 정의의 순서대로이고, 저장된 것만 들어 있다. */
  items: CollectItem[];
  /** 저장된 월간 기준시점들(최신 순) */
  storedMonths: string[];
  /** 보여주는 수치 중 가장 최근에 가져온 시각. 없으면 빈 글자 */
  collectedAt: string;
}

/**
 * 저장된 수치를 화면용으로 돌려준다.
 * month를 주면 그 달, 주지 않으면 저장된 가장 최근 월의 월간 지표와 가장 최근 연도의 연간 지표다.
 */
export function getStoredView(month?: string): Promise<StoredView> {
  return readOnly((file) => {
    const records = Object.values(file.records);
    const storedMonths = [...new Set(records.filter((r) => r.frequency === "M").map((r) => r.period))].sort().reverse();
    const referenceMonth = month ?? storedMonths[0] ?? null;

    const items: CollectItem[] = [];
    for (const indicator of INDICATORS) {
      let found: StoredRecord | undefined;
      if (indicator.period === "M") {
        found = referenceMonth ? file.records[keyOf(indicator.code, referenceMonth)] : undefined;
      } else {
        // 연간 지표는 월과 상관없이 가장 최근 연도의 값을 보여준다.
        found = records
          .filter((r) => r.code === indicator.code)
          .sort((a, b) => b.period.localeCompare(a.period))[0];
      }
      if (found) items.push(toItem(found));
    }

    const collectedAt = items
      .map((item) => file.records[keyOf(item.code, item.period ?? "")]?.collectedAt ?? "")
      .sort()
      .at(-1) ?? "";
    return { referenceMonth, items, storedMonths, collectedAt };
  });
}

/** 수치 한 건의 수정 이력(오래된 것부터)을 돌려준다. 없으면 빈 목록. */
export function getHistory(code: string, period: string): Promise<HistoryEntry[]> {
  return readOnly((file) => [...(file.history[keyOf(code, period)] ?? [])]);
}

/** 사용자가 확정하면서 보내는 내용 */
export interface ConfirmInput {
  /** 사람이 고친 값. 고치지 않고 KOSIS 값 그대로 확정하려면 생략한다. */
  editedValue?: number;
  /** 고친 사유. 고쳤을 때만 필요하다. */
  reason?: string;
  /** 이상치를 원 통계표와 대조했다고 확인했는지 */
  checkedAgainstSource?: boolean;
}

/** 고친 사유의 글자 수 상한. 대외비가 섞이지 않게 짧게 제한한다. */
export const MAX_REASON_LENGTH = 200;

/**
 * 수치를 확정한다. 서버에 저장된 원래 값을 기준으로 하므로, 화면에서 보낸 원래 값은 믿지 않는다.
 * - 이상치는 "원 통계표와 대조함" 확인이 있어야 한다.
 * - KOSIS 값과 다른 값으로 고치려면 사유가 있어야 하고, 원래 값과 고친 값이 모두 이력에 남는다.
 */
export function confirmRecord(
  code: string,
  period: string,
  input: ConfirmInput,
  now: Date = new Date(),
): Promise<CollectItem> {
  return mutate((file) => {
    const key = keyOf(code, period);
    const record = file.records[key];
    if (!record) throw new StoreError("not-found", "먼저 「최신 수치 가져오기」로 수치를 가져와 주세요.");
    if (record.state === "confirmed") {
      throw new StoreError("already-confirmed", "이미 확정된 수치입니다. 고치려면 먼저 확정을 취소해 주세요.");
    }
    if (record.originalValue === null) {
      throw new StoreError("no-value", "수치가 없어 확정할 수 없습니다.");
    }
    if (record.variation?.isOutlier && input.checkedAgainstSource !== true) {
      throw new StoreError("check-required", "이상치로 표시된 수치입니다. 원 통계표와 대조했는지 확인해 주세요.");
    }

    const original = record.originalValue;
    let value = original;
    let edited = false;
    let reason: string | null = null;

    if (input.editedValue !== undefined && input.editedValue !== original) {
      if (typeof input.editedValue !== "number" || !Number.isFinite(input.editedValue) || input.editedValue < 0) {
        throw new StoreError("invalid-value", "고친 값은 0 이상의 숫자로 적어 주세요.");
      }
      reason = (input.reason ?? "").trim();
      if (reason.length === 0) {
        throw new StoreError("reason-required", "KOSIS 값과 다른 값으로 확정하려면 고친 사유를 적어 주세요.");
      }
      if (reason.length > MAX_REASON_LENGTH) {
        throw new StoreError("reason-required", `고친 사유는 ${MAX_REASON_LENGTH}자 이내로 적어 주세요.`);
      }
      value = input.editedValue;
      edited = true;
    }

    const nowIso = now.toISOString();
    record.state = "confirmed";
    record.confirmed = {
      value,
      edited,
      reason,
      checkedAgainstSource: input.checkedAgainstSource === true,
      confirmedAt: nowIso,
    };
    record.kosisChanged = null;
    pushHistory(file, key, {
      at: nowIso,
      type: "confirmed",
      originalValue: original,
      value,
      reason,
      note: edited
        ? `확정 (KOSIS 값 ${original} → 고친 값 ${value}, 사유: ${reason})`
        : "확정 (KOSIS 값 그대로)",
    });
    return toItem(record);
  });
}

/**
 * 확정을 취소해 미확정으로 되돌린다. 취소와 이후의 재확정도 이력에 남는다.
 * 확정한 뒤 KOSIS 값이 바뀌었다면, 취소하면서 원래 값을 새 KOSIS 값으로 갱신한다.
 */
export function unconfirmRecord(code: string, period: string, now: Date = new Date()): Promise<CollectItem> {
  return mutate((file) => {
    const key = keyOf(code, period);
    const record = file.records[key];
    if (!record) throw new StoreError("not-found", "저장된 수치를 찾을 수 없습니다.");
    if (record.state !== "confirmed" || !record.confirmed) {
      throw new StoreError("not-confirmed", "확정된 수치가 아닙니다.");
    }

    const nowIso = now.toISOString();
    const cancelledValue = record.confirmed.value;
    if (record.kosisChanged) {
      record.originalValue = record.kosisChanged.value;
      record.lastChangedAt = record.kosisChanged.lastChangedAt;
    }
    record.state = "unconfirmed";
    record.confirmed = null;
    record.kosisChanged = null;
    pushHistory(file, key, {
      at: nowIso,
      type: "unconfirmed",
      originalValue: record.originalValue,
      value: cancelledValue,
      reason: null,
      note: `확정을 취소함 (확정했던 값 ${cancelledValue})`,
    });
    return toItem(record);
  });
}

/** 지표별로 저장된 모든 기간의 수치를 최신 순으로 돌려준다. 12개월 화면에 쓴다. 확정 전 값은 "미확정"으로 들어 있다. */
export function listRecordsByIndicator(): Promise<Record<string, CollectItem[]>> {
  return readOnly((file) => {
    const result: Record<string, CollectItem[]> = {};
    for (const indicator of INDICATORS) result[indicator.code] = [];
    for (const record of Object.values(file.records)) {
      if (record.code in result) result[record.code].push(toItem(record));
    }
    for (const items of Object.values(result)) items.sort((a, b) => (b.period ?? "").localeCompare(a.period ?? ""));
    return result;
  });
}

/** 확정된 수치의 한 점. 그래프에 쓴다. */
export interface ConfirmedPoint {
  period: string;
  value: number;
  unit: string;
  source: string;
  edited: boolean;
}

/** 한 지표의 확정된 수치들을 기준시점 순(오래된 것부터)으로 돌려준다. 확정되지 않은 수치는 들어 있지 않다. */
export function listConfirmedSeries(code: string): Promise<ConfirmedPoint[]> {
  return readOnly((file) =>
    Object.values(file.records)
      .filter((r) => r.code === code && r.state === "confirmed" && r.confirmed)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((r) => ({
        period: r.period,
        value: (r.confirmed as ConfirmedInfo).value,
        unit: r.unit,
        source: r.source,
        edited: (r.confirmed as ConfirmedInfo).edited,
      })),
  );
}

/** 모든 지표의 확정된 수치들을 지표 이름표별로 돌려준다. 그래프에 쓴다. 확정된 것이 없는 지표는 빈 목록이다. */
export function listAllConfirmedSeries(): Promise<Record<string, ConfirmedPoint[]>> {
  return readOnly((file) => {
    const result: Record<string, ConfirmedPoint[]> = {};
    for (const indicator of INDICATORS) result[indicator.code] = [];
    for (const record of Object.values(file.records)) {
      if (record.state !== "confirmed" || !record.confirmed || !(record.code in result)) continue;
      result[record.code].push({
        period: record.period,
        value: record.confirmed.value,
        unit: record.unit,
        source: record.source,
        edited: record.confirmed.edited,
      });
    }
    for (const points of Object.values(result)) points.sort((a, b) => a.period.localeCompare(b.period));
    return result;
  });
}

/** 비교할 때 띄어쓰기·가운뎃점·괄호를 무시하고 대소문자를 구분하지 않게 맞춘다. */
const compact = (text: string) => text.toLowerCase().replace(/[\s·()（）]/g, "");

/**
 * 지표 이름이나 분야에 검색어가 들어 있는 지표의 "확정된 최신 수치"를 돌려준다.
 * 확정되지 않은 수치는 검색 결과에 나오지 않는다. (PRD: 검색은 확정된 최신 수치만 보여준다)
 */
export async function searchLatestConfirmed(query: string): Promise<CollectItem[]> {
  const needle = compact(query);
  if (needle.length === 0) return [];
  const latest = await listLatestConfirmed();
  return latest.filter((item) => compact(item.name).includes(needle) || compact(item.field).includes(needle));
}

/** 확정된 수치 중 가장 최근 기준시점의 한 건씩을 지표 정의 순서대로 돌려준다. 검색에 쓴다. */
export function listLatestConfirmed(): Promise<CollectItem[]> {
  return readOnly((file) => {
    const items: CollectItem[] = [];
    for (const indicator of INDICATORS) {
      const latest = Object.values(file.records)
        .filter((r) => r.code === indicator.code && r.state === "confirmed")
        .sort((a, b) => b.period.localeCompare(a.period))[0];
      if (latest) items.push(toItem(latest));
    }
    return items;
  });
}
