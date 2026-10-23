// Design Ref: §1 화면 구성 2) 맨 위 줄 — 앱 이름, 화면 이동(마우스를 올리면 세부 메뉴가 펼쳐진다), 지표 검색, 로그아웃(맨 오른쪽 위). 월간 통계 화면과 그래프 화면이 함께 쓴다.
import Link from "next/link";
import { INDICATORS } from "@/lib/indicators";
import { INTRO_SECTIONS } from "@/lib/intro-pages";
import LogoutButton from "./logout-button";
import SearchBox from "./search-box";

interface AppHeaderProps {
  /** 지금 보고 있는 화면. 이동 링크에서 강조한다. */
  current: "monthly" | "months" | "charts" | "indicator";
}

interface MenuItem {
  label: string;
  href: string;
}

interface Menu {
  key: AppHeaderProps["current"] | "intro";
  label: string;
  href: string;
  items: MenuItem[];
}

/** 화면 이동 메뉴. 마우스를 올리거나 키보드로 이동하면 items가 펼쳐진다. 맨 위 글자를 누르면 href로 간다. */
const MENUS: Menu[] = [
  {
    key: "monthly",
    label: "월간 통계",
    href: "/",
    items: [
      { label: "이번 달 가져오기·확정", href: "/" },
      { label: "달별 확정 현황 보기", href: "/months" },
    ],
  },
  {
    key: "months",
    label: "12개월",
    href: "/months",
    items: [
      { label: "직전 12개월 달별 확정", href: "/months" },
      { label: "이번 달 통계로 돌아가기", href: "/" },
    ],
  },
  {
    key: "charts",
    label: "그래프",
    href: "/charts",
    items: [
      { label: "전체 그래프 한눈에 보기", href: "/charts" },
      ...INDICATORS.map((indicator) => ({ label: indicator.name, href: `/indicators/${indicator.code}` })),
    ],
  },
  {
    key: "intro",
    label: "소개",
    href: `/intro/${INTRO_SECTIONS[0].slug}`,
    items: INTRO_SECTIONS.map((section) => ({ label: section.label, href: `/intro/${section.slug}` })),
  },
];

const LINK_BASE = "block rounded-full px-4 py-2 text-base font-medium";

export default function AppHeader({ current }: AppHeaderProps) {
  const active = "bg-foreground text-background";
  const idle = "text-black hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-800";
  // 지표 상세 화면은 「그래프」 메뉴에 속한 화면으로 강조한다.
  const currentMenu = current === "indicator" ? "charts" : current;
  return (
    <header className="relative z-30 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* 폭 제한 없이 화면 전체를 쓴다. 맨 오른쪽 끝의 「로그아웃」이 화면 오른쪽 위에 오게 하려는 것이다. */}
      <div className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4">
        {/* 좁은 화면: 첫 줄 = 앱 이름 + 로그아웃(맨 오른쪽), 둘째 줄 = 화면 이동, 셋째 줄 = 검색. 넓은 화면: 한 줄에 이름·이동·검색·로그아웃 순서 */}
        <h1 className="order-1 min-w-0 flex-1 text-2xl font-bold tracking-tight text-black md:flex-none dark:text-zinc-50">산업통계 자동 업데이트 시스템</h1>
        <div className="order-2 ml-auto md:order-4 md:ml-0">
          <LogoutButton />
        </div>
        <nav aria-label="화면 이동" className="order-3 flex w-full flex-wrap items-center gap-2 md:order-2 md:w-auto">
          {MENUS.map((menu) => {
            const isCurrent = currentMenu === menu.key;
            return (
              <div key={menu.key} className="group relative">
                <Link href={menu.href} aria-current={isCurrent ? "page" : undefined} aria-haspopup="menu" className={`${LINK_BASE} ${isCurrent ? active : idle}`}>
                  {menu.label}
                </Link>
                {/* pt-2는 글자와 펼침 칸 사이를 이어 줘서, 마우스를 내리는 도중에 메뉴가 닫히지 않게 한다. */}
                <div className="invisible absolute left-0 top-full z-40 pt-2 opacity-0 transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <ul role="menu" className="max-h-[70vh] min-w-52 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                    {menu.items.map((item) => (
                      <li key={`${item.href}-${item.label}`} role="none">
                        <Link href={item.href} role="menuitem" className="block whitespace-nowrap rounded-xl px-3 py-2 text-base text-black hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </nav>
        <div className="order-4 flex w-full items-center md:order-3 md:w-auto md:flex-1 md:justify-end">
          <SearchBox />
        </div>
      </div>
    </header>
  );
}
