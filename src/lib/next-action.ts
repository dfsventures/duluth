// The founder dashboard leads with ONE next action (UI overhaul phase 5).
// Pure: the dashboard passes what it already fetched.
//
// There is no "due date" in the product, so the wording never invents one: it
// leads with an unfinished diligence step, then an unfinished draft, then a gap
// since the last update.

export interface NextActionInput {
  stage?: string | null;
  diligence: { done: number; total: number; completed: boolean } | null;
  updates: { id: string; title: string; status: "DRAFT" | "SENT"; createdAt: string }[];
  /** Days since the most recent update was created, or null if there are none. */
  daysSinceLastUpdate: number | null;
}

export type NextActionTone = "act" | "calm";

export interface NextAction {
  kind: "diligence" | "draft" | "first-update" | "stale" | "up-to-date";
  tone: NextActionTone;
  headline: string;
  detail?: string;
  /** Label of the one button. */
  cta: string;
  href: string;
}

/** After this many days without a new update, the dashboard nudges. */
export const STALE_AFTER_DAYS = 45;

export function nextFounderAction(input: NextActionInput): NextAction {
  if (input.stage === "DILIGENCE" && !(input.diligence?.completed ?? false)) {
    const d = input.diligence;
    return {
      kind: "diligence",
      tone: "act",
      headline: "Finish your due diligence",
      detail: d ? `${d.done} of ${d.total} required items done.` : "Documents and a couple of quick questions before we close.",
      cta: "Continue",
      href: "/diligence",
    };
  }

  const draft = input.updates.find((u) => u.status === "DRAFT");
  if (draft) {
    return {
      kind: "draft",
      tone: "act",
      headline: "Pick up your draft update",
      detail: draft.title ? `"${draft.title}" is saved and waiting for you.` : "Your draft is saved and waiting for you.",
      cta: "Continue draft",
      href: `/updates/${draft.id}`,
    };
  }

  if (input.updates.length === 0) {
    return {
      kind: "first-update",
      tone: "act",
      headline: "Send your first update",
      detail: "A short note on how the company is doing keeps your investors in the loop.",
      cta: "Write an update",
      href: "/updates/new",
    };
  }

  const days = input.daysSinceLastUpdate;
  if (days !== null && days >= STALE_AFTER_DAYS) {
    return {
      kind: "stale",
      tone: "act",
      headline: "Time for your next update",
      detail: `Your last update was ${days} days ago.`,
      cta: "Write an update",
      href: "/updates/new",
    };
  }

  return {
    kind: "up-to-date",
    tone: "calm",
    headline: "You are up to date",
    detail:
      days === null
        ? "Nothing needs you right now."
        : days === 0
          ? "Your last update went out today."
          : `Your last update was ${days} ${days === 1 ? "day" : "days"} ago.`,
    cta: "View updates",
    href: "/updates",
  };
}
