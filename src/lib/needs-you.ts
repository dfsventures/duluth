// PLAN-1, WS161: the pure logic behind the "Needs you" inbox (the admin home under the new look).
// `buildAttention` (src/lib/attention.ts) still makes the items and their order; this only groups
// them, adds the right-hand words, and says what the side pane's action card reads. No React, so it
// is unit-tested (src/lib/__tests__/needs-you.test.ts). Words are from docs/design/redesign-v1-copy.md
// sections 2 and 6; the one card the copy file has no sentence for (the signups queue) is marked.

import { companyNextAction } from "./company-pane";
import type { AttentionItem, AttentionKind } from "./attention";

export type InboxGroupId = "waiting" | "board" | "alerts" | "behind";

export interface InboxGroup {
  id: InboxGroupId;
  label: string;
}

/** Group order is the order they show in. */
export const INBOX_GROUPS: readonly InboxGroup[] = [
  { id: "waiting", label: "Waiting on you" },
  { id: "board", label: "On the board" },
  { id: "alerts", label: "Alerts" },
  { id: "behind", label: "Behind on updates" },
];

const GROUP_OF_KIND: Record<AttentionKind, InboxGroupId> = {
  approvals: "waiting",
  diligence: "waiting",
  board: "board",
  alert: "alerts",
  overdue: "behind",
};

// The kind column (copy file section 2). "Overdue" is never said to a person.
const KIND_LABEL: Record<AttentionKind, string> = {
  approvals: "Approvals",
  diligence: "Diligence",
  board: "Team Board",
  alert: "Metric alert",
  overdue: "Behind",
};

export function inboxGroupOf(kind: AttentionKind): InboxGroup {
  const id = GROUP_OF_KIND[kind];
  return INBOX_GROUPS.find((g) => g.id === id)!;
}

export function kindLabel(kind: AttentionKind): string {
  return KIND_LABEL[kind];
}

/** "Today", "1d", "12d". Empty when there is no age to show. */
export function ageLabel(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days) || days < 0) return "";
  const n = Math.floor(days);
  return n === 0 ? "Today" : `${n}d`;
}

function daysSince(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

export interface InboxRow extends AttentionItem {
  group: InboxGroup;
  kindLabel: string;
  /** "12d". Blank for the queue rows, which have no single date. */
  age: string;
  /** Days since the last update (overdue rows), for the age colour and the pane. */
  days: number | null;
  /** Alert rows: the alert's own id (the item id without its prefix). */
  alertId?: string;
  /** The company's name, for the mark before the title (alert and behind rows). */
  company?: string;
  /** Behind-on-updates rows where nobody can be reminded (no founder in Molly). */
  noFounder: boolean;
}

export interface InboxContext {
  alerts: readonly { id: string; firedAt: string; company: { name: string } }[];
  overdue: readonly { id: string; name: string; daysSinceUpdate: number | null; hasFounder?: boolean }[];
  now?: number;
}

/** The attention items, each with its group, kind words and age. The order is untouched. */
export function buildInboxRows(items: readonly AttentionItem[], ctx: InboxContext): InboxRow[] {
  const now = ctx.now ?? Date.now();
  return items.map((item) => {
    const base = { ...item, group: inboxGroupOf(item.kind), kindLabel: kindLabel(item.kind) };
    if (item.kind === "alert") {
      const alertId = item.id.replace(/^alert:/, "");
      const alert = ctx.alerts.find((a) => a.id === alertId);
      const days = alert ? daysSince(alert.firedAt, now) : null;
      return { ...base, age: ageLabel(days), days, alertId, company: alert?.company.name, noFounder: false };
    }
    if (item.kind === "overdue") {
      const o = ctx.overdue.find((c) => c.id === item.companyId);
      const days = o?.daysSinceUpdate ?? null;
      return {
        ...base,
        age: days == null ? "Never" : ageLabel(days),
        days,
        company: o?.name ?? item.title,
        noFounder: o?.hasFounder === false,
      };
    }
    return { ...base, age: "", days: null, noFounder: false };
  });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export interface InboxCard {
  heading: string;
  text: string;
  /** What the primary button does. */
  primary: "open" | "remind" | "dismiss";
  /** The primary's label when it opens a page; the other buttons have fixed words. */
  openLabel: string;
}

export interface InboxCounts {
  approvals: number;
  diligence: number;
  board: number;
}

/** What the pane's action card says for a row (copy file section 6). */
export function inboxCard(row: InboxRow, counts: InboxCounts): InboxCard {
  switch (row.kind) {
    case "approvals":
      // New wording: the copy file has per-signup cards only, and this row is the whole queue.
      return {
        heading: "Review the signups",
        text: `${plural(counts.approvals, "signup is", "signups are")} waiting. Approve, link or reject each one on Approvals.`,
        primary: "open",
        openLabel: "Open approvals",
      };
    case "diligence":
      return {
        heading: "Start with the oldest",
        text: `${plural(counts.diligence, "company", "companies")} finished ${counts.diligence === 1 ? "its" : "their"} diligence answers.`,
        primary: "open",
        openLabel: "Open diligence",
      };
    case "board":
      return {
        heading: "Match the name",
        text: `Molly couldn't match a name or project on ${plural(counts.board, "item", "items")}.`,
        primary: "open",
        openLabel: "Open the board",
      };
    case "alert":
      return {
        heading: "Check the figure",
        text: "If this is expected, dismiss the alert.",
        primary: "dismiss",
        openLabel: "Open company",
      };
    case "overdue": {
      const next = companyNextAction({ cadence: "behind", daysSince: row.days, hasFounder: !row.noFounder });
      return { heading: next.heading, text: next.text, primary: next.primary === "remind" ? "remind" : "open", openLabel: "Open company" };
    }
  }
}

/** Which letter does what in the open pane: R sends the reminder, D dismisses the alert. */
export function paneActionKey(row: InboxRow | null, key: string): "remind" | "dismiss" | null {
  if (!row) return null;
  const k = key.toLowerCase();
  if (k === "r" && row.kind === "overdue" && !row.noFounder) return "remind";
  if (k === "d" && row.kind === "alert") return "dismiss";
  return null;
}
