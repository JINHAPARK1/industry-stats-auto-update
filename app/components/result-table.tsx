"use client";

// Design Ref: §1 화면 구성 2) 월간 통계 화면 — 지표 표. 분야·지표·수치·단위·기준시점·전년(동월) 대비·이상치·상태·출처가 한 줄에 모두 나온다.
// Design Ref: 공통 원칙 1 — 미확정 수치는 이 검토 표에만 "미확정"으로 보인다. 확정된 수치는 "확정"으로 보인다.
// Plan SC: PLAN 13번 — 수치·출처·기준시점·단위·전년(동월) 대비, 이상치 표시, 수집 실패 표시.
// Plan SC: PLAN 14번 — 줄을 누르면 오른쪽에 확정·수정 패널이 열린다. (패널은 detail-panel.tsx)
import type { CollectItem } from "@/lib/collect-types";
import { formatChange, formatPeriod, formatThreshold, formatValue } from "./format";

/** 지표 표의 열 제목. DESIGN §1의 표 열 순서와 같다. */
const COLUMNS = ["분야", "지표", "수치", "단위", "기준시점", "전년(동월) 대비", "이상치", "상태", "출처"] as const;

const BADGE_BASE = "inline-block whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold";

/** 상태 칸. 색만으로 구분하지 않고 글자도 함께 보여준다. */
function StatusBadge({ item }: { item: CollectItem }) {
  switch (item.state) {
    case "failed":
      return <span className={`${BADGE_BASE} bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200`}>수집 실패</span>;
    case "not-published":
      return (
        <span className={`${BADGE_BASE} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>아직 공표 전</span>
      );
    case "confirmed":
      return (
        <span className={`${BADGE_BASE} bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200`}>확정</span>
      );
    case "not-collected":
      return (
        <span className={`${BADGE_BASE} border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400`}>
          가져오지 않음
        </span>
      );
    default:
      return <span className={`${BADGE_BASE} bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100`}>미확정</span>;
  }
}

/** 이상치 칸. 이상치이면 ⚠와 적용된 기준을 함께 보여준다. */
function OutlierCell({ item }: { item: CollectItem }) {
  if (!item.variation?.isOutlier) return <span className="text-zinc-400">-</span>;
  return (
    <span className="whitespace-nowrap font-semibold text-orange-700 dark:text-orange-400">
      ⚠ 이상치
      <span className="block text-sm font-normal">기준 {formatThreshold(item.variation)}</span>
    </span>
  );
}

interface ItemRowProps {
  item: CollectItem;
  selected: boolean;
  onSelect: (code: string) => void;
}

function ItemRow({ item, selected, onSelect }: ItemRowProps) {
  const hasValue = item.state === "unconfirmed" || item.state === "confirmed";
  // 값이 있는 줄만 눌러서 확정 패널을 열 수 있다.
  const clickable = hasValue;
  return (
    <tr
      onClick={clickable ? () => onSelect(item.code) : undefined}
      className={`border-b border-zinc-200 align-top last:border-b-0 dark:border-zinc-800 ${
        clickable ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60" : ""
      } ${selected ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}
    >
      <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{item.field}</td>
      <th scope="row" className="min-w-48 px-4 py-3 text-left font-semibold text-black dark:text-zinc-50">
        {clickable ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(item.code);
            }}
            aria-label={`${item.name} 확정·수정 열기`}
            className="text-left underline-offset-4 hover:underline focus-visible:underline"
          >
            {item.name}
          </button>
        ) : (
          item.name
        )}
        {item.message && (
          <span
            className={`mt-1 block text-sm font-normal ${
              item.state === "failed" ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300"
            }`}
          >
            {item.message}
            {item.failure?.skipped && " (호출하지 않았습니다)"}
          </span>
        )}
      </th>
      <td className="px-4 py-3 text-right tabular-nums text-black dark:text-zinc-50">
        {hasValue ? formatValue(item.value) : "-"}
        {item.confirmed?.edited && (
          <span className="block text-sm font-normal text-zinc-500 dark:text-zinc-400">
            고침 (KOSIS {formatValue(item.originalValue)})
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{hasValue ? item.unit : "-"}</td>
      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
        {hasValue ? formatPeriod(item.period) : "-"}
        {item.state === "not-published" && item.latestPublishedPeriod && (
          <span className="block text-sm text-zinc-500 dark:text-zinc-400">
            (최근 공표 {formatPeriod(item.latestPublishedPeriod)})
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-black dark:text-zinc-50">
        {hasValue ? formatChange(item.variation) : "-"}
      </td>
      <td className="px-4 py-3">{hasValue ? <OutlierCell item={item} /> : <span className="text-zinc-400">-</span>}</td>
      <td className="px-4 py-3">
        <StatusBadge item={item} />
      </td>
      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">{hasValue ? item.source : "-"}</td>
    </tr>
  );
}

interface ResultTableProps {
  /** 표에 보여줄 지표 10줄. 아직 가져오지 않은 지표도 한 줄로 들어 있다. */
  items: CollectItem[];
  /** 가져오는 중인지 */
  busy: boolean;
  /** 지금 패널이 열려 있는 지표의 이름표. 없으면 null */
  selectedCode: string | null;
  /** 줄을 눌렀을 때 */
  onSelect: (code: string) => void;
  /** 아직 아무것도 가져오지 않았고 저장된 값도 없는지. 안내 문구를 보여줄 때 쓴다. */
  empty: boolean;
}

export default function ResultTable({ items, busy, selectedCode, onSelect, empty }: ResultTableProps) {
  return (
    <section
      aria-label="지표 목록"
      aria-busy={busy}
      className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <table className="w-full min-w-[64rem] border-collapse text-left text-base">
        <caption className="sr-only">산업경제과 월간 주요 통계 지표 10개</caption>
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="whitespace-nowrap px-4 py-3 text-sm font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={busy ? "opacity-50" : undefined}>
          {empty && (
            <tr>
              <td colSpan={COLUMNS.length} className="border-b border-zinc-200 px-4 py-6 text-center text-lg text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                {busy ? "통계를 가져오는 중입니다. 잠시만 기다려 주세요." : "아직 가져온 수치가 없습니다. 「최신 수치 가져오기」를 누르면 수치가 나타납니다."}
              </td>
            </tr>
          )}
          {items.map((item) => (
            <ItemRow key={item.code} item={item} selected={item.code === selectedCode} onSelect={onSelect} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
