"use client";

// Design Ref: §1 화면 구성 2) 월간 통계 화면 — 줄을 누르면 열리는 오른쪽 패널. 가져온 값, 고칠 값과 사유, 「확정하기」, 수정 이력.
// Design Ref: §1 — 이상치 줄은 "원 통계표와 대조함"에 체크해야 확정할 수 있고, 사유 칸에는 "공개 정보만" 안내와 200자 제한을 둔다.
// Plan SC: PLAN 14번 — 수치를 검토·수정하고 확정한다. 확정 취소와 재확정도 할 수 있고, 모두 수정 이력에 남는다.
import { useEffect, useState } from "react";
import type { ApiErrorBody, CollectItem, ConfirmResponse, HistoryEntry, HistoryResponse } from "@/lib/collect-types";
import { formatChange, formatDateTime, formatPeriod, formatThreshold, formatValue } from "./format";

/** 고친 사유의 글자 수 상한. 서버(lib/store.ts)의 제한과 같다. */
const MAX_REASON_LENGTH = 200;

interface DetailPanelProps {
  item: CollectItem;
  onClose: () => void;
  /** 확정·확정 취소가 끝나 항목이 바뀌었을 때 */
  onChanged: (item: CollectItem) => void;
  /** 로그인이 끊겼을 때 */
  onLoginRequired: () => void;
}

const HISTORY_LABEL: Record<HistoryEntry["type"], string> = {
  collected: "가져옴",
  confirmed: "확정",
  unconfirmed: "확정 취소",
  "kosis-changed": "KOSIS 값 변경",
};

export default function DetailPanel({ item, onClose, onChanged, onLoginRequired }: DetailPanelProps) {
  const [editedText, setEditedText] = useState("");
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const period = item.period ?? "";
  const isConfirmed = item.state === "confirmed";
  const isOutlier = item.variation?.isOutlier === true;

  // 고친 값 칸: 비어 있으면 고치지 않는 것이다. 숫자가 아니거나 KOSIS 값과 같으면 "고치지 않음"으로 본다.
  const editedNumber = editedText.trim() === "" ? null : Number(editedText.replaceAll(",", ""));
  const editedInvalid = editedNumber !== null && (!Number.isFinite(editedNumber) || editedNumber < 0);
  const isEditing = editedNumber !== null && !editedInvalid && editedNumber !== item.originalValue;

  // 수정 이력을 불러온다. 확정·취소를 한 뒤에는 historyVersion이 바뀌어 다시 불러온다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/history?code=${encodeURIComponent(item.code)}&period=${encodeURIComponent(period)}`);
        const body = (await response.json().catch(() => null)) as HistoryResponse | ApiErrorBody | null;
        if (cancelled) return;
        setHistory(response.ok && body && "entries" in body ? body.entries : []);
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.code, period, historyVersion]);

  /** 확정 또는 확정 취소를 서버에 요청한다. */
  async function send(action: "confirm" | "unconfirm") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: item.code,
          period,
          action,
          ...(action === "confirm"
            ? {
                editedValue: isEditing ? editedNumber : undefined,
                reason: isEditing ? reason : undefined,
                checkedAgainstSource: isOutlier ? checked : undefined,
              }
            : {}),
        }),
      });
      if (response.status === 401) {
        onLoginRequired();
        return;
      }
      const body = (await response.json().catch(() => null)) as ConfirmResponse | ApiErrorBody | null;
      if (!response.ok || body === null || "error" in body) {
        setError((body as ApiErrorBody | null)?.error?.message ?? "처리하지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
        return;
      }
      setNotice(action === "confirm" ? "확정했습니다." : "확정을 취소했습니다.");
      setEditedText("");
      setReason("");
      setChecked(false);
      setHistoryVersion((version) => version + 1);
      onChanged(body.item);
    } catch {
      setError("연결에 문제가 있습니다. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const confirmDisabled =
    busy || (isOutlier && !checked) || editedInvalid || (isEditing && reason.trim().length === 0);

  return (
    <aside
      aria-label={`${item.name} 확정·수정`}
      className="fixed inset-y-0 right-0 z-20 flex w-full max-w-md flex-col overflow-y-auto border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
        <div>
          <h2 className="text-xl font-bold text-black dark:text-zinc-50">{item.name}</h2>
          <p className="mt-1 text-base text-zinc-600 dark:text-zinc-400">
            {item.field} · {formatPeriod(item.period)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-10 shrink-0 rounded-full border border-zinc-300 px-4 text-base text-black hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          닫기
        </button>
      </div>

      <div className="flex flex-col gap-6 px-6 py-6">
        <section aria-label="가져온 값">
          <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">KOSIS에서 가져온 값</h3>
          <p className="mt-1 text-3xl font-bold tabular-nums text-black dark:text-zinc-50">
            {formatValue(item.originalValue)}
            <span className="ml-2 text-lg font-normal text-zinc-600 dark:text-zinc-400">{item.unit}</span>
          </p>
          <p className="mt-2 text-base text-zinc-700 dark:text-zinc-300">
            전년(동월) 대비 {formatChange(item.variation)}
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">출처: {item.source}</p>
          {isOutlier && item.variation && (
            <p className="mt-3 rounded-lg bg-orange-50 px-4 py-3 text-base text-orange-900 dark:bg-orange-950 dark:text-orange-200">
              ⚠ 이상치입니다. (기준 {formatThreshold(item.variation)} 이상 변동) 원 통계표와 대조해 확인해 주세요.
            </p>
          )}
          {item.kosisChanged && (
            <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-base text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              확정한 뒤 KOSIS 값이 {formatValue(item.kosisChanged.value)}(으)로 바뀌었습니다. 확정을 취소하면 새 값으로 다시 확인할 수 있습니다.
            </p>
          )}
        </section>

        {isConfirmed && item.confirmed ? (
          <section aria-label="확정 내용" className="rounded-xl border border-green-300 bg-green-50 px-5 py-4 dark:border-green-800 dark:bg-green-950">
            <h3 className="text-sm font-semibold text-green-900 dark:text-green-200">확정된 값</h3>
            <p className="mt-1 text-2xl font-bold tabular-nums text-black dark:text-zinc-50">
              {formatValue(item.confirmed.value)}
              <span className="ml-2 text-base font-normal text-zinc-600 dark:text-zinc-400">{item.unit}</span>
            </p>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              {item.confirmed.edited ? `고친 값입니다. 사유: ${item.confirmed.reason}` : "KOSIS 값 그대로 확정했습니다."}
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formatDateTime(item.confirmed.confirmedAt)}에 확정</p>
            <button
              type="button"
              onClick={() => send("unconfirm")}
              disabled={busy}
              className="mt-4 h-11 rounded-full border border-zinc-400 px-5 text-base font-medium text-black hover:bg-white disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-50 dark:hover:bg-zinc-800"
            >
              {busy ? "처리 중..." : "확정 취소"}
            </button>
          </section>
        ) : (
          <section aria-label="확정하기" className="flex flex-col gap-4">
            {isOutlier && (
              <label className="flex items-start gap-3 text-base text-black dark:text-zinc-50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                  className="mt-1 size-5"
                />
                <span>원 통계표와 대조했습니다.</span>
              </label>
            )}

            <div className="flex flex-col gap-2">
              <label htmlFor="edited-value" className="text-base font-medium text-black dark:text-zinc-50">
                고친 값 <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">(고치지 않으면 비워 두세요)</span>
              </label>
              <input
                id="edited-value"
                inputMode="decimal"
                value={editedText}
                onChange={(event) => setEditedText(event.target.value)}
                placeholder={formatValue(item.originalValue)}
                className="h-12 rounded-lg border border-zinc-300 bg-white px-4 text-lg tabular-nums text-black dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
              />
              {editedInvalid && <p className="text-sm text-red-700 dark:text-red-300">0 이상의 숫자로 적어 주세요.</p>}
            </div>

            {isEditing && (
              <div className="flex flex-col gap-2">
                <label htmlFor="edit-reason" className="text-base font-medium text-black dark:text-zinc-50">
                  고친 사유
                </label>
                <input
                  id="edit-reason"
                  value={reason}
                  maxLength={MAX_REASON_LENGTH}
                  onChange={(event) => setReason(event.target.value)}
                  className="h-12 rounded-lg border border-zinc-300 bg-white px-4 text-lg text-black dark:border-zinc-700 dark:bg-black dark:text-zinc-50"
                />
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  공개 정보만 적어 주세요. ({reason.length}/{MAX_REASON_LENGTH}자)
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => send("confirm")}
              disabled={confirmDisabled}
              className="h-12 rounded-full bg-foreground px-6 text-lg font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {busy ? "처리 중..." : "확정하기"}
            </button>
          </section>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-base text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-base text-green-900 dark:bg-green-950 dark:text-green-200">
            {notice}
          </p>
        )}

        <section aria-label="수정 이력">
          <h3 className="text-base font-semibold text-black dark:text-zinc-50">수정 이력</h3>
          {history === null ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">불러오는 중...</p>
          ) : history.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">아직 이력이 없습니다.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-3">
              {[...history].reverse().map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="border-l-2 border-zinc-300 pl-4 dark:border-zinc-700">
                  <p className="text-sm font-semibold text-black dark:text-zinc-50">
                    {HISTORY_LABEL[entry.type]}
                    <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">{formatDateTime(entry.at)}</span>
                  </p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{entry.note}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </aside>
  );
}
