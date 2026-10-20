"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSheet } from "@/components/ui/sheet";
import { toast } from "@/lib/toast";
import { ShareLinksSection } from "./share-links-section";
import { ownerLabel, readError, type MemoView } from "./types";

/**
 * Sharing, in a Sheet. The owner sets "Share with team" (visibility PRIVATE or TEAM); everyone else
 * sees the state read-only. Below it, the owner manages links for people outside DFS.
 */
export function SharePanel({ memo, onClose, onChanged }: { memo: MemoView; onClose: () => void; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const team = memo.visibility === "TEAM";

  async function setVisibility(next: "PRIVATE" | "TEAM") {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/memos/${memo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't change sharing."));
      toast.success(next === "TEAM" ? "Shared with the team." : "Now private to you.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change sharing.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalSheet title="Share" description="Who can read and edit this memo." onClose={onClose}>
      <div className="space-y-6">
        <div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={team}
              disabled={!memo.canManage || saving}
              onChange={(e) => setVisibility(e.target.checked ? "TEAM" : "PRIVATE")}
            />
            <span>
              <span className="block text-sm font-medium text-foreground">Share with team</span>
              <span className="block text-xs text-muted-foreground">
                {team
                  ? "Every DFS admin can read this memo and edit its sections. Only the owner changes sharing."
                  : "Private to the owner. Nobody else in Molly can see it."}
              </span>
            </span>
          </label>
          {!memo.canManage && (
            <p className="mt-2 text-xs text-muted-foreground">Only {ownerLabel(memo.owner)}, the owner, can change sharing.</p>
          )}
        </div>
        {memo.canManage && <ShareLinksSection memoId={memo.id} />}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </ModalSheet>
  );
}
