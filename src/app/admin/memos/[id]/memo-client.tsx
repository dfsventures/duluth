"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, ExternalLink, Link2, Pencil, Printer, Share2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { MEMO_DECISION_LABELS, MEMO_STATUSES, MEMO_STATUS_LABELS } from "@/lib/memos";
import { SectionCard } from "@/components/admin/memos/section-card";
import { MetaSheet } from "@/components/admin/memos/meta-sheet";
import { SharePanel } from "@/components/admin/memos/share-panel";
import { LinkCompanyDialog } from "@/components/admin/memos/link-company-dialog";
import {
  STATUS_VARIANT,
  formatDateOnly,
  ownerLabel,
  readError,
  refValue,
  type LinkTargets,
  type MemoStatus,
  type MemoView,
} from "@/components/admin/memos/types";

type Suggestion = { id: string; name: string; kind?: "ledger" };

export default function MemoClient({ memo, targets }: { memo: MemoView; targets: LinkTargets }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [showMeta, setShowMeta] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [linking, setLinking] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

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

  async function changeStatus(status: MemoStatus) {
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/admin/memos/${memo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't change the status."));
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the status.");
    } finally {
      setSavingStatus(false);
    }
  }

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
  // The four states (Part 42). Badges are screen-only; print shows the name.
  const companyLine =
    ref.kind === "company" ? (
      <Link href={`/admin/companies/${ref.id}`} className="text-primary underline-offset-4 hover:underline">
        {ref.name}
      </Link>
    ) : ref.kind === "ledger" ? (
      <span className="inline-flex items-center gap-2">
        <Link href={`/admin/portfolio/${ref.id}`} className="text-primary underline-offset-4 hover:underline">
          {ref.name}
        </Link>
        <Badge variant="neutral" className="memo-no-print">
          Deal Ledger
        </Badge>
      </span>
    ) : ref.kind === "pending" ? (
      <span className="inline-flex items-center gap-2">
        <span className="text-foreground">{ref.name}</span>
        <Badge variant="neutral" className="memo-no-print">
          Not linked
        </Badge>
      </span>
    ) : (
      <span className="text-muted-foreground">No company</span>
    );

  const hasDetails = memo.source || memo.decision || memo.tags.length || memo.introDate || memo.websiteUrl || memo.introCalls.length;

  return (
    <AppShell>
      <div className="memo-print-scope">
        <div className="memo-no-print">
          <Breadcrumb items={[{ label: "Memos", href: "/admin/memos" }, { label: memo.title }]} />
        </div>
        <PageHeader
          title={memo.title}
          action={
            <div className="memo-no-print flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print or save as PDF
              </Button>
              <Button variant="secondary" onClick={() => setShowShare(true)}>
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
          }
        />

        <div className="-mt-4 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {companyLine}
          {memo.canEdit ? (
            <select
              aria-label="Status"
              className="input-field memo-no-print w-auto"
              value={memo.status}
              disabled={savingStatus}
              onChange={(e) => changeStatus(e.target.value as MemoStatus)}
            >
              {MEMO_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {MEMO_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          ) : null}
          <Badge variant={STATUS_VARIANT[memo.status]} className={memo.canEdit ? "hidden print:inline-flex" : undefined}>
            {MEMO_STATUS_LABELS[memo.status]}
          </Badge>
          {memo.decision && <Badge variant="neutral">{MEMO_DECISION_LABELS[memo.decision]}</Badge>}
          <Badge variant={memo.visibility === "TEAM" ? "info" : "neutral"} className="memo-no-print">
            {memo.visibility === "TEAM" ? "Shared with team" : "Private"}
          </Badge>
          <span className="text-muted-foreground">Owner: {ownerLabel(memo.owner)}</span>
          <span className="text-muted-foreground">Updated {new Date(memo.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>
        </div>

        {memo.draftedByMarge && (
          <>
            <p className="memo-no-print mb-4 text-sm text-muted-foreground">Drafted by Marge for {ownerLabel(memo.owner)}.</p>
            <p className="mb-4 hidden text-sm print:block">Drafted with Marge</p>
          </>
        )}

        {memo.importedFromNotion && <p className="mb-4 text-sm text-muted-foreground">Imported from Notion.</p>}

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

        <Card className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-foreground">Details</h2>
            <div className="memo-no-print flex gap-1">
              {memo.canManage && (
                <Button size="sm" variant="ghost" onClick={() => setLinking(true)}>
                  <Link2 className="h-4 w-4" />
                  {linked ? "Change company" : "Link to company"}
                </Button>
              )}
              {memo.canEdit && (
                <Button size="sm" variant="ghost" onClick={() => setShowMeta(true)}>
                  <Pencil className="h-4 w-4" />
                  Edit details
                </Button>
              )}
            </div>
          </div>
          {hasDetails ? (
            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              {memo.decision && <Detail label="Decision">{MEMO_DECISION_LABELS[memo.decision]}</Detail>}
              {memo.source && <Detail label="Source">{memo.source}</Detail>}
              {memo.introDate && <Detail label="Intro date">{formatDateOnly(memo.introDate)}</Detail>}
              {memo.websiteUrl && (
                <Detail label="Website">
                  <a href={memo.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                    {memo.websiteUrl.replace(/^https?:\/\//, "")}
                    <ExternalLink aria-hidden="true" className="h-3 w-3" />
                  </a>
                </Detail>
              )}
              {memo.tags.length > 0 && (
                <Detail label="Tags">
                  <span className="flex flex-wrap gap-1">
                    {memo.tags.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </span>
                </Detail>
              )}
              {memo.introCalls.length > 0 && (
                <Detail label="Intro calls">
                  <ul className="space-y-1">
                    {memo.introCalls.map((c, i) => (
                      <li key={i}>
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                            {c.label}
                          </a>
                        ) : (
                          c.label
                        )}
                        {c.date && <span className="text-muted-foreground"> · {formatDateOnly(c.date)}</span>}
                      </li>
                    ))}
                  </ul>
                </Detail>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No details yet: source, tags, intro date, website, intro calls.</p>
          )}
        </Card>

        <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav aria-label="Sections" className="memo-no-print hidden lg:block">
            <ol className="sticky top-6 space-y-1 text-sm">
              {memo.sections.map((s) => (
                <li key={s.key}>
                  <a href={`#section-${s.key}`} className="block truncate py-1 text-muted-foreground hover:text-foreground">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="min-w-0 space-y-8">
            {memo.sections.map((s) => (
              <SectionCard key={s.key} memoId={memo.id} section={s} canEdit={memo.canEdit} canManage={memo.canManage} onChanged={refresh} />
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

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}
