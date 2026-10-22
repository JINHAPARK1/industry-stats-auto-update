"use client";

// Design Ref: §1 화면 구성 2) 월간 통계 화면 — 작업 줄(대상 월 선택, 가져오기, 서식 내려받기)과 현황 줄.
// 가져오기 버튼과 서식 버튼은 뼈대만 있고 아직 눌리지 않는다. 연결은 PLAN 13번(가져오기)과 16번(서식)에서 한다.
import { useMemo, useState, useSyncExternalStore } from "react";

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

export default function MonthToolbar() {
  const thisMonthKey = useSyncExternalStore(subscribeNothing, getThisMonthKey, getServerKey);
  const months = useMemo(() => {
    if (!thisMonthKey) return [];
    const [year, month] = thisMonthKey.split("-").map(Number);
    return recentMonths(year, month, MONTH_COUNT);
  }, [thisMonthKey]);
  const [month, setMonth] = useState("");

  return (
    <section aria-label="작업">
      <div className="flex flex-wrap items-center gap-4">
        <label htmlFor="target-month" className="text-lg font-medium text-black dark:text-zinc-50">
          대상 월
        </label>
        <select
          id="target-month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="h-12 rounded-lg border border-zinc-300 bg-white px-4 text-lg text-black dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
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
          disabled
          title="다음 단계에서 연결합니다"
          className="h-12 rounded-full bg-foreground px-6 text-lg font-medium text-background disabled:opacity-40"
        >
          최신 수치 가져오기
        </button>
        <button
          type="button"
          disabled
          title="확정된 수치가 생기면 눌려요"
          className="h-12 rounded-full border border-zinc-300 px-6 text-lg font-medium text-black disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-50"
        >
          한글 서식 내려받기
        </button>
      </div>

      <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400">
        확정 -/10 · 수집 실패 - · 이상치 -
        <span className="ml-3 text-sm">(아직 수치를 가져오지 않았습니다)</span>
      </p>
    </section>
  );
}
