"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { SectionCard } from "@/components/admin/memos/section-card";
import { MetaSheet } from "@/components/admin/memos/meta-sheet";
import { SharePanel } from "@/components/admin/memos/share-panel";
import { LinkCompanyDialog } from "@/components/admin/memos/link-company-dialog";
import { MemoHeader } from "@/components/admin/memos/memo-header";
import { MemoDetails } from "@/components/admin/memos/memo-details";
import { SectionNav } from "@/components/admin/memos/section-nav";
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
  const sections = memo.sections.map((s) => ({ key: s.key, title: s.title }));

  return (
    <AppShell>
      <div className="memo-print-scope">
        <MemoHeader memo={memo} onOpenShare={() => setShowShare(true)} onArchive={archive} onChanged={refresh} />

        {suggestion && !dismissed && (
          <div className="memo-no-print mb-6 flex flex-wrap items-center justify-between gap-3 border border-edge bg-muted/40 p-3 text-sm">
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
        )}

        <MemoDetails memo={memo} linked={linked} onEditDetails={() => setShowMeta(true)} onChangeCompany={() => setLinking(true)} />

        <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
          <SectionNav sections={sections} />
          <div className="min-w-0 space-y-8">
            {memo.sections.map((s) => (
              <SectionCard
                key={s.key}
                memoId={memo.id}
                section={s}
                canEdit={memo.canEdit}
                canManage={memo.canManage}
                onChanged={refresh}
                onOpenShare={() => setShowShare(true)}
              />
            ))}
            {memo.canManage && (
              <div className="memo-no-print border-t border-border pt-6">
                <Button variant="ghost" onClick={archive}>
                  <Archive className="h-4 w-4" />
                  Archive memo
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

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
    </AppShell>
  );
}
