"use client";

// Design Ref: §1 화면 구성 3) 그래프 화면 — 분야별 카드마다 선 그래프와 표. 확정된 수치만 그리고 기준시점은 항상 함께 보인다.
// Plan SC: PLAN 17번 — 확정된 수치만 그린다. 소급 수집을 하지 않아서 확정 값이 쌓인 만큼만 나오고, 13개월 추이는 시간이 지나며 채워진다.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ApiErrorBody, SeriesIndicator, SeriesResponse } from "@/lib/collect-types";
import { formatPeriod, formatValue } from "./format";
import LineChart from "./line-chart";

/** 그래프 아래 표에 보여줄 최근 수치 개수. (월간 13개월) */
const TABLE_LIMIT = 13;

function IndicatorBlock({ indicator }: { indicator: SeriesIndicator }) {
  const { points } = indicator;
  const recent = points.slice(-TABLE_LIMIT);
  return (
    <section aria-label={indicator.name} className="border-t border-zinc-200 pt-5 first:border-t-0 first:pt-0 dark:border-zinc-800">
      <h3 className="text-lg font-semibold text-black dark:text-zinc-50">
        {indicator.name}
        <span className="ml-2 text-base font-normal text-zinc-500 dark:text-zinc-400">
          ({indicator.unit} · {indicator.frequency === "M" ? "월간" : "연간"})
        </span>
      </h3>

      {points.length === 0 ? (
        <p className="mt-3 rounded-lg bg-zinc-100 px-4 py-3 text-base text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          아직 확정된 수치가 없습니다. 월간 통계 화면에서 확정하면 나타납니다.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="sm:w-1/2">
            <LineChart points={points} frequency={indicator.frequency} label={indicator.name} />
            {points.length === 1 && (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                확정된 수치가 1개뿐이라 점 하나만 보입니다. 확정이 쌓이면 선이 이어집니다.
              </p>
            )}
          </div>
          <table className="w-full text-base sm:w-1/2">
            <caption className="sr-only">{indicator.name} 확정된 수치</caption>
            <thead>
              <tr className="border-b border-zinc-200 text-left text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th scope="col" className="py-1 pr-3 font-medium">기준시점</th>
                <th scope="col" className="py-1 text-right font-medium">수치</th>
              </tr>
            </thead>
            <tbody>
              {[...recent].reverse().map((point) => (
                <tr key={point.period} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/60">
                  <td className="py-1 pr-3 tabular-nums text-zinc-700 dark:text-zinc-300">{formatPeriod(point.period)}</td>
                  <td className="py-1 text-right tabular-nums text-black dark:text-zinc-50">
                    {formatValue(point.value)}
                    {point.edited && <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">(고침)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {points.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">출처: {points[points.length - 1].source}</p>
      )}
    </section>
  );
}

export default function ChartsView() {
  const router = useRouter();
  const [indicators, setIndicators] = useState<SeriesIndicator[] | null>(null);
  const [error, setError] = useState("");

  // 화면을 열 때 확정된 수치를 불러온다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/series");
        if (cancelled) return;
        if (response.status === 401) {
          router.replace("/login");
          router.refresh();
          return;
        }
        const body = (await response.json().catch(() => null)) as SeriesResponse | ApiErrorBody | null;
        if (cancelled) return;
        if (!response.ok || body === null || "error" in body) {
          setError((body as ApiErrorBody | null)?.error?.message ?? "그래프를 불러오지 못했습니다.");
          return;
        }
        setIndicators(body.indicators);
      } catch {
        if (!cancelled) setError("연결에 문제가 있습니다. 잠시 뒤 다시 시도해 주세요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // 분야별로 묶는다. 지표 정의 순서를 그대로 따른다.
  const groups = useMemo(() => {
    const map = new Map<string, SeriesIndicator[]>();
    for (const indicator of indicators ?? []) {
      map.set(indicator.field, [...(map.get(indicator.field) ?? []), indicator]);
    }
    return [...map.entries()];
  }, [indicators]);

  const anyConfirmed = indicators?.some((indicator) => indicator.points.length > 0) ?? false;

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-base text-red-800 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  }
  if (indicators === null) {
    return <p className="text-lg text-zinc-500 dark:text-zinc-400">불러오는 중입니다...</p>;
  }

  return (
    <>
      <p className="rounded-lg bg-zinc-100 px-4 py-3 text-base text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        확정된 수치만 그립니다. 확정하지 않은 수치는 나오지 않습니다. 지난 달을 한꺼번에 가져오지 않기 때문에, 확정한 값이 쌓인 만큼만 점이 생깁니다.
      </p>
      {!anyConfirmed && (
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          아직 확정된 수치가 없습니다. 월간 통계 화면에서 수치를 확정하면 여기에 나타납니다.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map(([field, list]) => (
          <section
            key={field}
            aria-label={field}
            className="flex flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="text-xl font-bold text-black dark:text-zinc-50">{field}</h2>
            {list.map((indicator) => (
              <IndicatorBlock key={indicator.code} indicator={indicator} />
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
