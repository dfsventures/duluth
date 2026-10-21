"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Link2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDateOnly, type MemoView } from "@/components/admin/memos/types";

interface Props {
  memo: MemoView;
  linked: boolean;
  onEditDetails: () => void;
  onChangeCompany: () => void;
}

// Part 44 (WS146.3): a compact, collapsible Details box with one Edit entry. Stage lives in the header.
export function MemoDetails({ memo, linked, onEditDetails, onChangeCompany }: Props) {
  const parts: string[] = [];
  if (memo.source) parts.push(memo.source);
  if (memo.introDate) parts.push(`Intro ${formatDateOnly(memo.introDate)}`);
  if (memo.websiteUrl) parts.push("Website");
  if (memo.tags.length) parts.push(`${memo.tags.length} ${memo.tags.length === 1 ? "tag" : "tags"}`);
  if (memo.introCalls.length) parts.push(`${memo.introCalls.length} intro ${memo.introCalls.length === 1 ? "call" : "calls"}`);
  const filled = parts.length;
  const [open, setOpen] = useState(filled < 3);

  const edit = memo.canManage && memo.canEdit ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost">
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEditDetails}>
          <Pencil aria-hidden className="h-3.5 w-3.5" />
          Edit details
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onChangeCompany}>
          <Link2 aria-hidden className="h-3.5 w-3.5" />
          {linked ? "Change company" : "Link to company"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : memo.canEdit ? (
    <Button size="sm" variant="ghost" onClick={onEditDetails}>
      <Pencil className="h-4 w-4" />
      Edit
    </Button>
  ) : null;

  return (
    <Card className="mb-8">
      <div className="flex items-center justify-between gap-2">
        {filled > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="memo-details-body"
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="label">Details</span>
            {!open && <span className="truncate text-sm text-muted-foreground">{parts.join(" · ")}</span>}
            <ChevronDown aria-hidden className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </button>
        ) : (
          <h2 className="label">Details</h2>
        )}
        {edit && <div className="memo-no-print shrink-0">{edit}</div>}
      </div>
      {filled > 0 ? (
        <dl id="memo-details-body" className={cn("mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3", !open && "hidden print:grid")}>
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
          {memo.tags.length > 0 && <Detail label="Tags">{memo.tags.join(", ")}</Detail>}
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
        <p className="mt-3 text-sm text-muted-foreground">No details yet: source, tags, intro date, website, intro calls.</p>
      )}
    </Card>
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
