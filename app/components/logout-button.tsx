"use client";

// Design Ref: §1 화면 구성 2) 맨 위 줄 — 화면 맨 오른쪽 위의 「로그아웃」. 접속 쿠키를 지우고 로그인 전 첫 소개 화면(/intro)으로 돌아간다.
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout-failed");
      // /intro는 한 장짜리 HTML(라우트 핸들러)이라 Next.js가 화면 전체를 새로 불러온다. 쿠키가 지워진 상태로 문지기를 다시 거친다.
      router.replace("/intro");
    } catch {
      // 쿠키가 지워지지 않았는데 소개 화면으로 보내면 문지기가 다시 앱 첫 화면으로 돌려보내므로, 이동하지 않고 다시 누르게 한다.
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="h-11 shrink-0 rounded-full border border-zinc-300 px-5 text-base font-medium text-black transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
    >
      {busy ? "로그아웃 중..." : failed ? "다시 시도" : "로그아웃"}
    </button>
  );
}
