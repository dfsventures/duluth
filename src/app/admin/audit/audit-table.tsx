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

function targetText(r: AuditRowData): string {
  return r.targetType ? `${r.targetType}${r.targetId ? ` · ${r.targetId}` : ""}` : "—";
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
    sortValue: (r) => ACTION_LABELS[r.action] ?? r.action,
    mobile: "meta",
    title: (r) => r.action,
    cell: (r) => ACTION_LABELS[r.action] ?? r.action,
  },
  { key: "target", header: "Target", sortValue: (r) => r.targetType, mobile: "meta", cell: (r) => targetText(r) },
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
