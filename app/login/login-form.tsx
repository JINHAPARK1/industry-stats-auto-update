"use client";

// Design Ref: §1 화면 구성 1) 비밀번호 화면 — 틀리면 "비밀번호가 맞지 않습니다"만 보이고 이유는 알려주지 않는다.
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setMessage(body?.error?.message ?? "들어가지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      setPassword("");
    } catch {
      setMessage("연결에 문제가 있습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <label htmlFor="password" className="text-lg font-medium text-black dark:text-zinc-50">
        비밀번호
      </label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        maxLength={200}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="h-12 rounded-lg border border-zinc-300 bg-white px-4 text-lg text-black outline-none focus:border-black dark:border-zinc-700 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-300"
      />
      <p role="alert" aria-live="polite" className="min-h-6 text-base text-red-600 dark:text-red-400">
        {message}
      </p>
      <button
        type="submit"
        disabled={busy}
        className="h-12 rounded-full bg-foreground px-5 text-lg font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
      >
        {busy ? "확인 중..." : "들어가기"}
      </button>
    </form>
  );
}
