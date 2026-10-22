"use client";

// Design Ref: §1 화면 구성 2) 월간 통계 화면 — 맨 위 줄의 「나가기」. 접속 쿠키를 지우고 로그인 화면으로 돌아간다.
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      // 요청이 실패해도 로그인 화면으로 보낸다. 쿠키가 남아 있으면 문지기가 다시 첫 화면으로 돌려보낸다.
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="h-11 rounded-full border border-zinc-300 px-5 text-base font-medium text-black transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
    >
      {busy ? "나가는 중..." : "나가기"}
    </button>
  );
}
