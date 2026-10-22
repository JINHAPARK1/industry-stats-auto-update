"use client";

// Design Ref: §1 화면 구성 — 지표 상세 페이지(`/indicators/[code]`). 지표 하나의 시계열 흐름을 지표에 맞는 그래프 형식으로 보여준다.
// 기본은 확정된 수치만 그린다. "미확정 수치도 함께 보기"를 켜면 확정 전 수치를 점선·속이 빈 모양으로 함께 보여준다.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ApiErrorBody, CollectItem, MonthsIndicator, MonthsResponse } from "@/lib/collect-types";
import { CHART_KINDS } from "@/lib/indicators";
import { ChangeChart, LevelChart } from "./indicator-charts";
import type { ChangePoint, LevelPoint } from "./indicator-charts";
import { formatChange, formatPeriod, formatValue } from "./format";

const KIND_NAME = { line: "선 그래프", bar: "막대 그래프", area: "영역 그래프" } as const;

/** 로그인이 끊겼을 때 로그인 화면으로 보낸다. */
function goToLogin() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/login";
}

export default function IndicatorDetail({ code }: { code: string }) {
  const [indicator, setIndicator] = useState<MonthsIndicator | null>(null);
  const [error, setError] = useState("");
  const [showUnconfirmed, setShowUnconfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/months");
        if (cancelled) return;
        if (response.status === 401) return goToLogin();
        const body = (await response.json().catch(() => null)) as MonthsResponse | ApiErrorBody | null;
        if (cancelled) return;
        if (!response.ok || !body || !("indicators" in body)) {
          setError(body && "error" in body ? body.error.message : "수치를 불러오지 못했습니다.");
          return;
        }
        setIndicator(body.indicators.find((i) => i.code === code) ?? null);
      } catch {
        if (!cancelled) setError("연결에 문제가 있습니다. 잠시 뒤 다시 열어 주세요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  // 오래된 것부터. 확정된 수치는 확정 값, 아니면 KOSIS에서 가져온 값.
  const items = useMemo(
    () => [...(indicator?.items ?? [])].filter((i) => i.value !== null && i.period).sort((a, b) => (a.period ?? "").localeCompare(b.period ?? "")),
    [indicator],
  );
  const shown = useMemo(() => (showUnconfirmed ? items : items.filter((i) => i.state === "confirmed")), [items, showUnconfirmed]);
  const confirmedCount = items.filter((i) => i.state === "confirmed").length;

  if (error) return <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">{error}</p>;
  if (!indicator) return <p className="text-lg text-zinc-500">불러오는 중입니다.</p>;

  const chart = CHART_KINDS[indicator.code] ?? { kind: "line" as const, reason: "" };
  const levelPoints: LevelPoint[] = shown.map((i) => ({
    period: i.period as string,
    value: i.value as number,
    confirmed: i.state === "confirmed",
    edited: i.confirmed?.edited === true,
  }));
  const changePoints: ChangePoint[] = shown.map((i: CollectItem) => ({
    period: i.period as string,
    change: i.variation ? (i.variation.measure === "point" ? i.variation.changePoint : i.variation.changePercent) : null,
    confirmed: i.state === "confirmed",
  }));
  const sample = items.find((i) => i.variation)?.variation;
  const suffix = sample?.measure === "point" ? "%p" : "%";
  const source = items[0]?.source ?? "";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-base text-zinc-600 dark:text-zinc-400">{indicator.field}</p>
          <h2 className="text-3xl font-bold text-black dark:text-zinc-50">{indicator.name}</h2>
          <p className="mt-1 text-base text-zinc-600 dark:text-zinc-400">
            단위 {indicator.unit} · {indicator.frequency === "M" ? "월간" : "연간"} · 확정 {confirmedCount}개 / 저장된 수치 {items.length}개
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-full border border-zinc-300 px-4 py-2 text-base dark:border-zinc-700">
          <input type="checkbox" checked={showUnconfirmed} onChange={(e) => setShowUnconfirmed(e.target.checked)} className="h-5 w-5" />
          미확정 수치도 함께 보기
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-lg text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          {items.length === 0
            ? "저장된 수치가 없습니다. 월간 통계 화면에서 「최신 수치 가져오기」를 눌러 주세요."
            : "아직 확정된 수치가 없습니다. 「12개월」 화면에서 확정하거나, 위의 「미확정 수치도 함께 보기」를 켜서 확인해 보세요."}
        </p>
      ) : (
        <>
          <section aria-label="값의 흐름" className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-xl font-semibold text-black dark:text-zinc-50">
              {indicator.frequency === "M" ? "월별" : "연도별"} 흐름 <span className="text-base font-normal text-zinc-500 dark:text-zinc-400">({KIND_NAME[chart.kind]})</span>
            </h3>
            <LevelChart points={levelPoints} kind={chart.kind} unit={indicator.unit} baseline={chart.baseline} label={indicator.name} />
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{chart.reason}</p>
          </section>

          {sample && (
            <section aria-label="전년 대비 증감" className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-xl font-semibold text-black dark:text-zinc-50">
                전년{indicator.frequency === "M" ? "동월" : ""} 대비 증감 <span className="text-base font-normal text-zinc-500 dark:text-zinc-400">(막대 그래프)</span>
              </h3>
              <ChangeChart points={changePoints} suffix={suffix} threshold={sample.threshold} label={indicator.name} />
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {indicator.frequency === "M" ? "계절 영향을 없애려고 전월이 아니라 같은 달의 전년 값과 비교합니다. " : ""}
                0 위쪽은 늘어난 것, 아래쪽은 줄어든 것이고, 주황 점선을 넘으면 이상치(⚠)로 표시합니다.
              </p>
            </section>
          )}

          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            속이 찬 모양은 확정된 수치, 점선·속이 빈 모양은 확정 전 수치입니다. 사람이 고친 값은 속이 빈 파란 점으로 그립니다.
          </p>

          <section aria-label="수치 표" className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[32rem] border-collapse text-left text-base">
              <caption className="sr-only">{indicator.name} 기간별 수치</caption>
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-100 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
                  <th scope="col" className="px-4 py-2 font-semibold">기준시점</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">수치</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">전년{indicator.frequency === "M" ? "동월" : ""} 대비</th>
                  <th scope="col" className="px-4 py-2 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody>
                {[...shown].reverse().map((i) => (
                  <tr key={i.period} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800">
                    <td className="px-4 py-2 tabular-nums">{formatPeriod(i.period)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatValue(i.value)}
                      {i.confirmed?.edited && <span className="block text-xs text-zinc-500">고침 (KOSIS {formatValue(i.originalValue)})</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatChange(i.variation)}
                      {i.variation?.isOutlier && <span className="ml-1 font-semibold text-orange-700 dark:text-orange-400">⚠ 이상치</span>}
                    </td>
                    <td className="px-4 py-2">{i.state === "confirmed" ? "확정" : "미확정"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {source && <p className="text-sm text-zinc-500 dark:text-zinc-400">출처: {source}</p>}
        </>
      )}

      <p>
        <Link href="/months" className="text-base font-medium text-blue-700 underline-offset-4 hover:underline dark:text-blue-400">
          12개월 화면에서 확정하러 가기 →
        </Link>
      </p>
    </>
  );
}
