"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { OpenParam, SplitView } from "@/components/layout/split-view";
import { DetailPane, PaneCard, PaneChip, PaneDetails, PaneSection } from "@/components/layout/detail-pane";
import { DataTable, type DataTableColumn, type DataTableGroupBy } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { NameTile } from "@/components/ui/name-tile";
import { Button } from "@/components/ui/button";
import { crumbLabel, escapeBelongsToField, nextAfterRemoval, stepCursor } from "@/lib/split-view";
import { TONE_CLASSES } from "@/lib/status-tone";
import { inboxCard, paneActionKey, type InboxCounts, type InboxRow } from "@/lib/needs-you";
import { formatDate } from "@/lib/utils";

// PLAN-1, WS161: the "Needs you" inbox under the new look. The rows are the attention items
// (src/lib/attention.ts) as one-line list rows in four sticky groups; Enter or a click opens the
// item in the side pane (WS160). Remind and Dismiss use the page's own handlers, so the toasts,
// Undo and row fade are exactly what they were. Nothing here fetches.

export interface InboxAlert {
  id: string;
  message: string;
  firedAt: string;
  company: { id: string; name: string };
  metricDefinition: { name: string } | null;
}

export interface InboxOverdue {
  id: string;
  sector: string | null;
  lastReminderSentAt: string | null;
}

interface NeedsYouInboxProps {
  rows: InboxRow[];
  counts: InboxCounts;
  alerts: InboxAlert[];
  overdue: InboxOverdue[];
  remindedAt: Record<string, string>;
  reminding: Record<string, boolean>;
  onRemind: (companyId: string) => void;
  onDismiss: (alertId: string) => void;
  rowClassName: (id: string) => string | undefined;
}

// One fixed grouping: the group order is the order the rows arrive in (Waiting on you, On the
// board, Alerts, Behind on updates).
const GROUP_BY: DataTableGroupBy<InboxRow> = {
  fixed: "inbox",
  options: [{ key: "inbox", label: "Needs you", getGroup: (r) => r.group }],
};

const COLUMNS: DataTableColumn<InboxRow>[] = [
  {
    key: "item",
    header: "Item",
    title: (r) => (r.detail ? `${r.title}. ${r.detail}` : r.title),
    cell: (r) => (
      // One flex line that may shrink: on a phone the cell sits inside the row's link, and without
      // this wrapper the glyph slot and the mark each break onto their own line.
      <span className="flex min-w-0 items-center">
        {/* A 20px slot for the state glyph and one for the company mark, so every title starts on the same line. */}
        <span aria-hidden="true" className="mr-3 grid h-5 w-5 shrink-0 place-items-center">
          <StatusDot tone={r.tone} />
        </span>
        {r.company ? (
          <NameTile name={r.company} className="v2:mr-3 v2:h-5 v2:w-5 v2:text-[10px]" />
        ) : (
          <span aria-hidden="true" className="mr-3 h-5 w-5 shrink-0" />
        )}
        <span className="min-w-0 truncate">{r.title}</span>
        {/* The secondary sentence moves to the phone's second line (the Detail column below). */}
        {r.detail && <span className="ml-3 min-w-0 truncate text-muted-foreground max-md:hidden">{r.detail}</span>}
      </span>
    ),
  },
  { key: "kind", header: "Kind", mobile: "meta", dropBelow: 480, cell: (r) => r.kindLabel },
  {
    // Phone only: line 2 reads "Kind  Detail". Hidden in the desktop table, where the detail already
    // sits after the title.
    key: "detail",
    header: "Detail",
    mobile: "meta",
    hideable: false,
    className: "hidden",
    cell: (r) => (r.detail ? <span className="block truncate">{r.detail}</span> : null),
  },
  {
    key: "age",
    header: "Age",
    align: "num",
    mobile: "badge",
    title: (r) => r.age,
    cell: (r) => (
      // The age takes the colour of the row's dot: amber (up to 60 days) or red (over 60, or never updated).
      <span
        className={
          r.kind === "overdue"
            ? r.tone === "clay"
              ? "text-[color:var(--color-stuck)]"
              : r.tone === "amber"
                ? "text-[color:var(--color-warn)]"
                : undefined
            : undefined
        }
      >
        {r.age}
      </span>
    ),
  },
];

export function NeedsYouInbox(props: NeedsYouInboxProps) {
  const { rows, counts, alerts, overdue, remindedAt, reminding, onRemind, onDismiss, rowClassName } = props;
  const router = useRouter();
  // The list as shown, for the pane's previous / next and its position.
  const [visible, setVisible] = useState<InboxRow[]>([]);
  const keys = useMemo(() => visible.map((r) => r.id), [visible]);

  function renderPane(
    row: InboxRow,
    nav: { crumb: string; onPrev?: () => void; onNext?: () => void; onClose: () => void; dismiss: () => void }
  ) {
    const card = inboxCard(row, counts);
    const alert = row.alertId ? alerts.find((a) => a.id === row.alertId) : undefined;
    const company = row.kind === "overdue" ? overdue.find((c) => c.id === row.companyId) : undefined;
    const remindedTs = row.kind === "overdue" && row.companyId ? (remindedAt[row.companyId] ?? company?.lastReminderSentAt) : null;
    const open = (
      <Button variant={card.primary === "open" ? "primary" : "secondary"} onClick={() => router.push(row.href)}>
        {card.openLabel}
      </Button>
    );
    const actions =
      card.primary === "remind" && row.companyId ? (
        <>
          <Button kbd="R" loading={Boolean(reminding[row.companyId])} onClick={() => onRemind(row.companyId!)}>
            Send a reminder
          </Button>
          {open}
        </>
      ) : card.primary === "dismiss" ? (
        <>
          <Button kbd="D" onClick={nav.dismiss}>
            Dismiss alert
          </Button>
          {open}
        </>
      ) : (
        open
      );
    return (
      <DetailPane
        crumb={nav.crumb}
        title={row.title}
        mark={row.company ? <NameTile name={row.company} className="mr-0 v2:h-8 v2:w-8 v2:text-[13px]" /> : undefined}
        onPrev={nav.onPrev}
        onNext={nav.onNext}
        onClose={nav.onClose}
        expandHref={row.href}
        chips={
          <>
            <PaneChip className={TONE_CLASSES[row.tone].chip}>{row.kindLabel}</PaneChip>
            {row.kind === "alert" && alert && <PaneChip>Fired {formatDate(alert.firedAt)}</PaneChip>}
            {row.kind === "overdue" && row.detail && <PaneChip>{row.detail}</PaneChip>}
            {row.noFounder && <PaneChip>No founder yet</PaneChip>}
            {remindedTs && <PaneChip>Reminded {formatDate(remindedTs)}</PaneChip>}
          </>
        }
        card={
          <PaneCard heading={card.heading} actions={actions}>
            {card.text}
          </PaneCard>
        }
      >
        {row.kind === "alert" && alert && (
          <PaneSection title="Details">
            <PaneDetails
              rows={[
                { label: "Company", value: alert.company.name },
                { label: "Metric", value: alert.metricDefinition?.name ?? "—" },
                { label: "What happened", value: alert.message },
                { label: "Fired", value: formatDate(alert.firedAt) },
              ]}
            />
          </PaneSection>
        )}
        {row.kind === "overdue" && (
          <PaneSection title="Details">
            <PaneDetails
              rows={[
                { label: "Last update", value: row.days == null ? "None yet" : `${row.days} ${row.days === 1 ? "day" : "days"} ago` },
                { label: "Reminded", value: remindedTs ? formatDate(remindedTs) : "Not yet" },
                { label: "Sector", value: company?.sector ?? "—" },
              ]}
            />
          </PaneSection>
        )}
        {(row.kind === "approvals" || row.kind === "diligence" || row.kind === "board") && (
          <PaneSection title="Why you're seeing this">
            <p>
              {row.title}.{row.detail ? ` ${row.detail}` : ""}
            </p>
          </PaneSection>
        )}
      </DetailPane>
    );
  }

  return (
    <OpenParam fallback={<TableSkeleton rows={6} cols={3} />}>
      {(openId, setOpenId) => {
        const closePane = () => setOpenId(null);
        const step = (delta: 1 | -1) => {
          const to = stepCursor(keys, openId, delta);
          if (to) setOpenId(to);
        };
        const openRow = openId ? (rows.find((r) => r.id === openId) ?? null) : null;
        const at = openRow ? keys.indexOf(openRow.id) : -1;
        // Dismissing from the pane moves it on to the next row (or closes it on the last), as Approve does.
        const dismissOpen = () => {
          if (!openRow?.alertId) return;
          setOpenId(nextAfterRemoval(keys, openRow.id));
          onDismiss(openRow.alertId);
        };
        return (
          <>
            <PaneKeys row={openRow} onRemind={() => openRow?.companyId && onRemind(openRow.companyId)} onDismiss={dismissOpen} />
            <SplitView
              open={openId}
              onClose={closePane}
              paneLabel={openRow?.title}
              pane={
                openRow
                  ? renderPane(openRow, {
                      crumb: crumbLabel("Needs you", keys, openRow.id),
                      onPrev: at > 0 ? () => step(-1) : undefined,
                      onNext: at !== -1 && at < keys.length - 1 ? () => step(1) : undefined,
                      onClose: closePane,
                      dismiss: dismissOpen,
                    })
                  : null
              }
              list={
                <DataTable<InboxRow>
                  label="Needs you"
                  noun="item"
                  rows={rows}
                  rowKey={(r) => r.id}
                  rowHref={(r) => r.href}
                  onOpenRow={(r) => setOpenId(r.id)}
                  openKey={openId}
                  onVisibleRowsChange={setVisible}
                  rowClassName={(r) => rowClassName(r.id)}
                  columns={COLUMNS}
                  defaultSort={{ key: "item", dir: "asc" }}
                  groupBy={GROUP_BY}
                  hideHeader
                  empty={null}
                  actionsLabel="Row actions"
                  rowActions={(r) =>
                    r.kind === "overdue" && r.companyId ? (
                      r.noFounder ? (
                        <span className="px-2 text-xs text-muted-foreground">No founder in Molly</span>
                      ) : (
                        <Button variant="ghost" size="sm" loading={Boolean(reminding[r.companyId])} onClick={() => onRemind(r.companyId!)}>
                          <Bell className="h-3.5 w-3.5" />
                          Remind
                          <span className="sr-only"> {r.company}</span>
                        </Button>
                      )
                    ) : r.kind === "alert" && r.alertId ? (
                      <Button variant="ghost" size="sm" onClick={() => onDismiss(r.alertId!)}>
                        <X className="h-3.5 w-3.5" />
                        Dismiss
                        <span className="sr-only">: {r.title}</span>
                      </Button>
                    ) : null
                  }
                />
              }
            />
          </>
        );
      }}
    </OpenParam>
  );
}

/** With the pane open: R sends the reminder, D dismisses the alert (the letters on the pane's buttons). */
function PaneKeys({ row, onRemind, onDismiss }: { row: InboxRow | null; onRemind: () => void; onDismiss: () => void }) {
  useEffect(() => {
    if (!row) return;
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (escapeBelongsToField(e.target as HTMLElement | null)) return;
      const action = paneActionKey(row, e.key);
      if (!action) return;
      e.preventDefault();
      if (action === "remind") onRemind();
      else onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [row, onRemind, onDismiss]);
  return null;
}
