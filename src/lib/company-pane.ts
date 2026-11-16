// PLAN-1, WS160: what the Companies side pane says to do about a company. Pure, so the wording
// and the rules are unit-tested. The sentences are from docs/design/redesign-v1-copy.md section 6;
// the rules match the row button today: a reminder is offered only for a company that is behind
// or aging and has a founder in Molly (`hasFounder === false` means nobody can get one).

export type CompanyCadence = "new" | "current" | "aging" | "behind";

export interface CompanyNextAction {
  heading: string;
  text: string;
  /** "remind" = the primary button is "Send a reminder"; "open" = it is "Open company". */
  primary: "remind" | "open";
}

function days(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

export function companyNextAction(input: {
  cadence: CompanyCadence;
  daysSince: number | null;
  hasFounder?: boolean;
}): CompanyNextAction {
  const { cadence, daysSince, hasFounder } = input;

  if (cadence === "behind" || cadence === "aging") {
    if (hasFounder === false) {
      return {
        heading: "No founder in Molly",
        text: "Nobody here can get a reminder. Open the company to add a founder.",
        primary: "open",
      };
    }
    if (daysSince == null) {
      return {
        heading: "No update yet",
        text: "Nothing has been sent. A reminder goes to the company's founders by email.",
        primary: "remind",
      };
    }
    return {
      heading: `No update for ${days(daysSince)}`,
      text: `The last update was ${days(daysSince)} ago. A reminder goes to the company's founders by email.`,
      primary: "remind",
    };
  }

  if (cadence === "current") {
    const when = daysSince == null ? "recently" : daysSince === 0 ? "today" : `${days(daysSince)} ago`;
    return { heading: "Up to date", text: `The last update was ${when}. Nothing to do.`, primary: "open" };
  }

  // A new company with no update yet is inside its grace period (src/lib/update-cadence.ts).
  return {
    heading: "No updates yet",
    text: "This company was added recently, so nothing is due yet.",
    primary: "open",
  };
}
