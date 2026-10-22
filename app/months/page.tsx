// 12개월 화면 (`/months`) — 지표마다 직전 12개월 수치를 한눈에 보고, 달마다 눌러서 확정한다.
import AppHeader from "../components/app-header";
import MonthsView from "../components/months-view";

export default function MonthsPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <AppHeader current="months" />

      <main className="mx-auto flex w-full max-w-[96rem] flex-1 flex-col gap-6 px-6 py-8">
        <h2 className="text-2xl font-bold text-black dark:text-zinc-50">지표별 직전 12개월 수치</h2>
        <MonthsView />
      </main>
    </div>
  );
}
