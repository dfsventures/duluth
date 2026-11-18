"use client";

import Link from "next/link";
import { companyIconNode, companyLineNode } from "@/components/admin/memos/memo-company-bits";
import { ArrowLeft, Lock, MoreHorizontal, Printer, Archive, Share2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNewLook } from "@/lib/use-new-look";
import {
  MEMO_DECISIONS,
  MEMO_DECISION_LABELS,
  MEMO_DECISION_NOUN,
  MEMO_STATUSES,
  MEMO_STATUS_LABELS,
  MEMO_STATUS_NOUN,
} from "@/lib/memos";
import { sameName } from "@/lib/memo-board";
import { useMemoControls } from "@/components/admin/memos/use-memo-controls";
import { STATUS_VARIANT, ownerLabel, type MemoDecision, type MemoStatus, type MemoView } from "@/components/admin/memos/types";

const CONTROL =
  "h-8 w-auto rounded-ctl border border-input bg-card py-0 pl-3 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

interface Props {
  memo: MemoView;
  onOpenShare: () => void;
  onArchive: () => void;
  /** Refresh the server data (router.refresh). */
  onChanged: () => void;
}

// Part 44 (WS146.2): title row, controls row (Stage, Memo status, Visibility) and a facts line.
export function MemoHeader({ memo, onOpenShare, onArchive, onChanged }: Props) {
  const newLook = useNewLook();
  const { stage, savingStage, savingStatus, changeStage, changeStatus } = useMemoControls(memo, onChanged);

  const ref = memo.companyRef;
  const sameAsTitle = ref.kind !== "none" && sameName(ref.name, memo.title);
  const companyLine = companyLineNode(ref);
  const companyIcon = companyIconNode(ref);

  const stageLabel = stage.decision ? MEMO_DECISION_LABELS[stage.decision] : "Unsorted";
  const team = memo.visibility === "TEAM";
  const updated = new Date(memo.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <header className="mb-6 v2:mb-8">
      <div className="memo-no-print">
        {newLook ? (
          // New look (WS163): the crumb is a back link to the list, like the pane's crumb bar.
          <Link
            href="/admin/memos"
            className="mb-4 inline-flex h-8 items-center gap-1.5 rounded-ctl text-meta text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Memos
          </Link>
        ) : (
          <Breadcrumb items={[{ label: "Memos", href: "/admin/memos" }, { label: memo.title }]} />
        )}
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-foreground v2:font-sans v2:text-title">
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
          {/* One primary action per view in the new look: Share. */}
          <Button variant={newLook ? "primary" : "secondary"} onClick={onOpenShare}>
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

      <div className="memo-no-print mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 v2:mt-4 v2:gap-x-5">
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

      <p className="mt-2 flex flex-wrap gap-x-2 text-sm text-muted-foreground v2:mt-4 v2:text-meta">
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
