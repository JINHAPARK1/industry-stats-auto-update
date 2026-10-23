// Design Ref: §1 화면 구성 2) 맨 위 줄 — 앱 이름, 화면 이동, 지표 검색, 로그아웃(맨 오른쪽 위). 월간 통계 화면과 그래프 화면이 함께 쓴다.
import Link from "next/link";
import LogoutButton from "./logout-button";
import SearchBox from "./search-box";

interface AppHeaderProps {
  /** 지금 보고 있는 화면. 이동 링크에서 강조한다. */
  current: "monthly" | "months" | "charts" | "indicator";
}

const LINK_BASE = "rounded-full px-4 py-2 text-base font-medium";

export default function AppHeader({ current }: AppHeaderProps) {
  const active = "bg-foreground text-background";
  const idle = "text-black hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-800";
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* 폭 제한 없이 화면 전체를 쓴다. 맨 오른쪽 끝의 「로그아웃」이 화면 오른쪽 위에 오게 하려는 것이다. */}
      <div className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4">
        {/* 좁은 화면: 첫 줄 = 앱 이름 + 로그아웃(맨 오른쪽), 둘째 줄 = 화면 이동, 셋째 줄 = 검색. 넓은 화면: 한 줄에 이름·이동·검색·로그아웃 순서 */}
        <h1 className="order-1 min-w-0 flex-1 text-2xl font-bold tracking-tight text-black md:flex-none dark:text-zinc-50">산업통계 자동 업데이트 시스템</h1>
        <div className="order-2 ml-auto md:order-4 md:ml-0">
          <LogoutButton />
        </div>
        <nav aria-label="화면 이동" className="order-3 flex w-full items-center gap-2 md:order-2 md:w-auto">
          <Link href="/" aria-current={current === "monthly" ? "page" : undefined} className={`${LINK_BASE} ${current === "monthly" ? active : idle}`}>
            월간 통계
          </Link>
          <Link href="/months" aria-current={current === "months" ? "page" : undefined} className={`${LINK_BASE} ${current === "months" ? active : idle}`}>
            12개월
          </Link>
          <Link href="/charts" aria-current={current === "charts" ? "page" : undefined} className={`${LINK_BASE} ${current === "charts" ? active : idle}`}>
            그래프
          </Link>
        </nav>
        <div className="order-4 flex w-full items-center md:order-3 md:w-auto md:flex-1 md:justify-end">
          <SearchBox />
        </div>
      </div>
    </header>
  );
}
