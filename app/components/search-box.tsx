"use client";

// Design Ref: §1 화면 구성 2) 맨 위 줄의 「지표 검색」 — 검색창에 이름을 입력하면 아래에 결과가 열리고, 확정된 최신 수치·출처·기준시점이 보인다.
// Design Ref: §2 흐름 D — KOSIS를 다시 부르지 않고 저장된 확정 수치만 찾는다. 확정되지 않은 수치는 나오지 않는다.
// Plan SC: PLAN 18번 — 국정감사 답변 때 지표 이름으로 바로 찾는다. (3초 이내)
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ApiErrorBody, CollectItem, SearchResponse } from "@/lib/collect-types";
import { formatPeriod, formatValue } from "./format";

/** 입력을 멈춘 뒤 이만큼(밀리초) 기다렸다가 찾는다. 글자 하나마다 부르지 않으려는 것이다. */
const SEARCH_DELAY_MS = 250;

export default function SearchBox() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [items, setItems] = useState<CollectItem[] | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 늦게 도착한 옛 검색 결과가 새 결과를 덮어쓰지 않게 번호를 매긴다.
  const requestNumber = useRef(0);

  async function run(query: string) {
    const mine = ++requestNumber.current;
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (mine !== requestNumber.current) return;
      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => null)) as SearchResponse | ApiErrorBody | null;
      if (mine !== requestNumber.current) return;
      if (!response.ok || body === null || "error" in body) {
        setError((body as ApiErrorBody | null)?.error?.message ?? "검색하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
        setItems(null);
        return;
      }
      setError("");
      setItems(body.items);
    } catch {
      if (mine === requestNumber.current) {
        setError("연결에 문제가 있습니다. 잠시 뒤 다시 시도해 주세요.");
        setItems(null);
      }
    }
  }

  function handleChange(value: string) {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim() === "") {
      requestNumber.current += 1; // 진행 중이던 검색 결과는 버린다.
      setItems(null);
      setError("");
      return;
    }
    timer.current = setTimeout(() => void run(value.trim()), SEARCH_DELAY_MS);
  }

  function clear() {
    handleChange("");
  }

  const open = text.trim() !== "" && (items !== null || error !== "");

  return (
    <div role="search" className="relative w-full sm:w-80">
      <label htmlFor="indicator-search" className="sr-only">
        지표 검색
      </label>
      <input
        id="indicator-search"
        type="search"
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") clear();
        }}
        maxLength={50}
        placeholder="지표 검색 (예: 반도체, 자동차)"
        autoComplete="off"
        className="h-11 w-full rounded-full border border-zinc-300 bg-white px-5 text-base text-black dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
      />

      {open && (
        <div
          aria-live="polite"
          className="absolute right-0 z-30 mt-2 max-h-[70vh] w-[min(28rem,90vw)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        >
          {error ? (
            <p className="px-2 py-3 text-base text-red-700 dark:text-red-300">{error}</p>
          ) : items && items.length === 0 ? (
            <p className="px-2 py-3 text-base text-zinc-600 dark:text-zinc-400">
              확정된 수치가 없습니다. 월간 통계 화면에서 수치를 확정하면 여기서 찾을 수 있습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items?.map((item) => (
                <li key={item.code} className="rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800">
                  <p className="text-base font-semibold text-black dark:text-zinc-50">{item.name}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {item.field} · {formatPeriod(item.period)} 기준
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-black dark:text-zinc-50">
                    {formatValue(item.value)}
                    <span className="ml-2 text-base font-normal text-zinc-600 dark:text-zinc-400">{item.unit}</span>
                    {item.confirmed?.edited && (
                      <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                        (고침 · KOSIS {formatValue(item.originalValue)})
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">출처: {item.source}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
