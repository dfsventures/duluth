// Who may edit an update, and how figure provenance survives an edit.
// Pure so the API route and the page share one rule.

export const EDIT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const EMAIL_SOURCE = "EMAIL_VIA_MARGE";

export type EditableUpdate = {
  status: string;
  sentAt: Date | string | null;
  source?: string | null;
};

/** Admins may edit a Marge-filed update at any time (Marge backdates sentAt). */
export function isMargeAdminException(u: EditableUpdate, isAdmin: boolean): boolean {
  return isAdmin && u.status === "SENT" && u.source === EMAIL_SOURCE;
}

/** Drafts: yes. Published: within 3 days of sentAt, or the Marge/admin exception. */
export function canEditUpdate(u: EditableUpdate, isAdmin: boolean, now: number = Date.now()): boolean {
  if (u.status === "DRAFT") return true;
  if (u.status !== "SENT") return false;
  if (isMargeAdminException(u, isAdmin)) return true;
  const sentAt = u.sentAt ? new Date(u.sentAt).getTime() : 0;
  return now - sentAt <= EDIT_WINDOW_MS;
}

export type OldFigure = {
  metricDefinitionId: string;
  value: { toString(): string } | number;
  date: Date;
  via: string | null;
  quote: string | null;
  enteredById: string | null;
  origin: string | null;
};

export type ProvenanceFields = {
  via: string | null;
  quote: string | null;
  enteredById: string | null;
  origin: string | null;
};

/**
 * Builds the metricValues payload the edit page PATCHes. A metric that already
 * had a figure on this update keeps its stored date (so carryProvenance can match
 * it and the backdated date survives); only a metric with no figure yet gets `now`.
 * Empty values are dropped.
 */
export function buildEditMetricValues(
  editMetrics: Record<string, string>,
  storedDates: Record<string, string>,
  now: Date
): { metricDefinitionId: string; value: number; date: string }[] {
  return Object.entries(editMetrics)
    .filter(([, v]) => v.trim() !== "")
    .map(([metricDefinitionId, value]) => ({
      metricDefinitionId,
      value: parseFloat(value),
      date: storedDates[metricDefinitionId] ?? now.toISOString(),
    }));
}

const dayOf =(d: Date) => d.toISOString().slice(0, 10);
const key = (defId: string, value: unknown, date: Date) =>
  `${defId}|${Number(String(value))}|${dayOf(date)}`;

/**
 * For each re-created figure, find an unchanged old figure (same metric, value,
 * date) and carry its via/quote/enteredById/origin. Otherwise it is the editor's
 * own entry: no tag, enteredById = the editing admin (or null).
 */
export function carryProvenance(
  oldFigures: OldFigure[],
  incoming: { metricDefinitionId: string; value: number | string; date: Date }[],
  editorAdminId: string | null
): ProvenanceFields[] {
  const pool = new Map<string, OldFigure[]>();
  for (const o of oldFigures) {
    const k = key(o.metricDefinitionId, o.value, o.date);
    pool.set(k, [...(pool.get(k) ?? []), o]);
  }
  return incoming.map((n) => {
    const match = pool.get(key(n.metricDefinitionId, n.value, n.date))?.shift();
    if (match) {
      return { via: match.via, quote: match.quote, enteredById: match.enteredById, origin: match.origin };
    }
    return { via: null, quote: null, enteredById: editorAdminId, origin: null };
  });
}
