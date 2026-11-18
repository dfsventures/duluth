"use client";

import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { MEMO_DECISION_NOUN } from "@/lib/memos";
import { readError, type MemoDecision, type MemoStatus, type MemoView } from "@/components/admin/memos/types";

/**
 * Stage (optimistic) and Memo status changes, shared by the old header and the new look's panel.
 * Same requests, same messages: the 409 toast, the retry, the status PATCH.
 */
export function useMemoControls(memo: MemoView, onChanged: () => void) {
  const [stage, setStage] = useState({ decision: memo.decision, version: memo.version });
  useEffect(() => setStage({ decision: memo.decision, version: memo.version }), [memo.decision, memo.version]);
  const [savingStage, setSavingStage] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  async function changeStage(next: MemoDecision | null) {
    const prev = stage;
    setStage({ ...prev, decision: next }); // optimistic
    setSavingStage(true);
    try {
      const res = await fetch(`/api/admin/memos/${memo.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: next, expectedVersion: prev.version, source: "page" }),
      });
      if (res.ok) {
        const saved: { decision: MemoDecision | null; version: number } = await res.json();
        setStage(saved);
        onChanged(); // router.refresh(): other controls pick up the new version
        return;
      }
      setStage(prev);
      if (res.status === 409) {
        toast.error("Someone else just updated this memo. Reload to see the latest, then change the stage again.", {
          action: { label: "Reload", onClick: onChanged },
        });
      } else toast.error(await readError(res, `Couldn't change the ${MEMO_DECISION_NOUN.toLowerCase()}.`));
    } catch {
      setStage(prev);
      toast.error(`Couldn't change the ${MEMO_DECISION_NOUN.toLowerCase()}.`, { retry: () => void changeStage(next) });
    } finally {
      setSavingStage(false);
    }
  }

  async function changeStatus(status: MemoStatus) {
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/admin/memos/${memo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't change the memo status."));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the memo status.");
    } finally {
      setSavingStatus(false);
    }
  }

  return { stage, savingStage, savingStatus, changeStage, changeStatus };
}
