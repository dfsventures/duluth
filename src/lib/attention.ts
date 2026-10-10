// The admin dashboard's "Needs attention" worklist (UI overhaul phase 5).
// Pure: takes the numbers and lists the dashboard already has and returns the
// ordered rows, so the ordering and wording are unit-tested.
//
// Order is by who is waiting on you: queues first (a signup is a person
// waiting), then metric alerts, then companies behind on updates, worst first.

import type { Tone } from "./status-tone";

export type AttentionKind = "approvals" | "diligence" | "board" | "alert" | "overdue";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  tone: Tone;
  title: string;
  detail?: string;
  /** Where "Review" / "Open" goes. */
  href: string;
  /** Inline action for rows that carry one. */
  action?: "dismiss" | "remind";
  /** Company the row is about (alerts, overdue). */
  companyId?: string;
}

export interface AttentionInput {
  pendingApprovals: number;
  diligenceReady: number;
  boardReview: number;
  alerts: { id: string; message: string; firedAt: string; company: { id: string; name: string } }[];
  overdue: { id: string; name: string; daysSinceUpdate: number | null }[];
}

/** Past this many days without an update, a company is "broken" (clay) rather than "aging" (amber). */
export const SEVERE_OVERDUE_DAYS = 60;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (input.pendingApprovals > 0) {
    items.push({
      id: "queue:approvals",
      kind: "approvals",
      tone: "sky",
      title: `${plural(input.pendingApprovals, "signup is", "signups are")} waiting for approval`,
      href: "/admin/approvals",
    });
  }
  if (input.diligenceReady > 0) {
    items.push({
      id: "queue:diligence",
      kind: "diligence",
      tone: "sky",
      title: `${plural(input.diligenceReady, "company is", "companies are")} ready for diligence review`,
      href: "/admin/diligence",
    });
  }
  if (input.boardReview > 0) {
    items.push({
      id: "queue:board",
      kind: "board",
      tone: "amber",
      title: `${plural(input.boardReview, "board item needs", "board items need")} review`,
      detail: "Names or projects Molly could not match.",
      href: "/admin/board",
    });
  }

  const alerts = [...input.alerts].sort((a, b) => b.firedAt.localeCompare(a.firedAt));
  for (const a of alerts) {
    items.push({
      id: `alert:${a.id}`,
      kind: "alert",
      tone: "clay",
      title: `${a.company.name}: ${a.message}`,
      href: `/admin/companies/${a.company.id}`,
      action: "dismiss",
      companyId: a.company.id,
    });
  }

  // Never-updated first (null), then by days since the last update, descending.
  const overdue = [...input.overdue].sort((a, b) => {
    if (a.daysSinceUpdate === null && b.daysSinceUpdate === null) return a.name.localeCompare(b.name);
    if (a.daysSinceUpdate === null) return -1;
    if (b.daysSinceUpdate === null) return 1;
    return b.daysSinceUpdate - a.daysSinceUpdate;
  });
  for (const c of overdue) {
    const severe = c.daysSinceUpdate === null || c.daysSinceUpdate > SEVERE_OVERDUE_DAYS;
    items.push({
      id: `overdue:${c.id}`,
      kind: "overdue",
      tone: severe ? "clay" : "amber",
      title: c.name,
      detail: c.daysSinceUpdate === null ? "No update sent yet" : `Last update ${c.daysSinceUpdate} days ago`,
      href: `/admin/companies/${c.id}`,
      action: "remind",
      companyId: c.id,
    });
  }

  return items;
}
