// Design Ref: §1 화면 구성 2) 월간 통계 화면 — 맨 위 줄(앱 이름, 나가기) 아래에 작업 줄·현황 줄·지표 표(StatsPanel)가 놓인다.
// Plan SC: PLAN 12번(화면 틀), PLAN 13번(가져오기 버튼과 결과 표).
import LogoutButton from "./components/logout-button";
import StatsPanel from "./components/stats-panel";

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
        <StatsPanel />
      </main>
    </div>
  );
}
