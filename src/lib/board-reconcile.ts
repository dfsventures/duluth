// Part 37 (WS106.2) — pure reconciliation logic for the team board.
// No db access. Decides which canonical person/project a free-text name
// refers to, and what to do with each extracted item (create / link / fill / skip).

export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A canonical person or project. `aliases` must already be normalizeName()d. */
export interface Canonical {
  id: string;
  name: string;
  aliases: string[];
  email?: string | null;
}

export type ResolveVia = "exact" | "alias" | "email" | "claude" | "none";

/**
 * Q100-d: deterministic pass first (name, alias, attendee email); Claude's
 * guess is accepted only if it is a real canonical id. `raw` is kept (non-null)
 * whenever the text differed from the canonical name, so a human can see it.
 */
export function resolveEntity(
  raw: string | null,
  claudeId: string | null,
  list: Canonical[],
  attendeeEmail?: string | null
): { id: string | null; raw: string | null; needsReview: boolean; via: ResolveVia } {
  if (!raw?.trim()) return { id: null, raw: null, needsReview: false, via: "none" };
  const n = normalizeName(raw);
  const byName = list.find((c) => normalizeName(c.name) === n);
  if (byName) return { id: byName.id, raw: null, needsReview: false, via: "exact" };
  const byAlias = list.find((c) => c.aliases.includes(n));
  if (byAlias) return { id: byAlias.id, raw, needsReview: false, via: "alias" };
  if (attendeeEmail) {
    const byEmail = list.find(
      (c) => c.email && c.email.toLowerCase() === attendeeEmail.toLowerCase()
    );
    if (byEmail) return { id: byEmail.id, raw, needsReview: false, via: "email" };
  }
  if (claudeId && list.some((c) => c.id === claudeId)) {
    return { id: claudeId, raw, needsReview: false, via: "claude" }; // JC-TB-H: no alias saved
  }
  return { id: null, raw, needsReview: true, via: "none" };
}

/** An extracted item after owner/project resolution (output of resolveEntity). */
export interface ResolvedItem {
  title: string;
  notes?: string | null;
  /** Idempotency key for automated creates, e.g. `granola:<noteId>:<n>`. */
  sourceKey?: string | null;
  /** Set when the extractor says this item is an already-open card. */
  existingCardId?: string | null;
  ownerId: string | null;
  rawOwnerName: string | null;
  projectId: string | null;
  rawProjectName: string | null;
  dueDate: Date | null;
  needsReview: boolean;
}

/** The slice of an OPEN (non-archived) BoardCard that planning needs. */
export interface ExistingCardLite {
  id: string;
  sourceKey: string | null;
  humanEditedAt: Date | null;
  ownerId: string | null;
  projectId: string | null;
  dueDate: Date | null;
}

/** Fields an automated "fill" may set; only ever for fields currently null. */
export interface CardFill {
  ownerId?: string;
  rawOwnerName?: string | null;
  projectId?: string;
  rawProjectName?: string | null;
  dueDate?: Date;
}

export type CardWritePlan =
  | { action: "create"; item: ResolvedItem }
  | { action: "link"; item: ResolvedItem; cardId: string }
  /** `fill` may be an empty object when nothing is missing (a no-op write). */
  | { action: "fill"; item: ResolvedItem; cardId: string; fill: CardFill }
  | {
      action: "skip";
      item: ResolvedItem;
      cardId: string | null;
      reason: "human-edited" | "duplicate-in-batch";
    };

/**
 * Q100-e/f: decide, per extracted item, create / link / fill / skip.
 * Never deletes, never touches humanEditedAt cards.
 */
export function planCardWrites(
  items: ResolvedItem[],
  existing: ExistingCardLite[]
): CardWritePlan[] {
  const byId = new Map(existing.map((c) => [c.id, c]));
  const byKey = new Map<string, ExistingCardLite>();
  for (const c of existing) if (c.sourceKey) byKey.set(c.sourceKey, c);

  const seenKeys = new Set<string>();
  const plans: CardWritePlan[] = [];

  for (const item of items) {
    // 1. Matches an open card the extractor pointed at: link, no write.
    if (item.existingCardId && byId.has(item.existingCardId)) {
      plans.push({ action: "link", item, cardId: item.existingCardId });
      continue;
    }

    if (item.sourceKey) {
      // Two items with the same key in one batch would violate the unique index.
      if (seenKeys.has(item.sourceKey)) {
        plans.push({ action: "skip", item, cardId: null, reason: "duplicate-in-batch" });
        continue;
      }
      seenKeys.add(item.sourceKey);

      const card = byKey.get(item.sourceKey);
      if (card) {
        // 3. Human has touched it: leave it alone.
        if (card.humanEditedAt) {
          plans.push({ action: "skip", item, cardId: card.id, reason: "human-edited" });
          continue;
        }
        // 2. Untouched: fill only the null fields.
        const fill: CardFill = {};
        if (!card.ownerId && item.ownerId) {
          fill.ownerId = item.ownerId;
          fill.rawOwnerName = item.rawOwnerName;
        }
        if (!card.projectId && item.projectId) {
          fill.projectId = item.projectId;
          fill.rawProjectName = item.rawProjectName;
        }
        if (!card.dueDate && item.dueDate) fill.dueDate = item.dueDate;
        plans.push({ action: "fill", item, cardId: card.id, fill });
        continue;
      }
    }

    // 4. Otherwise create.
    plans.push({ action: "create", item });
  }
  return plans;
}
