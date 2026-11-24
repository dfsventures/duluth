"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { MetaSheet } from "@/components/admin/memos/meta-sheet";
import { SharePanel } from "@/components/admin/memos/share-panel";
import { LinkCompanyDialog } from "@/components/admin/memos/link-company-dialog";
import { MemoDossier } from "@/components/admin/memos/memo-dossier";
import { readError, refValue, type LinkTargets, type MemoView } from "@/components/admin/memos/types";

type Suggestion = { id: string; name: string; kind?: "ledger" };

export default function MemoClient({ memo, targets }: { memo: MemoView; targets: LinkTargets }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [showMeta, setShowMeta] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [linking, setLinking] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const refresh = () => router.refresh();

  // "Acme is now in Molly. Link it?": only the owner can act on it, so only the owner is asked.
  useEffect(() => {
    if (!memo.canManage || memo.companyRef.kind !== "pending") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/memos/${memo.id}/company-suggestion`);
        if (!res.ok) return;
        const { suggestion: s } = await res.json();
        if (!cancelled) setSuggestion(s ?? null);
      } catch {
        /* a missing suggestion is fine */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memo.id, memo.canManage, memo.companyRef.kind, memo.version]);

  async function archive() {
    if (
      !(await confirm({
        title: "Archive this memo",
        description: "It disappears for everyone, and its share links stop working.",
        confirmLabel: "Archive memo",
      }))
    )
      return;
    const res = await fetch(`/api/admin/memos/${memo.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await readError(res, "Couldn't archive the memo."));
      return;
    }
    router.push("/admin/memos");
  }

  const ref = memo.companyRef;
  const linked = ref.kind === "company" || ref.kind === "ledger";

  const banner =
    suggestion && !dismissed ? (
      <div className="memo-no-print mb-6 flex flex-wrap items-center justify-between gap-3 border border-edge bg-muted/40 p-3 text-sm v2:mb-0 v2:rounded-lg v2:border-0 v2:bg-card v2:p-4">
        <span>{suggestion.kind === "ledger" ? `${suggestion.name} is in the deal ledger. Link it?` : `${suggestion.name} is now in Molly. Link it?`}</span>
        <span className="flex gap-2">
          <Button size="sm" onClick={() => setLinking(true)}>
            Link {suggestion.name}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Not now
          </Button>
        </span>
      </div>
    ) : null;

  const overlays = (
    <>
      {showMeta && <MetaSheet memo={memo} onClose={() => setShowMeta(false)} onSaved={refresh} />}
      {showShare && <SharePanel memo={memo} onClose={() => setShowShare(false)} onChanged={refresh} />}
      {linking && (
        <LinkCompanyDialog
          memoId={memo.id}
          version={memo.version}
          targets={targets}
          initialValue={suggestion && !linked ? `${suggestion.kind === "ledger" ? "p" : "c"}:${suggestion.id}` : undefined}
          currentValue={linked ? refValue(ref) : undefined}
          onClose={() => setLinking(false)}
          onLinked={refresh}
        />
      )}
    </>
  );

  // Direction B "Dossier" (B-175).
  return (
    <AppShell width="detail">
      <div className="memo-print-scope">
        <MemoDossier
          memo={memo}
          linked={linked}
          banner={banner}
          onOpenShare={() => setShowShare(true)}
          onArchive={archive}
          onChanged={refresh}
          onEditDetails={() => setShowMeta(true)}
          onChangeCompany={() => setLinking(true)}
        />
      </div>
      {overlays}
    </AppShell>
  );
}
