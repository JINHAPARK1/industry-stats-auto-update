"use client";

// Design Ref: §1 화면 구성 2) 월간 통계 화면 — 작업 줄(대상 월 선택, 가져오기, 서식 내려받기), 현황 줄, 지표 표.
// Design Ref: §2 흐름 A — 「최신 수치 가져오기」를 누르면 수집 API를 불러 지표 10개를 "미확정"으로 보여준다. 가져오는 동안 버튼이 잠긴다.
// Plan SC: PLAN 13번 — 가져오기 버튼과 결과 표. 확정(PLAN 14번)·저장(PLAN 9~10번)은 아직 없다.
// 한글 서식 버튼은 확정된 수치가 생겨야 눌리므로 아직 눌리지 않는다. (PLAN 16번)
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { ApiErrorBody, CollectResponse } from "@/lib/collect-types";
import { countItems, formatCollectedAt } from "./format";
import ResultTable from "./result-table";

interface MonthOption {
  /** "202608" 형식. API에 보내는 값 */
  value: string;
  /** "2026년 8월" 형식. 화면에 보이는 글자 */
  label: string;
}

/** 이번 달을 포함해 최근 몇 달을 최신 순서로 만든다. */
function recentMonths(year: number, month: number, count: number): MonthOption[] {
  const options: MonthOption[] = [];
  for (let back = 0; back < count; back += 1) {
    const date = new Date(year, month - 1 - back, 1);
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    options.push({ value: `${y}${String(m).padStart(2, "0")}`, label: `${y}년 ${m}월` });
  }
  return options;
}

/** 대상 월을 고르는 칸에 보여줄 최근 달 수. */
const MONTH_COUNT = 3;

// 오늘 날짜는 화면이 열린 뒤(브라우저)에서만 읽는다. 미리 만들어 둔 화면에는 날짜가 박히지 않게 하려는 것이다.
// 서버에서 만들 때는 빈 값이고, 브라우저에서는 "2026-10" 같은 이번 달 값이다.
const subscribeNothing = () => () => {};
const getThisMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}`;
};
const getServerKey = () => "";

/** 실패한 지표만 다시 가져온 결과를 기존 결과에 합친다. 다시 가져온 지표만 바꾸고 나머지는 그대로 둔다. */
function mergeResults(previous: CollectResponse, retried: CollectResponse): CollectResponse {
  const items = previous.items.map((item) => retried.items.find((next) => next.code === item.code) ?? item);
  const counts = countItems(items);
  return {
    ...previous,
    items,
    collectedAt: retried.collectedAt,
    unconfirmedCount: counts.unconfirmed,
    notPublishedCount: counts.notPublished,
    failedCount: counts.failed,
    outlierCount: counts.outliers,
  };
}

export default function StatsPanel() {
  const router = useRouter();
  const thisMonthKey = useSyncExternalStore(subscribeNothing, getThisMonthKey, getServerKey);
  const months = useMemo(() => {
    if (!thisMonthKey) return [];
    const [year, month] = thisMonthKey.split("-").map(Number);
    return recentMonths(year, month, MONTH_COUNT);
  }, [thisMonthKey]);

  const [month, setMonth] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<CollectResponse | null>(null);
  const [error, setError] = useState("");

  /** 수집 API를 부른다. codes를 주면 그 지표만 가져온다. (실패한 지표만 다시 가져올 때) */
  async function collect(codes?: string[]) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const request: { month?: string; codes?: string[] } = {};
      if (month) request.month = month;
      if (codes) request.codes = codes;

      const response = await fetch("/api/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      // 접속이 끊겼으면 로그인 화면으로 보낸다.
      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => null)) as CollectResponse | ApiErrorBody | null;
      if (!response.ok || body === null || "error" in body) {
        setError((body as ApiErrorBody | null)?.error?.message ?? "가져오지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
        return;
      }
      setData((previous) => (codes && previous ? mergeResults(previous, body) : body));
    } catch {
      setError("연결에 문제가 있습니다. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const counts = data ? countItems(data.items) : null;
  const failedCodes = data ? data.items.filter((item) => item.state === "failed").map((item) => item.code) : [];

  return (
    <>
      <section aria-label="작업">
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor="target-month" className="text-lg font-medium text-black dark:text-zinc-50">
            대상 월
          </label>
          <select
            id="target-month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            disabled={busy}
            className="h-12 rounded-lg border border-zinc-300 bg-white px-4 text-lg text-black disabled:opacity-60 dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
          >
            <option value="">가장 최근 공표 월 (자동)</option>
            {months.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => collect()}
            disabled={busy}
            className="h-12 rounded-full bg-foreground px-6 text-lg font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
          >
            {busy ? "가져오는 중..." : "최신 수치 가져오기"}
          </button>
          {failedCodes.length > 0 && (
            <button
              type="button"
              onClick={() => collect(failedCodes)}
              disabled={busy}
              className="h-12 rounded-full border border-red-300 px-6 text-lg font-medium text-red-800 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950"
            >
              실패한 지표만 다시 가져오기
            </button>
          )}
          <button
            type="button"
            disabled
            title="확정된 수치가 생기면 눌려요"
            className="h-12 rounded-full border border-zinc-300 px-6 text-lg font-medium text-black disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-50"
          >
            한글 서식 내려받기
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-base text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}

        <p aria-live="polite" className="mt-4 text-base text-zinc-700 dark:text-zinc-300">
          {counts && data ? (
            <>
              확정 0/10 · 수집 실패 {counts.failed} · 이상치 {counts.outliers}
              {counts.notPublished > 0 && <> · 아직 공표 전 {counts.notPublished}</>}
              <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
                {formatCollectedAt(data.collectedAt)}에 가져옴
                {!data.saved && " · 저장하지 않았습니다. 새로고침하면 사라집니다."}
              </span>
            </>
          ) : (
            <>
              확정 -/10 · 수집 실패 - · 이상치 -
              <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">(아직 수치를 가져오지 않았습니다)</span>
            </>
          )}
        </p>
      </section>

      <ResultTable items={data?.items ?? null} busy={busy} />
    </>
  );
}
