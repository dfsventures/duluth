"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Download, Eye, FileText, Globe, Pencil, Trash2, Calendar, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { PageHeader, StatusItems } from "@/components/layout/page-header";
import { DetailMenu } from "@/components/layout/page-header-menu";
import { DOC_TYPES } from "@/lib/constants";
import { isInlineViewable } from "@/lib/documents";
import { formatDate, formatPeriod } from "@/lib/utils";
import { sanitizeUpdateHtml } from "@/lib/update-html";
import { metricChipLabel } from "@/lib/metric-origin";

export interface RecordFigure {
  id: string;
  value: number;
  date: string;
  via?: string | null;
  origin?: string | null;
  quote?: string | null;
  metricDefinition: { id: string; name: string; unit: string | null };
}

export interface RecordDocument {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  docType: string | null;
}

export interface RecordUpdate {
  id: string;
  title: string;
  period: string;
  status: "DRAFT" | "SENT";
  body: string;
  sentAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
  companyId: string;
  company?: { id: string; name: string } | null;
  source?: "FOUNDER" | "EMAIL_VIA_MARGE";
  sourceRef?: { permalink?: string } | null;
  createdBy?: { id: string; name: string | null } | null;
  metricValues?: RecordFigure[];
  documents?: RecordDocument[];
}

interface Props {
  update: RecordUpdate;
  isAdmin: boolean;
  canEdit: boolean;
  deleting: boolean;
  sending: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onToggleSchedule: () => void;
  onCancelSchedule: () => void;
  onRemoveFiled: () => void;
  onDeleteDraft: () => void;
  onDownloadDoc: (id: string, name: string) => void;
  /** Quiet notices under the header: scheduled line, publish confirmation, schedule form. */
  notices: ReactNode;
  /** Comments section (it owns a form, so the page supplies it). */
  comments: ReactNode;
}

/**
 * The single update page in the new look (B-133): header bar (back, the one primary, ⋯), then a 720px
 * column (body, figures, attachments, comments) and a sticky 296px panel of the update's properties.
 * Geometry lives in globals.css under `.up-dossier`. Under 1040px the panel sits under the title.
 * Only admins with the new look on get this; everyone else keeps the original page.
 */
export function UpdateRecord({
  update,
  isAdmin,
  canEdit,
  deleting,
  sending,
  onEdit,
  onPublish,
  onToggleSchedule,
  onCancelSchedule,
  onRemoveFiled,
  onDeleteDraft,
  onDownloadDoc,
  notices,
  comments,
}: Props) {
  const draft = update.status === "DRAFT";
  const filed = update.source === "EMAIL_VIA_MARGE";
  const canRemoveFiled = isAdmin && update.status === "SENT" && filed;
  const permalink = isAdmin && update.sourceRef?.permalink && /^https:\/\//.test(update.sourceRef.permalink) ? update.sourceRef.permalink : null;
  const figures = update.metricValues ?? [];
  const docs = update.documents ?? [];
  const downloadHref = `/updates/${update.id}/download`;

  // One primary: Publish for a draft, Edit when it can be edited, otherwise the PDF.
  const primary: "publish" | "edit" | "pdf" = draft ? "publish" : canEdit ? "edit" : "pdf";

  const statusText =
    update.status === "SENT" ? "Published" : update.scheduledFor ? `Scheduled · ${formatDate(update.scheduledFor)}` : "Draft";

  const rows: { label: string; value: ReactNode }[] = [];
  const companyName = update.company?.name;
  if (companyName)
    rows.push({
      label: "Company",
      value: (
        <Link href={`/admin/companies/${update.companyId}`} className="text-primary underline-offset-4 hover:underline">
          {companyName}
        </Link>
      ),
    });
  rows.push({ label: "Period", value: formatPeriod(update.period) });
  rows.push({ label: "Status", value: <Badge variant={update.status === "SENT" ? "success" : "warning"}>{statusText}</Badge> });
  if (update.sentAt) rows.push({ label: "Sent", value: formatDate(update.sentAt) });
  rows.push({ label: "Created", value: formatDate(update.createdAt) });
  if (update.createdBy?.name) rows.push({ label: "Added by", value: update.createdBy.name });
  rows.push({ label: "Source", value: filed ? "Email, via Marge" : "Founder" });

  const primaryButton =
    primary === "publish" ? (
      <Button variant="primary" disabled={sending || deleting} onClick={onPublish}>
        <Globe className="h-4 w-4" />
        Publish
      </Button>
    ) : primary === "edit" ? (
      <Button variant="primary" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
        Edit
      </Button>
    ) : primary === "pdf" ? (
      <Link href={downloadHref}>
        <Button variant="primary">
          <Download className="h-4 w-4" />
          Download PDF
        </Button>
      </Link>
    ) : null;

  const menu = (
    <DetailMenu>
      {primary !== "edit" && canEdit && (
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil aria-hidden className="h-3.5 w-3.5" />
          Edit
        </DropdownMenuItem>
      )}
      {draft && !update.scheduledFor && (
        <DropdownMenuItem onSelect={onToggleSchedule}>
          <Calendar aria-hidden className="h-3.5 w-3.5" />
          Schedule for later
        </DropdownMenuItem>
      )}
      {draft && update.scheduledFor && (
        <DropdownMenuItem onSelect={onCancelSchedule}>
          <X aria-hidden className="h-3.5 w-3.5" />
          Cancel schedule
        </DropdownMenuItem>
      )}
      {primary !== "pdf" && (
        <DropdownMenuItem asChild>
          <Link href={downloadHref}>
            <Download aria-hidden className="h-3.5 w-3.5" />
            Download PDF
          </Link>
        </DropdownMenuItem>
      )}
      {(draft || canRemoveFiled) && <DropdownMenuSeparator />}
      {draft && (
        <DropdownMenuItem onSelect={onDeleteDraft} disabled={deleting} className="text-destructive">
          <Trash2 aria-hidden className="h-3.5 w-3.5" />
          Delete draft
        </DropdownMenuItem>
      )}
      {canRemoveFiled && (
        <DropdownMenuItem onSelect={onRemoveFiled} disabled={deleting} className="text-destructive">
          <Trash2 aria-hidden className="h-3.5 w-3.5" />
          Remove update
        </DropdownMenuItem>
      )}
    </DetailMenu>
  );

  return (
    // The page is AppShell width="detail": the shared page frame gives the padding and the width.
    <div className="up-dossier">
      {/* Page types v1, Detail: back above the title, the actions on the title row, a status line under it. */}
      <PageHeader
        type="detail"
        // Admin view only, so back goes to the admin list; /updates is the founder's own list.
        back={{ href: "/admin/updates", label: "Updates" }}
        title={update.title}
        status={
          filed ? (
            <StatusItems
              items={[
                `From email, added by ${update.createdBy?.name ?? "a teammate"} via Marge`,
                permalink ? (
                  <a href={permalink} target="_blank" rel="noopener noreferrer" className="underline">
                    Open in Slack
                  </a>
                ) : null,
              ]}
            />
          ) : undefined
        }
        condensedAction={primaryButton}
        action={
          <div className="flex items-center gap-2">
            {primaryButton}
            {menu}
          </div>
        }
      />

      {notices && <div className="mb-6 space-y-3">{notices}</div>}

      <div className="up-dossier-grid">
        <aside aria-label="Update details" className="up-aside">
          <div className="rounded-lg bg-muted/60 p-4 v2:bg-card">
            <dl className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-row">
              {rows.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="pt-0.5 text-meta text-muted-foreground">{r.label}</dt>
                  <dd className="min-w-0 break-words text-row text-foreground">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>

        <div className="up-main min-w-0 space-y-8">
          <section aria-label="Update content">
            {update.body ? (
              <div
                className="prose prose-sm max-w-none text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeUpdateHtml(update.body) }}
              />
            ) : (
              <span className="text-sm italic text-muted-foreground">No content provided.</span>
            )}
          </section>

          {figures.length > 0 && (
            <section aria-labelledby="up-figures">
              <h2 id="up-figures" className="mb-2 font-sans text-base font-semibold text-foreground">
                Metrics
              </h2>
              <ul>
                {figures.map((mv) => {
                  const chip = isAdmin ? metricChipLabel(mv) : null;
                  return (
                    <li key={mv.id} className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-border py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_96px]">
                      <div className="min-w-0 text-row font-medium text-foreground">
                        {mv.metricDefinition.name}
                        {chip && (
                          <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">{chip}</span>
                        )}
                        {chip && mv.quote && (
                          <p className="mt-0.5 line-clamp-2 max-w-prose text-xs font-normal leading-snug text-muted-foreground" title={mv.quote}>
                            “{mv.quote}”
                          </p>
                        )}
                      </div>
                      <div className="text-row text-foreground">
                        {mv.value}
                        {mv.metricDefinition.unit ? ` ${mv.metricDefinition.unit}` : ""}
                      </div>
                      <div className="hidden text-meta text-muted-foreground sm:block">{formatDate(mv.date)}</div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {docs.length > 0 && (
            <section aria-labelledby="up-files">
              <h2 id="up-files" className="mb-2 font-sans text-base font-semibold text-foreground">
                Attachments
              </h2>
              <ul>
                {docs.map((doc) => (
                  <li key={doc.id} className="up-item flex min-h-11 items-center gap-3 border-b border-border py-2 last:border-0">
                    <FileText aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-row font-medium">{doc.name}</p>
                    </div>
                    {doc.docType && <Badge variant="neutral">{DOC_TYPES.find((t) => t.value === doc.docType)?.label ?? doc.docType}</Badge>}
                    {doc.size ? <span className="text-meta text-muted-foreground">{(doc.size / 1024).toFixed(1)} KB</span> : null}
                    <span className="up-act flex items-center gap-2">
                      {isInlineViewable(doc.mimeType) && (
                        <a
                          href={`/api/documents/${doc.id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => onDownloadDoc(doc.id, doc.name)}
                        className="text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {comments}
        </div>
      </div>
    </div>
  );
}
