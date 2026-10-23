// Design Ref: §1 화면 구성 2) 월간 통계 화면 — 맨 위 줄(앱 이름, 화면 이동, 검색, 맨 오른쪽 위 로그아웃) 아래에 작업 줄·현황 줄·지표 표(StatsPanel)가 놓인다.
// Plan SC: PLAN 12번(화면 틀), PLAN 13번(가져오기 버튼과 결과 표), PLAN 14번(확정 패널), PLAN 18번(검색).
import AppHeader from "./components/app-header";
import StatsPanel from "./components/stats-panel";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <AppHeader current="monthly" />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">
        <StatsPanel />
      </main>
    </div>
  );
}
