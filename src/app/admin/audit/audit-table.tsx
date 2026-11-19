"use client";

// New look (PLAN-1, WS170): the Audit Log as one-line rows in the shared table. The page stays a
// Server Component (it keeps its query and its five counts); it passes the rows here as plain data
// (dates as ISO strings), plus its own old markup, which `AuditLook` shows unless the new look is on.
// DataTable's columns are functions, which a Server Component cannot pass down, hence this file.
//
// Filters stay on the server: the chips are a FilterBar whose picks navigate to ?filter=<key>, so the
// counts and the 100-row window are exactly today's. DataTable gets no chips and no search (a search
// box would suggest it searches every event, not the last 100) and keeps its own state out of the URL
// (urlState={false}) so it cannot fight ?filter=.

import { useRouter } from "next/navigation";
import { ScrollText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useNewLook } from "@/lib/use-new-look";
import { relativeTime } from "@/lib/relative-time";

export interface AuditRowData {
  id: string;
  createdAt: string; // ISO
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
}

export interface AuditFilterDef {
  key: string;
  label: string;
}

// Sign-in events are recorded by src/lib/signin-audit.ts. Other actions are free strings and shown
// as-is; only these get a friendly label (same map as the old markup in page.tsx).
const ACTION_LABELS: Record<string, string> = {
  SIGN_IN_SUCCEEDED: "Sign-in succeeded",
  SIGN_IN_FAILED: "Sign-in failed",
};

// New look only (the old markup keeps raw codes). Words match what the screens call things
// (docs/design/admin-audit-v1-copy.md, Audit Log overrides).
const ACTION_OVERRIDES: Record<string, string> = {
  MEMO_DECISION_CHANGED: "Memo stage changed",
  BROADCAST_PUBLISHED: "Broadcast sent",
  BROADCAST_RETRIED: "Broadcast retried for unsent contacts",
  BOARD_CARD_CREATED: "Board item created",
  BOARD_CARD_MOVED: "Board item moved",
  BOARD_CARD_UPDATED: "Board item updated",
  BOARD_CARD_LINK_ADDED: "Board item proof link added",
  BOARD_CARD_LINK_REMOVED: "Board item proof link removed",
  SETUP_QUEUE_DISMISSED: "Account dismissed from awaiting setup",
  SETUP_QUEUE_UNDISMISSED: "Account restored to awaiting setup",
  SETUP_QUEUE_USER_DELETED: "Account deleted (awaiting setup)",
  MARK_CREATED: "Valuation added",
  MARK_DELETED: "Valuation deleted",
  ROUND_CREATED: "Financing round created",
  ROUND_UPDATED: "Financing round updated",
  ROUND_DELETED: "Financing round deleted",
  MARGE_READ: "Marge read data",
  MARGE_DENIED: "Marge request denied",
  DOCUMENT_ORPHAN_DELETED: "Orphaned document deleted",
  PORTCO_CONTACT_ADDED: "Contact added",
  PORTCO_CONTACT_UPDATED: "Contact updated",
  PORTCO_CONTACT_REMOVED: "Contact removed",
  PORTCO_CONTACTS_IMPORTED: "Contacts imported",
  MEMBER_ADDED: "Company member added",
  COMPANY_DILIGENCE_PROMOTED: "Company moved out of diligence",
  PORTCO_LINKED: "Company linked to ledger",
  PORTCO_UNLINKED: "Company unlinked from ledger",
  DEALS_LINKED_TO_SHEET: "Deals linked to Google Sheet",
};

const ACRONYMS = new Set(["lp", "csv", "id", "url"]);

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncateValue(value: string, max = 40): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function metadataEntries(metadata: unknown): [string, unknown][] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  return Object.entries(metadata as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined);
}

// New look (audit #41): actions read as sentences. Any code gets sentence-cased (FUND_UPDATED → "Fund
// updated"), so a code added later reads fine without touching this file; the raw code is the cell's tooltip.
export function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (ACTION_OVERRIDES[action]) return ACTION_OVERRIDES[action];
  const words = action
    .toLowerCase()
    .replace(/\bportco\b/g, "portfolio company")
    .replace(/_/g, " ")
    .trim()
    .split(" ")
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w))
    .join(" ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : action;
}

// "FundReport" → "Fund report".
function typeLabel(t: string): string {
  const words = t.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// The name the event itself recorded, when it recorded one (no extra lookups: the page keeps its one query).
function targetName(r: AuditRowData): string | null {
  const m = r.metadata;
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const bag = m as Record<string, unknown>;
  for (const k of ["name", "title", "displayName", "email", "label", "slug"]) {
    const v = bag[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function targetText(r: AuditRowData): string {
  if (!r.targetType) return "—";
  const name = targetName(r);
  return name ? `${typeLabel(r.targetType)} · ${name}` : typeLabel(r.targetType);
}

function targetTitle(r: AuditRowData): string | null {
  return r.targetType ? `${r.targetType}${r.targetId ? ` · ${r.targetId}` : ""}` : null;
}

// A native <details>, as in the old look: one line closed; open, the row grows (see the WS170 rule in
// globals.css) and shows the full JSON.
function DetailsCell({ metadata }: { metadata: unknown }) {
  const entries = metadataEntries(metadata);
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <details>
      <summary className="cursor-pointer list-none truncate [&::-webkit-details-marker]:hidden">
        {entries.map(([key, value], i) => (
          <span key={key}>
            {i > 0 && <span className="mx-1 text-muted-foreground">·</span>}
            <span className="font-medium text-secondary">{key}:</span>
            <span className="ml-1">{truncateValue(typeof value === "object" ? JSON.stringify(value) : String(value))}</span>
          </span>
        ))}
      </summary>
      <pre className="mt-1.5 max-w-xl whitespace-pre-wrap break-words rounded-sm bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </details>
  );
}

const auditColumns: DataTableColumn<AuditRowData>[] = [
  {
    key: "time",
    header: "Time",
    sortValue: (r) => new Date(r.createdAt).getTime(),
    firstDir: "desc",
    title: (r) => formatTimestamp(r.createdAt),
    cell: (r) => <time dateTime={r.createdAt}>{relativeTime(r.createdAt)}</time>,
  },
  { key: "actor", header: "Actor", sortValue: (r) => r.actorEmail, mobile: "meta", cell: (r) => r.actorEmail },
  {
    key: "action",
    header: "Action",
    sortValue: (r) => actionLabel(r.action),
    mobile: "meta",
    title: (r) => r.action,
    cell: (r) => actionLabel(r.action),
  },
  { key: "target", header: "Target", sortValue: (r) => r.targetType, mobile: "meta", title: targetTitle, cell: (r) => targetText(r) },
  {
    key: "details",
    header: "Details",
    mobile: "meta",
    className: "[--cell-max:520px]",
    exportValue: (r) => JSON.stringify(r.metadata ?? null),
    cell: (r) => <DetailsCell metadata={r.metadata} />,
  },
];

/**
 * Shows `oldLook` (the page's existing markup, rendered on the server) unless the new look is on,
 * in which case it shows the shared table. The first render is always the old look, so hydration matches.
 */
export function AuditLook({
  oldLook,
  rows,
  counts,
  filters,
  filter,
}: {
  oldLook: React.ReactNode;
  rows: AuditRowData[];
  counts: Record<string, number>;
  filters: readonly AuditFilterDef[];
  filter: string;
}) {
  const router = useRouter();
  const newLook = useNewLook();
  if (!newLook) return <>{oldLook}</>;

  const go = (key: string) => router.push(key === "all" ? "/admin/audit" : `/admin/audit?filter=${key}`);
  const chips = filters
    .filter((f) => f.key !== "all")
    .map((f) => ({ key: f.key, label: f.label, set: filter === f.key, count: counts[f.key] ?? 0 }));

  return (
    <>
      {/* Outside the table's box, so the bar sets the same zero side padding the table has. */}
      <div className="[--row-pad:0px]">
        <FilterBar
          label="Filter audit log"
          chips={chips}
          onOpen={go}
          onRemove={() => go("all")}
          onClearAll={() => go("all")}
          showClear={filter !== "all"}
          trailing={
            <span className="num whitespace-nowrap text-muted-foreground">
              {(counts[filter] ?? 0).toLocaleString()} {filter === "all" ? "events" : "matching"}
            </span>
          }
        />
      </div>
      <DataTable<AuditRowData>
        label="Audit log"
        noun="event"
        rows={rows}
        rowKey={(r) => r.id}
        columns={auditColumns}
        defaultSort={{ key: "time", dir: "desc" }}
        density="compact"
        urlState={false}
        minWidth={880}
        empty={
          <EmptyState
            icon={<ScrollText className="h-8 w-8" />}
            title="No matching events"
            description="Actions like approvals, deletions, and setting changes will appear here."
          />
        }
      />
    </>
  );
}
