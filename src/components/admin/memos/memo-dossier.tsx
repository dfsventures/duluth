"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, ChevronDown, ExternalLink, Link2, Lock, MoreHorizontal, Pencil, Printer, Share2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, type Tone } from "@/lib/status-tone";
import { COLUMN_TONE, sameName } from "@/lib/memo-board";
import { MEMO_DECISIONS, MEMO_DECISION_LABELS, MEMO_DECISION_NOUN, MEMO_STATUSES, MEMO_STATUS_LABELS, MEMO_STATUS_NOUN } from "@/lib/memos";
import { SectionCard } from "@/components/admin/memos/section-card";
import { DossierContents, JumpTo, useActiveSection } from "@/components/admin/memos/dossier-nav";
import { relativeAge } from "@/components/admin/memos/dossier-utils";
import { companyIconNode, companyLineNode } from "@/components/admin/memos/memo-company-bits";
import { useMemoControls } from "@/components/admin/memos/use-memo-controls";
import { formatDateOnly, ownerLabel, type MemoDecision, type MemoStatus, type MemoView } from "@/components/admin/memos/types";

const STATUS_TONE: Record<MemoStatus, Tone> = { DRAFT: "stone", IN_REVIEW: "amber", FINAL: "sage" };

interface Props {
  memo: MemoView;
  linked: boolean;
  /** The "X is now in Molly. Link it?" banner, or null. */
  banner: ReactNode;
  onOpenShare: () => void;
  onArchive: () => void;
  onChanged: () => void;
  onEditDetails: () => void;
  onChangeCompany: () => void;
}

/**
 * The memo page in the new look, direction B "Dossier" (B-175): a 720px reading column with a
 * sticky deal panel on the right (Stage, Memo status, Access, Source, Intro, Website, Tags, Intro
 * calls, then the contents). Folds are local and not remembered. Geometry and the hover/fold rules
 * live in globals.css under `.memo-dossier`.
 */
export function MemoDossier({ memo, linked, banner, onOpenShare, onArchive, onChanged, onEditDetails, onChangeCompany }: Props) {
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const { stage, savingStage, savingStatus, changeStage, changeStatus } = useMemoControls(memo, onChanged);

  const navSections = memo.sections.map((s) => ({ key: s.key, title: s.title, hidden: !s.includeInShare }));
  const { active, jump } = useActiveSection(navSections, (key) => setFolded((f) => (f[key] ? { ...f, [key]: false } : f)));

  const ref = memo.companyRef;
  const sameAsTitle = ref.kind !== "none" && sameName(ref.name, memo.title);
  const companyLine = companyLineNode(ref);
  const companyIcon = companyIconNode(ref);

  const stageLabel = stage.decision ? MEMO_DECISION_LABELS[stage.decision] : "Unsorted";
  const stageTone = COLUMN_TONE[stage.decision ?? "NONE"];
  const team = memo.visibility === "TEAM";
  const updated = new Date(memo.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  // Facts that exist today. Round and Ask will be two more rows here once the memo has fields for them.
  const rows: { label: string; value: ReactNode }[] = [];
  rows.push({
    label: MEMO_DECISION_NOUN,
    value: (
      <ChipMenu
        label={MEMO_DECISION_NOUN}
        text={stageLabel}
        tone={stageTone}
        canEdit={memo.canEdit}
        disabled={savingStage}
        current={stage.decision ?? ""}
        options={[{ value: "", label: "Unsorted" }, ...MEMO_DECISIONS.map((d) => ({ value: d, label: MEMO_DECISION_LABELS[d] }))]}
        onSelect={(v) => void changeStage((v || null) as MemoDecision | null)}
      />
    ),
  });
  rows.push({
    label: MEMO_STATUS_NOUN,
    value: (
      <ChipMenu
        label={MEMO_STATUS_NOUN}
        text={MEMO_STATUS_LABELS[memo.status]}
        tone={STATUS_TONE[memo.status]}
        canEdit={memo.canEdit}
        disabled={savingStatus}
        current={memo.status}
        options={MEMO_STATUSES.map((s) => ({ value: s, label: MEMO_STATUS_LABELS[s] }))}
        onSelect={(v) => void changeStatus(v as MemoStatus)}
      />
    ),
  });
  rows.push({
    label: "Access",
    value: (
      <button
        type="button"
        onClick={onOpenShare}
        className="inline-flex h-6 items-center gap-1.5 rounded-ctl text-row text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {team ? <Users aria-hidden className="h-3.5 w-3.5" /> : <Lock aria-hidden className="h-3.5 w-3.5" />}
        {team ? "Shared with team" : "Private"}
      </button>
    ),
  });
  if (memo.source) rows.push({ label: "Source", value: memo.source });
  if (memo.introDate)
    rows.push({
      label: "Intro",
      value: (
        <>
          {formatDateOnly(memo.introDate)} <span className="text-muted-foreground">· {relativeAge(memo.introDate)}</span>
        </>
      ),
    });
  if (memo.websiteUrl)
    rows.push({
      label: "Website",
      value: (
        <a href={memo.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-4 hover:underline">
          <span className="truncate">{memo.websiteUrl.replace(/^https?:\/\//, "")}</span>
          <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
        </a>
      ),
    });
  if (memo.tags.length)
    rows.push({
      label: "Tags",
      value: (
        <span className="flex flex-wrap gap-1">
          {memo.tags.map((t) => (
            <span key={t} className="inline-flex h-6 items-center rounded-ctl bg-muted px-2.5 text-meta text-secondary">
              {t}
            </span>
          ))}
        </span>
      ),
    });

  const calls = memo.introCalls.length ? (
    <div className="mt-3">
      <h3 className="mb-1 text-meta font-medium text-muted-foreground">Intro calls</h3>
      <ul className="space-y-1 text-body-sm">
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
    </div>
  ) : null;

  return (
    // The page is AppShell width="detail": the shared page frame gives the padding and the width.
    <div className="memo-dossier">
      <div className="memo-no-print mb-6 flex h-9 items-center gap-2">
        <Link
          href="/admin/memos"
          className="inline-flex h-9 items-center gap-1.5 rounded-ctl pr-2 text-meta text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Memos
        </Link>
        <span className="flex-1" />
        <Button variant="primary" onClick={onOpenShare}>
          <Share2 className="h-4 w-4" />
          Share
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" aria-label="More actions">
              <MoreHorizontal aria-hidden className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {memo.canEdit && (
              <DropdownMenuItem onSelect={onEditDetails}>
                <Pencil aria-hidden className="h-3.5 w-3.5" />
                Edit details
              </DropdownMenuItem>
            )}
            {memo.canManage && memo.canEdit && (
              <DropdownMenuItem onSelect={onChangeCompany}>
                <Link2 aria-hidden className="h-3.5 w-3.5" />
                {linked ? "Change company" : "Link to company"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => window.print()}>
              <Printer aria-hidden className="h-3.5 w-3.5" />
              Print or save as PDF
            </DropdownMenuItem>
            {memo.canManage && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onArchive} className="text-destructive">
                  <Archive aria-hidden className="h-3.5 w-3.5" />
                  Archive memo
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <header>
        <h1 className="flex items-center gap-2 font-sans text-title font-semibold text-foreground">
          <span className="min-w-0 break-words">{memo.title}</span>
          {sameAsTitle && <span className="memo-no-print">{companyIcon}</span>}
        </h1>
        {!sameAsTitle && companyLine && <p className="mt-1 text-sm">{companyLine}</p>}
        {/* The Stage / Memo status line prints; the controls in the panel do not. */}
        <p className="mt-3 hidden text-sm print:block">
          {`${MEMO_DECISION_NOUN}: ${stageLabel} · ${MEMO_STATUS_NOUN}: ${MEMO_STATUS_LABELS[memo.status]}`}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-2 text-meta text-muted-foreground">
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

      {banner && <div className="mt-4">{banner}</div>}

      {/* Print shows the facts as plain lines, as the old Details box did. */}
      <dl className="mt-4 hidden gap-x-6 gap-y-1 text-sm print:grid print:grid-cols-[110px_1fr]">
        {memo.source && (
          <>
            <dt>Source</dt>
            <dd>{memo.source}</dd>
          </>
        )}
        {memo.introDate && (
          <>
            <dt>Intro date</dt>
            <dd>{formatDateOnly(memo.introDate)}</dd>
          </>
        )}
        {memo.websiteUrl && (
          <>
            <dt>Website</dt>
            <dd>{memo.websiteUrl.replace(/^https?:\/\//, "")}</dd>
          </>
        )}
        {memo.tags.length > 0 && (
          <>
            <dt>Tags</dt>
            <dd>{memo.tags.join(", ")}</dd>
          </>
        )}
        {memo.introCalls.length > 0 && (
          <>
            <dt>Intro calls</dt>
            <dd>
              {memo.introCalls.map((c, i) => (
                <span key={i} className="block">
                  {c.label}
                  {c.date && ` · ${formatDateOnly(c.date)}`}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>

      <div className="memo-dossier-grid mt-6">
        <aside aria-label="Deal facts" className="memo-aside memo-no-print">
          <div className="rounded-lg bg-muted/60 p-4 v2:bg-card">
            <dl className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-row">
              {rows.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="pt-0.5 text-meta text-muted-foreground">{r.label}</dt>
                  <dd className="min-w-0 break-words">{r.value}</dd>
                </div>
              ))}
            </dl>
            {calls}
          </div>
          <div className="memo-contents mt-6">
            <DossierContents sections={navSections} active={active} onJump={jump} />
          </div>
        </aside>

        <div className="memo-reading min-w-0">
          <JumpTo sections={navSections} active={active} onJump={jump} />
          <div className="space-y-8">
            {memo.sections.map((s) => (
              <SectionCard
                key={s.key}
                memoId={memo.id}
                section={s}
                canEdit={memo.canEdit}
                canManage={memo.canManage}
                onChanged={onChanged}
                onOpenShare={onOpenShare}
                folded={!!folded[s.key]}
                onToggleFold={() => setFolded((f) => ({ ...f, [s.key]: !f[s.key] }))}
              />
            ))}
            {memo.canManage && (
              <div className="memo-no-print pt-4">
                <Button variant="ghost" onClick={onArchive}>
                  <Archive className="h-4 w-4" />
                  Archive memo
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A coloured chip that opens a menu (Stage, Memo status). Read-only people see the chip without the menu. */
function ChipMenu({
  label,
  text,
  tone,
  canEdit,
  disabled,
  current,
  options,
  onSelect,
}: {
  label: string;
  text: string;
  tone: Tone;
  canEdit: boolean;
  disabled: boolean;
  current: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
}) {
  const chip = "inline-flex h-6 items-center gap-1.5 rounded-ctl px-2.5 text-body-sm font-medium " + TONE_CLASSES[tone].chip;
  if (!canEdit) return <span className={chip}>{text}</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${text}`}
          disabled={disabled}
          className={cn(chip, "pr-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60")}
        >
          {text}
          <ChevronDown aria-hidden className="h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onSelect(o.value)} className={o.value === current ? "font-semibold" : undefined}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
