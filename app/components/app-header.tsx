// Design Ref: §1 화면 구성 2) 맨 위 줄 — 앱 이름, 화면 이동, 지표 검색, 나가기. 월간 통계 화면과 그래프 화면이 함께 쓴다.
import Link from "next/link";
import LogoutButton from "./logout-button";
import SearchBox from "./search-box";

interface AppHeaderProps {
  /** 지금 보고 있는 화면. 이동 링크에서 강조한다. */
  current: "monthly" | "charts";
}

const LINK_BASE = "rounded-full px-4 py-2 text-base font-medium";

export default function AppHeader({ current }: AppHeaderProps) {
  const active = "bg-foreground text-background";
  const idle = "text-black hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-800";
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight text-black dark:text-zinc-50">산업통계 자동 업데이트 시스템</h1>
        <nav aria-label="화면 이동" className="flex items-center gap-2">
          <Link href="/" aria-current={current === "monthly" ? "page" : undefined} className={`${LINK_BASE} ${current === "monthly" ? active : idle}`}>
            월간 통계
          </Link>
          <Link href="/charts" aria-current={current === "charts" ? "page" : undefined} className={`${LINK_BASE} ${current === "charts" ? active : idle}`}>
            그래프
          </Link>
        </nav>
        <div className="flex flex-1 items-center justify-end gap-3">
          <SearchBox />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
