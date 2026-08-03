import { db } from "@/lib/db";

// Part 16, WS40 (JC-DD-F) — the DD checklist's completion logic.
// Recomputed on every read (founder GET/PATCH of the checklist, and the
// admin queue load in WS41) rather than written by an explicit founder
// "submit" step — there is no submission step in the confirmed field
// list, and documents/answers can change (e.g. a re-uploaded passport)
// right up until an admin promotes. Recompute-on-read keeps
// `completedAt` always honest without a webhook-style fan-out from the
// upload/archive routes. See docs/IMPLEMENTATION_PLAN.md Part 16, JC-DD-F.

export interface DiligenceChecklistState {
  isUsIncorporated: boolean | null;
  isStellarEcosystem: boolean;
  stellarWhyText: string | null;
  stellarTimelineText: string | null;
  hasPassportDocument: boolean;
}

export interface DiligenceProgress {
  done: number;
  total: number;
}

/**
 * Required-item progress: the Yes/No incorporation question and at
 * least one active passport upload are always required; the two
 * Stellar essay fields are required only when the deal is Stellar-flagged.
 */
export function diligenceProgress(state: DiligenceChecklistState): DiligenceProgress {
  const items: boolean[] = [
    state.isUsIncorporated !== null && state.isUsIncorporated !== undefined,
    state.hasPassportDocument,
  ];

  if (state.isStellarEcosystem) {
    items.push(!!state.stellarWhyText && state.stellarWhyText.trim().length > 0);
    items.push(!!state.stellarTimelineText && state.stellarTimelineText.trim().length > 0);
  }

  return { done: items.filter(Boolean).length, total: items.length };
}

/** Complete iff every required item (per `diligenceProgress`) is done. */
export function isDiligenceChecklistComplete(state: DiligenceChecklistState): boolean {
  const { done, total } = diligenceProgress(state);
  return done === total;
}

/** Convenience: whether an active (non-archived) passport doc exists for a company. */
export async function hasActivePassportDocument(companyId: string): Promise<boolean> {
  const doc = await db.document.findFirst({
    where: { companyId, docType: "passport", archivedAt: null },
    select: { id: true },
  });
  return !!doc;
}

/**
 * Recompute completion and persist `completedAt` if it changed. Shared
 * by the founder checklist route (GET/PATCH) and the admin review queue
 * (WS41) so all three call sites agree on the same recompute-on-read
 * contract. Takes `hasPassportDocument` as a parameter (rather than
 * querying it itself) so callers that already fetched it — or need it
 * for `diligenceProgress` too — don't pay for the same query twice.
 */
export async function recomputeDiligenceCompletion(
  companyId: string,
  diligence: {
    isUsIncorporated: boolean | null;
    isStellarEcosystem: boolean;
    stellarWhyText: string | null;
    stellarTimelineText: string | null;
    completedAt: Date | null;
  },
  hasPassportDocument: boolean
): Promise<Date | null> {
  const complete = isDiligenceChecklistComplete({
    isUsIncorporated: diligence.isUsIncorporated,
    isStellarEcosystem: diligence.isStellarEcosystem,
    stellarWhyText: diligence.stellarWhyText,
    stellarTimelineText: diligence.stellarTimelineText,
    hasPassportDocument,
  });

  const nextCompletedAt = complete ? (diligence.completedAt ?? new Date()) : null;
  const prevTime = diligence.completedAt?.getTime() ?? null;
  const nextTime = nextCompletedAt?.getTime() ?? null;

  if (prevTime !== nextTime) {
    await db.companyDiligence.update({
      where: { companyId },
      data: { completedAt: nextCompletedAt },
    });
  }

  return nextCompletedAt;
}
