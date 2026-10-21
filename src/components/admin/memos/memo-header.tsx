"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Link2Off, Lock, MoreHorizontal, Printer, Archive, Share2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import {
  MEMO_DECISIONS,
  MEMO_DECISION_LABELS,
  MEMO_DECISION_NOUN,
  MEMO_STATUSES,
  MEMO_STATUS_LABELS,
  MEMO_STATUS_NOUN,
} from "@/lib/memos";
import { sameName } from "@/lib/memo-board";
import { STATUS_VARIANT, ownerLabel, readError, type MemoDecision, type MemoStatus, type MemoView } from "@/components/admin/memos/types";

const CONTROL =
  "h-8 w-auto rounded-ctl border border-input bg-card py-0 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const ICON_LINK = "inline-flex items-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Props {
  memo: MemoView;
  onOpenShare: () => void;
  onArchive: () => void;
  /** Refresh the server data (router.refresh). */
  onChanged: () => void;
}

// Part 44 (WS146.2): title row, controls row (Stage, Memo status, Visibility) and a facts line.
export function MemoHeader({ memo, onOpenShare, onArchive, onChanged }: Props) {
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

  const ref = memo.companyRef;
  const sameAsTitle = ref.kind !== "none" && sameName(ref.name, memo.title);
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
    ) : null;

  // JC-MP-G: when the name repeats the title, a quiet icon keeps the company reachable.
  const companyIcon =
    ref.kind === "company" ? (
      <Link href={`/admin/companies/${ref.id}`} aria-label={`Open ${ref.name} in Molly`} title={`Open ${ref.name} in Molly`} className={ICON_LINK}>
        <Building2 aria-hidden className="h-4 w-4" />
      </Link>
    ) : ref.kind === "ledger" ? (
      <Link href={`/admin/portfolio/${ref.id}`} aria-label={`Open ${ref.name} in the Deal Ledger`} title={`Open ${ref.name} in the Deal Ledger`} className={ICON_LINK}>
        <Building2 aria-hidden className="h-4 w-4" />
      </Link>
    ) : ref.kind === "pending" ? (
      <span title="Not linked" className="inline-flex items-center text-muted-foreground">
        <Link2Off aria-hidden className="h-4 w-4" />
        <span className="sr-only">Not linked</span>
      </span>
    ) : null;

  const stageLabel = stage.decision ? MEMO_DECISION_LABELS[stage.decision] : "Unsorted";
  const team = memo.visibility === "TEAM";
  const updated = new Date(memo.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <header className="mb-6">
      <div className="memo-no-print">
        <Breadcrumb items={[{ label: "Memos", href: "/admin/memos" }, { label: memo.title }]} />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-foreground">
            <span className="min-w-0 break-words">{memo.title}</span>
            {sameAsTitle && <span className="memo-no-print">{companyIcon}</span>}
          </h1>
          {!sameAsTitle && companyLine && <p className="mt-1 text-sm">{companyLine}</p>}
        </div>
        <div className="memo-no-print flex shrink-0 items-center gap-2">
          <Button variant="secondary" className="hidden sm:inline-flex" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print or save as PDF
          </Button>
          <Button variant="secondary" onClick={onOpenShare}>
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="More actions">
                  <MoreHorizontal aria-hidden className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => window.print()}>
                  <Printer aria-hidden className="h-3.5 w-3.5" />
                  Print or save as PDF
                </DropdownMenuItem>
                {memo.canManage && (
                  <DropdownMenuItem onSelect={onArchive}>
                    <Archive aria-hidden className="h-3.5 w-3.5" />
                    Archive memo
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="memo-no-print mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor="memo-stage" className="label">
            {MEMO_DECISION_NOUN}
          </label>
          {memo.canEdit ? (
            <select
              id="memo-stage"
              className={CONTROL}
              value={stage.decision ?? ""}
              disabled={savingStage}
              onChange={(e) => void changeStage((e.target.value || null) as MemoDecision | null)}
            >
              <option value="">Unsorted</option>
              {MEMO_DECISIONS.map((d) => (
                <option key={d} value={d}>
                  {MEMO_DECISION_LABELS[d]}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-foreground">{stageLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="memo-status" className="label">
            {MEMO_STATUS_NOUN}
          </label>
          {memo.canEdit ? (
            <select
              id="memo-status"
              className={CONTROL}
              value={memo.status}
              disabled={savingStatus}
              onChange={(e) => void changeStatus(e.target.value as MemoStatus)}
            >
              {MEMO_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {MEMO_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          ) : (
            <Badge variant={STATUS_VARIANT[memo.status]}>{MEMO_STATUS_LABELS[memo.status]}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="label">Visibility</span>
          <Button variant="secondary" size="sm" onClick={onOpenShare}>
            {team ? <Users aria-hidden className="h-3.5 w-3.5" /> : <Lock aria-hidden className="h-3.5 w-3.5" />}
            {team ? "Shared with team" : "Private"}
          </Button>
        </div>
      </div>

      <p className="mt-3 hidden text-sm print:block">
        {`${MEMO_DECISION_NOUN}: ${stageLabel} · ${MEMO_STATUS_NOUN}: ${MEMO_STATUS_LABELS[memo.status]}`}
      </p>

      <p className="mt-2 flex flex-wrap gap-x-2 text-sm text-muted-foreground">
        <span>Owned by {ownerLabel(memo.owner)}</span>
        <span aria-hidden="true">·</span>
        <span>Updated {updated}</span>
        {memo.importedFromNotion && (
          <>
            <span aria-hidden="true">·</span>
            <span>From Notion</span>
          </>
        )}
        {memo.draftedByMarge && (
          <span className="memo-no-print contents">
            <span aria-hidden="true">·</span>
            <span>Drafted by Marge</span>
          </span>
        )}
      </p>
      {memo.draftedByMarge && <p className="mt-1 hidden text-sm print:block">Drafted with Marge</p>}
    </header>
  );
}
