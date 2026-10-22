"use client";

// Design Ref: §1 화면 구성 2) 월간 통계 화면 — 작업 줄(대상 월 선택, 가져오기, 서식 내려받기), 현황 줄, 지표 표, 오른쪽 확정 패널.
// Design Ref: §2 흐름 A·B — 「최신 수치 가져오기」로 지표 10개를 "미확정"으로 저장하고, 줄을 눌러 확인·확정한다.
// Design Ref: §1 — 이미 지난 달은 새로 가져오지 않고 저장된(확정된) 값만 조회한다. 가져오는 동안 버튼이 잠긴다.
// Plan SC: PLAN 13번 가져오기 버튼과 결과 표, PLAN 10번 저장된 값 조회, PLAN 14번 확정 패널.
// 한글 서식 버튼은 서식 파일을 받아야 연결할 수 있어서 아직 눌리지 않는다. (PLAN 15~16번)
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ApiErrorBody, CollectItem, CollectResponse } from "@/lib/collect-types";
import { INDICATORS } from "@/lib/indicators";
import DetailPanel from "./detail-panel";
import { countItems, formatCollectedAt } from "./format";
import ResultTable from "./result-table";

interface MonthOption {
  /** "202608" 형식. API에 보내는 값 */
  value: string;
  /** "2026년 8월" 형식. 화면에 보이는 글자 */
  label: string;
}

const monthLabel = (value: string) => `${value.slice(0, 4)}년 ${Number(value.slice(4))}월`;

/** 이번 달을 포함해 최근 몇 달을 최신 순서로 만든다. */
function recentMonths(year: number, month: number, count: number): MonthOption[] {
  const options: MonthOption[] = [];
  for (let back = 0; back < count; back += 1) {
    const date = new Date(year, month - 1 - back, 1);
    const value = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
    options.push({ value, label: monthLabel(value) });
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

/** 아직 가져오지 않은 지표의 빈 줄 */
function placeholderItem(indicator: (typeof INDICATORS)[number]): CollectItem {
  return {
    code: indicator.code,
    name: indicator.name,
    field: indicator.field,
    frequency: indicator.period,
    state: "not-collected",
    period: null,
    value: null,
    originalValue: null,
    unit: null,
    source: null,
    lastChangedAt: null,
    variation: null,
    confirmed: null,
    kosisChanged: null,
    latestPublishedPeriod: null,
    message: null,
    failure: null,
  };
}

/** 항목 목록으로 개수 필드를 다시 맞춘다. */
function withCounts(response: CollectResponse, items: CollectItem[]): CollectResponse {
  const counts = countItems(items);
  return {
    ...response,
    items,
    confirmedCount: counts.confirmed,
    unconfirmedCount: counts.unconfirmed,
    notPublishedCount: counts.notPublished,
    failedCount: counts.failed,
    outlierCount: counts.outliers,
  };
}

/** 실패한 지표만 다시 가져온 결과를 기존 결과에 합친다. 다시 가져온 지표만 바꾸고 나머지는 그대로 둔다. */
function mergeResults(previous: CollectResponse, retried: CollectResponse): CollectResponse {
  const items = previous.items.map((item) => retried.items.find((next) => next.code === item.code) ?? item);
  return withCounts(
    { ...previous, collectedAt: retried.collectedAt, saved: retried.saved, saveError: retried.saveError, storedMonths: retried.storedMonths },
    items,
  );
}

export default function StatsPanel() {
  const router = useRouter();
  const thisMonthKey = useSyncExternalStore(subscribeNothing, getThisMonthKey, getServerKey);

  const [month, setMonth] = useState("");
  // 지금 하는 일: 가져오는 중(collect), 저장된 값을 불러오는 중(load), 없음(null)
  const [busy, setBusy] = useState<"collect" | "load" | "form" | null>("load");
  const [data, setData] = useState<CollectResponse | null>(null);
  const [error, setError] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const storedMonths = useMemo(() => data?.storedMonths ?? [], [data]);

  // 대상 월 선택지: 자동 + 최근 3개월 + 저장돼 있는 달. 중복 없이 최신 순서.
  const monthOptions = useMemo(() => {
    const options = new Map<string, string>();
    if (thisMonthKey) {
      const [year, monthNumber] = thisMonthKey.split("-").map(Number);
      for (const option of recentMonths(year, monthNumber, MONTH_COUNT)) options.set(option.value, option.label);
    }
    for (const value of storedMonths) options.set(value, monthLabel(value));
    return [...options.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([value, label]) => ({ value, label }));
  }, [thisMonthKey, storedMonths]);

  // 저장돼 있는 달 중 가장 최근 달보다 오래된 달을 골랐으면 "조회 전용"이다. 새로 가져올 수 없다.
  const viewOnly = month !== "" && storedMonths.length > 0 && storedMonths.includes(month) && month < storedMonths[0];

  const tableItems = useMemo(
    () => INDICATORS.map((indicator) => data?.items.find((item) => item.code === indicator.code) ?? placeholderItem(indicator)),
    [data],
  );
  const selectedItem = selectedCode ? (tableItems.find((item) => item.code === selectedCode) ?? null) : null;

  function goToLogin() {
    router.replace("/login");
    router.refresh();
  }

  /** 서버에 저장된 값을 불러온다. 월을 주지 않으면 저장된 가장 최근 월이다. */
  async function loadStored(target?: string) {
    setBusy("load");
    setError("");
    try {
      const response = await fetch(`/api/records${target ? `?month=${target}` : ""}`);
      if (response.status === 401) return goToLogin();
      const body = (await response.json().catch(() => null)) as CollectResponse | ApiErrorBody | null;
      if (!response.ok || body === null || "error" in body) {
        setError((body as ApiErrorBody | null)?.error?.message ?? "저장된 값을 불러오지 못했습니다.");
        return;
      }
      setData(body.items.length > 0 ? body : null);
    } catch {
      setError("연결에 문제가 있습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  // 화면을 처음 열 때 저장돼 있는 값을 불러온다. (새로고침해도 값이 남아 있게)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/records");
        if (cancelled) return;
        if (response.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }
        const body = (await response.json().catch(() => null)) as CollectResponse | ApiErrorBody | null;
        if (cancelled) return;
        if (response.ok && body && "items" in body) {
          setData(body.items.length > 0 ? body : null);
        } else {
          setError((body as ApiErrorBody | null)?.error?.message ?? "저장된 값을 불러오지 못했습니다.");
        }
      } catch {
        if (!cancelled) setError("연결에 문제가 있습니다. 잠시 뒤 다시 시도해 주세요.");
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleMonthChange(value: string) {
    setMonth(value);
    setSelectedCode(null);
    // 저장돼 있는 달(또는 자동)을 고르면 저장된 값을 보여준다. 아직 저장되지 않은 달은 「가져오기」를 눌러야 한다.
    if (value === "" || storedMonths.includes(value)) void loadStored(value || undefined);
  }

  /** 수집 API를 부른다. codes를 주면 그 지표만 가져온다. (실패한 지표만 다시 가져올 때) */
  /** 확정된 수치로 만든 한글 서식(.hwpx)을 내려받는다. 확정한 수치가 없으면 서버가 이유를 알려 준다. */
  async function downloadForm() {
    setError("");
    setBusy("form");
    try {
      const response = await fetch("/api/form");
      if (response.status === 401) return goToLogin();
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError((body as ApiErrorBody | null)?.error?.message ?? "서식을 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = decodeURIComponent(
        (response.headers.get("Content-Disposition") ?? "").match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? "산경과_주요통계.hwpx",
      );
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("연결에 문제가 있습니다. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(null);
    }
  }

  async function collect(codes?: string[]) {
    if (busy) return;
    setBusy("collect");
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
      if (response.status === 401) return goToLogin();

      const body = (await response.json().catch(() => null)) as CollectResponse | ApiErrorBody | null;
      if (!response.ok || body === null || "error" in body) {
        setError((body as ApiErrorBody | null)?.error?.message ?? "가져오지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
        return;
      }
      setData((previous) => (codes && previous ? mergeResults(previous, body) : body));
    } catch {
      setError("연결에 문제가 있습니다. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(null);
    }
  }

  /** 확정·확정 취소가 끝났을 때 표의 한 줄을 새 내용으로 바꾼다. */
  function handleChanged(changed: CollectItem) {
    setData((previous) => {
      if (!previous) return previous;
      const exists = previous.items.some((item) => item.code === changed.code);
      const items = exists
        ? previous.items.map((item) => (item.code === changed.code ? changed : item))
        : [...previous.items, changed];
      return withCounts(previous, items);
    });
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
            onChange={(event) => handleMonthChange(event.target.value)}
            disabled={busy !== null}
            className="h-12 rounded-lg border border-zinc-300 bg-white px-4 text-lg text-black disabled:opacity-60 dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
          >
            <option value="">가장 최근 공표 월 (자동)</option>
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
                {storedMonths.includes(option.value) ? " (저장됨)" : ""}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => collect()}
            disabled={busy !== null || viewOnly}
            title={viewOnly ? "지난 달은 새로 가져올 수 없고 저장된 값만 볼 수 있습니다" : undefined}
            className="h-12 rounded-full bg-foreground px-6 text-lg font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
          >
            {busy === "collect" ? "가져오는 중..." : "최신 수치 가져오기"}
          </button>
          {failedCodes.length > 0 && (
            <button
              type="button"
              onClick={() => collect(failedCodes)}
              disabled={busy !== null || viewOnly}
              className="h-12 rounded-full border border-red-300 px-6 text-lg font-medium text-red-800 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950"
            >
              실패한 지표만 다시 가져오기
            </button>
          )}
          <button
            type="button"
            onClick={downloadForm}
            disabled={busy !== null}
            title="확정한 수치만 한글 서식에 넣어 내려받습니다"
            className="h-12 rounded-full border border-zinc-300 px-6 text-lg font-medium text-black hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            {busy === "form" ? "서식을 만드는 중..." : "한글 서식 내려받기"}
          </button>
        </div>

        {viewOnly && (
          <p className="mt-4 rounded-lg bg-zinc-100 px-4 py-3 text-base text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {monthLabel(month)}은 지난 달이라 새로 가져올 수 없고, 저장된 값만 볼 수 있습니다.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-base text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}

        <p aria-live="polite" className="mt-4 text-base text-zinc-700 dark:text-zinc-300">
          {counts && data ? (
            <>
              확정 {counts.confirmed}/10 · 미확정 {counts.unconfirmed} · 수집 실패 {counts.failed} · 이상치 {counts.outliers}
              {counts.notPublished > 0 && <> · 아직 공표 전 {counts.notPublished}</>}
              <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
                {data.collectedAt && `${formatCollectedAt(data.collectedAt)}에 가져옴`}
                {!data.saved && ` · 저장하지 못했습니다. ${data.saveError ?? ""}`}
              </span>
            </>
          ) : (
            <>
              확정 -/10 · 미확정 - · 수집 실패 - · 이상치 -
              <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
                {busy === "load" ? "(저장된 값을 불러오는 중입니다)" : "(아직 수치를 가져오지 않았습니다)"}
              </span>
            </>
          )}
        </p>
      </section>

      <ResultTable
        items={tableItems}
        busy={busy !== null}
        selectedCode={selectedCode}
        onSelect={setSelectedCode}
        empty={data === null}
      />

      {selectedItem && (
        <DetailPanel
          key={`${selectedItem.code}|${selectedItem.period}`}
          item={selectedItem}
          onClose={() => setSelectedCode(null)}
          onChanged={handleChanged}
          onLoginRequired={goToLogin}
        />
      )}
    </>
  );
}
