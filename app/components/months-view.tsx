"use client";

// 12개월 화면 — 지표(행) × 달(열) 표. 칸을 누르면 오른쪽에 확정 패널(DetailPanel)이 열려 그 달을 확정·수정한다.
// 확정 전 값은 "미확정"으로 표시한다. 그래프·검색·서식에는 확정된 값만 쓰인다.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiErrorBody, BatchConfirmResponse, CollectItem, MonthsIndicator, MonthsResponse } from "@/lib/collect-types";
import { needsSourceCheck } from "@/lib/variation";
import DetailPanel from "./detail-panel";
import { formatPeriod, formatValue } from "./format";

/** 로그인이 끊겼을 때 로그인 화면으로 보낸다. (router 객체는 매번 바뀌어 반복 호출을 일으켜서 쓰지 않는다) */
function goToLogin() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/login";
}

/** 칸 하나. 상태는 색과 글자를 함께 쓴다. */
function Cell({ item, selected, onSelect }: { item: CollectItem | undefined; selected: boolean; onSelect: () => void }) {
  if (!item) return <td className="px-3 py-2 text-center text-zinc-400">-</td>;
  const confirmed = item.state === "confirmed";
  const outlier = item.variation?.isOutlier === true;
  return (
    <td className={`px-1 py-1 ${selected ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${item.name} ${formatPeriod(item.period)} ${confirmed ? "확정" : "미확정"}${outlier ? " 이상치" : ""} 열기`}
        className={`w-full rounded-lg border px-2 py-1.5 text-right tabular-nums hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
          confirmed ? "border-green-600 bg-green-50 dark:border-green-700 dark:bg-green-950/40" : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <span className="block text-black dark:text-zinc-50">{formatValue(item.value)}</span>
        <span className="block whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">
          {confirmed ? "확정" : "미확정"}
          {outlier && <span className="font-semibold text-orange-700 dark:text-orange-400"> ⚠이상치</span>}
        </span>
      </button>
    </td>
  );
}

export default function MonthsView() {
  const [data, setData] = useState<MonthsIndicator[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ code: string; period: string } | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchNote, setBatchNote] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/months");
      if (response.status === 401) {
        goToLogin();
        return;
      }
      const body = (await response.json().catch(() => null)) as MonthsResponse | ApiErrorBody | null;
      if (!response.ok || !body || !("indicators" in body)) {
        setError(body && "error" in body ? body.error.message : "수치를 불러오지 못했습니다.");
        return;
      }
      setData(body.indicators);
    } catch {
      setError("수치를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.");
    }
  }, []);

  useEffect(() => {
    // 처음 열 때 한 번 불러온다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const monthly = useMemo(() => (data ?? []).filter((i) => i.frequency === "M"), [data]);
  const yearly = useMemo(() => (data ?? []).filter((i) => i.frequency === "Y"), [data]);
  // 열 = 월간 지표에 나온 달 전부(오래된 것부터)
  const periods = useMemo(
    () => [...new Set(monthly.flatMap((i) => i.items.map((item) => item.period ?? "")).filter(Boolean))].sort(),
    [monthly],
  );

  const selectedItem = useMemo(() => {
    if (!selected || !data) return null;
    return data.find((i) => i.code === selected.code)?.items.find((item) => item.period === selected.period) ?? null;
  }, [data, selected]);

  // 한 번에 확정할 수 있는 수치: 확정 전이고 이상치가 아닌 모든 달·연도. (이상치는 하나씩 원 통계표와 대조해 확정한다)
  const batchCandidates = useMemo(
    () => (data ?? []).flatMap((i) => i.items.filter((item) => item.state === "unconfirmed" && item.period && !needsSourceCheck(item.variation))),
    [data],
  );
  const outlierCount = useMemo(
    () => (data ?? []).flatMap((i) => i.items).filter((item) => item.state === "unconfirmed" && needsSourceCheck(item.variation)).length,
    [data],
  );

  /** 목록을 사람이 확인한 뒤 이상치가 아닌 수치를 한 번에 확정한다. 이상치는 서버도 한 번 더 걸러 낸다. */
  async function confirmBatch() {
    setBatchBusy(true);
    setBatchNote("");
    try {
      const response = await fetch("/api/confirm-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: batchCandidates.map((item) => ({ code: item.code, period: item.period, value: item.originalValue })) }),
      });
      if (response.status === 401) return goToLogin();
      const body = (await response.json().catch(() => null)) as BatchConfirmResponse | ApiErrorBody | null;
      if (!response.ok || !body || !("confirmed" in body)) {
        setBatchNote(body && "error" in body ? body.error.message : "확정하지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
        return;
      }
      setBatchNote(`${body.confirmed.length}개를 확정했습니다.${body.skipped.length > 0 ? ` ${body.skipped.length}개는 건너뛰었습니다.` : ""}`);
      setBatchOpen(false);
      await load();
    } catch {
      setBatchNote("연결에 문제가 있습니다. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBatchBusy(false);
    }
  }

  if (error) return <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">{error}</p>;
  if (!data) return <p className="text-lg text-zinc-500">불러오는 중입니다.</p>;
  if (periods.length === 0 && yearly.every((i) => i.items.length === 0)) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white p-6 text-lg text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        저장된 수치가 없습니다. 「월간 통계」 화면에서 「최신 수치 가져오기」를 누르면 지표마다 직전 12개월 수치가 나타납니다.
      </p>
    );
  }

  return (
    <>
      <p className="text-base text-zinc-600 dark:text-zinc-400">
        칸을 누르면 그 달을 확인하고 확정할 수 있습니다. 확정 전 수치는 이 화면에만 보이며, 그래프·검색·서식에는 확정한 수치만 쓰입니다.
      </p>

      {batchCandidates.length > 0 && (
        <div className="rounded-xl border border-green-600 bg-white p-4 dark:border-green-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setBatchOpen((open) => !open)}
            aria-expanded={batchOpen}
            disabled={batchBusy}
            className="h-12 rounded-full border border-green-600 px-6 text-lg font-medium text-green-800 hover:bg-green-50 disabled:opacity-60 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-950"
          >
            이상치 아닌 수치 한 번에 확정 ({batchCandidates.length}개)
          </button>
          {batchOpen && (
            <div className="mt-3">
              <p className="text-base font-semibold text-black dark:text-zinc-50">
                아래 {batchCandidates.length}개를 KOSIS 값 그대로 확정합니다. 각 지표의 수치가 원 통계표와 맞는지 훑어본 뒤 눌러 주세요.
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                이상치(⚠)이거나 전년 값이 없어 비교할 수 없는 {outlierCount}개는 여기에 없습니다. 칸을 눌러 하나씩 원 통계표와 대조해 확정해 주세요.
              </p>
              <ul className="mt-3 divide-y divide-zinc-200 text-base dark:divide-zinc-800">
                {(data ?? []).map((indicator) => {
                  const list = indicator.items.filter((item) => item.state === "unconfirmed" && item.period && !needsSourceCheck(item.variation));
                  if (list.length === 0) return null;
                  const periods = list.map((item) => item.period as string).sort();
                  return (
                    <li key={indicator.code} className="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5">
                      <span className="font-medium text-black dark:text-zinc-50">{indicator.name}</span>
                      <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
                        {formatPeriod(periods[0])}
                        {periods.length > 1 ? ` ~ ${formatPeriod(periods[periods.length - 1])}` : ""} · {list.length}개
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={confirmBatch}
                  disabled={batchBusy}
                  className="h-11 rounded-full bg-green-700 px-6 text-base font-semibold text-white hover:bg-green-800 disabled:opacity-60"
                >
                  {batchBusy ? "확정하는 중..." : `목록을 확인했습니다 · ${batchCandidates.length}개 확정`}
                </button>
                <button type="button" onClick={() => setBatchOpen(false)} disabled={batchBusy} className="h-11 rounded-full border border-zinc-300 px-6 text-base dark:border-zinc-700">
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {batchNote && (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-base text-green-900 dark:bg-green-950 dark:text-green-200">
          {batchNote}
        </p>
      )}

      <section aria-label="월간 지표 12개월 표" className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[80rem] border-collapse text-left">
          <caption className="sr-only">월간 지표별 직전 12개월 수치</caption>
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-100 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
              <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">지표 (단위)</th>
              {periods.map((p) => (
                <th key={p} scope="col" className="whitespace-nowrap px-2 py-3 text-center font-semibold tabular-nums">{formatPeriod(p)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthly.map((indicator) => (
              <tr key={indicator.code} className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-800">
                <th scope="row" className="min-w-48 px-4 py-2 text-left font-semibold text-black dark:text-zinc-50">
                  <Link href={`/indicators/${indicator.code}`} aria-label={`${indicator.name} 그래프 페이지로 이동`} className="text-blue-800 underline-offset-4 hover:underline dark:text-blue-300">
                    {indicator.name}
                  </Link>
                  <span className="block text-sm font-normal text-zinc-500 dark:text-zinc-400">{indicator.unit}</span>
                </th>
                {periods.map((p) => {
                  const item = indicator.items.find((x) => x.period === p);
                  return (
                    <Cell
                      key={p}
                      item={item}
                      selected={selected?.code === indicator.code && selected.period === p}
                      onSelect={() => setSelected({ code: indicator.code, period: p })}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {yearly.map((indicator) => (
        <section key={indicator.code} aria-label={`${indicator.name} 연도별`} className="overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-2 text-lg font-semibold text-black dark:text-zinc-50">
            <Link href={`/indicators/${indicator.code}`} className="text-blue-800 underline-offset-4 hover:underline dark:text-blue-300">{indicator.name}</Link>{" "}
            <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">(연 1회 공표, {indicator.unit})</span>
          </h3>
          <table className="border-collapse">
            <tbody>
              <tr>
                {[...indicator.items].reverse().map((item) => (
                  <th key={item.period} scope="col" className="px-2 pb-1 text-center text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatPeriod(item.period)}
                  </th>
                ))}
              </tr>
              <tr>
                {[...indicator.items].reverse().map((item) => (
                  <Cell
                    key={item.period}
                    item={item}
                    selected={selected?.code === indicator.code && selected.period === item.period}
                    onSelect={() => setSelected({ code: indicator.code, period: item.period ?? "" })}
                  />
                ))}
              </tr>
            </tbody>
          </table>
        </section>
      ))}

      {selectedItem && (
        <DetailPanel
          key={`${selectedItem.code}|${selectedItem.period}`}
          item={selectedItem}
          onClose={() => setSelected(null)}
          onChanged={() => void load()}
          onLoginRequired={goToLogin}
        />
      )}
    </>
  );
}
