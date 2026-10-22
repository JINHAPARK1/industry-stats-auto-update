// Design Ref: §1 화면 구성 3) 그래프 화면 (`/charts`, 있으면 좋은 기능) — 분야별 카드에 확정된 수치의 선 그래프와 표를 보여준다.
// Plan SC: PLAN 17번 — 확정된 수치만 그린다.
import AppHeader from "../components/app-header";
import ChartsView from "../components/charts-view";

export default function ChartsPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <AppHeader current="charts" />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
        <h2 className="text-2xl font-bold text-black dark:text-zinc-50">분야별 확정 수치 그래프</h2>
        <ChartsView />
      </main>
    </div>
  );
}
