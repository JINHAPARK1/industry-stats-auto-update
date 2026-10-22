// Design Ref: §1 화면 구성 2) 월간 통계 화면 — 맨 위 줄, 작업 줄, 현황 줄, 지표 표. 이번에는 틀만 만들고 수치 표시는 PLAN 13번에서 채운다.
// Plan SC: PLAN 12번 — 기본 화면 틀(안내 문구 정리, 대상 월 선택, 나가기).
import LogoutButton from "./components/logout-button";
import MonthToolbar from "./components/month-toolbar";

/** 지표 표의 열 제목. DESIGN §1의 표 열 순서와 같다. */
const COLUMNS = ["분야", "지표", "수치", "단위", "기준시점", "전년(동월) 대비", "이상치", "상태", "출처"] as const;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <h1 className="text-2xl font-bold tracking-tight text-black dark:text-zinc-50">
            산업통계 자동 업데이트 시스템
          </h1>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">
        <MonthToolbar />

        <section aria-label="지표 목록" className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[56rem] border-collapse text-left text-base">
            <caption className="sr-only">산업경제과 월간 주요 통계 지표 10개</caption>
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
                {COLUMNS.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3 text-sm font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-16 text-center text-lg text-zinc-500 dark:text-zinc-400">
                  아직 가져온 수치가 없습니다.
                  <br />
                  <span className="text-base">
                    「최신 수치 가져오기」를 누르면 지표 10개가 이 표에 나타납니다. (버튼은 다음 단계에서 연결합니다)
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
