import { describe, it, expect } from "vitest";
import { buildAttention } from "../attention";
import { ageLabel, buildInboxRows, inboxCard, inboxGroupOf, INBOX_GROUPS, kindLabel, paneActionKey } from "../needs-you";

// PLAN-1, WS161: grouping and wording for the Needs you inbox. Placeholder names only.

const NOW = new Date("2026-11-18T12:00:00Z").getTime();
const alerts = [
  { id: "a1", message: "Revenue dropped 20%", firedAt: "2026-11-15T12:00:00Z", company: { id: "c1", name: "Example Co" } },
];
const overdue = [
  { id: "c2", name: "Sample Labs", daysSinceUpdate: 75 },
  { id: "c3", name: "Acme", daysSinceUpdate: null, hasFounder: false },
  { id: "c4", name: "Northwind", daysSinceUpdate: 21 },
];
const items = buildAttention({
  pendingApprovals: 3,
  diligenceReady: 1,
  boardReview: 2,
  alerts: alerts.map((a) => ({ id: a.id, message: a.message, firedAt: a.firedAt, company: a.company })),
  overdue,
});
const counts = { approvals: 3, diligence: 1, board: 2 };

describe("groups", () => {
  it("are the four from the copy file, in order", () => {
    expect(INBOX_GROUPS.map((g) => g.label)).toEqual(["Waiting on you", "On the board", "Alerts", "Behind on updates"]);
  });
  it("put approvals and diligence under Waiting on you, and the rest in their own", () => {
    expect(inboxGroupOf("approvals").label).toBe("Waiting on you");
    expect(inboxGroupOf("diligence").label).toBe("Waiting on you");
    expect(inboxGroupOf("board").label).toBe("On the board");
    expect(inboxGroupOf("alert").label).toBe("Alerts");
    expect(inboxGroupOf("overdue").label).toBe("Behind on updates");
  });
  it("never say overdue to a person", () => {
    expect(kindLabel("overdue")).toBe("Behind");
    expect(["approvals", "diligence", "board", "alert", "overdue"].map((k) => kindLabel(k as never))).toEqual([
      "Approvals",
      "Diligence",
      "Team Board",
      "Metric alert",
      "Behind",
    ]);
  });
});

describe("buildInboxRows", () => {
  const rows = buildInboxRows(items, { alerts, overdue, now: NOW });

  it("keeps every item once and in buildAttention's order", () => {
    expect(rows.map((r) => r.id)).toEqual(items.map((i) => i.id));
    expect(new Set(rows.map((r) => r.id)).size).toBe(items.length);
  });
  it("keeps the groups together in display order", () => {
    const seen = rows.map((r) => r.group.id).filter((g, i, all) => all.indexOf(g) === i);
    expect(seen).toEqual(["waiting", "board", "alerts", "behind"]);
    // No group appears again after another one started.
    const flat = rows.map((r) => r.group.id);
    for (const id of seen) {
      const first = flat.indexOf(id);
      const last = flat.lastIndexOf(id);
      expect(flat.slice(first, last + 1).every((g) => g === id)).toBe(true);
    }
  });
  it("gives alert rows their company, id and age", () => {
    const a = rows.find((r) => r.kind === "alert")!;
    expect(a.alertId).toBe("a1");
    expect(a.company).toBe("Example Co");
    expect(a.age).toBe("3d");
  });
  it("gives behind rows the company, the days and the no-founder flag", () => {
    const sample = rows.find((r) => r.companyId === "c2")!;
    expect(sample.company).toBe("Sample Labs");
    expect(sample.age).toBe("75d");
    expect(sample.noFounder).toBe(false);
    const acme = rows.find((r) => r.companyId === "c3")!;
    expect(acme.age).toBe("Never");
    expect(acme.days).toBeNull();
    expect(acme.noFounder).toBe(true);
  });
  it("leaves queue rows without an age or a company", () => {
    for (const r of rows.filter((r) => ["approvals", "diligence", "board"].includes(r.kind))) {
      expect(r.age).toBe("");
      expect(r.company).toBeUndefined();
    }
  });
  it("is empty when there is nothing", () => {
    expect(buildInboxRows([], { alerts: [], overdue: [], now: NOW })).toEqual([]);
  });
});

describe("ageLabel", () => {
  it("is short, and blank when there is no age", () => {
    expect(ageLabel(0)).toBe("Today");
    expect(ageLabel(1)).toBe("1d");
    expect(ageLabel(12)).toBe("12d");
    expect(ageLabel(null)).toBe("");
    expect(ageLabel(-2)).toBe("");
  });
});

describe("inboxCard", () => {
  const rows = buildInboxRows(items, { alerts, overdue, now: NOW });
  const by = (id: string) => rows.find((r) => r.id === id)!;

  it("uses the copy file's sentences for diligence, the board and alerts", () => {
    expect(inboxCard(by("queue:diligence"), counts)).toMatchObject({
      heading: "Start with the oldest",
      text: "1 company finished its diligence answers.",
      primary: "open",
      openLabel: "Open diligence",
    });
    expect(inboxCard(by("queue:board"), counts)).toMatchObject({
      heading: "Match the name",
      text: "Molly couldn't match a name or project on 2 items.",
      openLabel: "Open the board",
    });
    expect(inboxCard(by("alert:a1"), counts)).toMatchObject({
      heading: "Check the figure",
      text: "If this is expected, dismiss the alert.",
      primary: "dismiss",
    });
  });
  it("words the diligence count in the plural", () => {
    expect(inboxCard(by("queue:diligence"), { ...counts, diligence: 2 }).text).toBe("2 companies finished their diligence answers.");
  });
  it("opens the signups queue on Approvals", () => {
    const c = inboxCard(by("queue:approvals"), counts);
    expect(c.primary).toBe("open");
    expect(c.openLabel).toBe("Open approvals");
    expect(c.text).toContain("3 signups are waiting");
  });
  it("offers Send a reminder for a behind company with a founder, and only Open company without one", () => {
    const withFounder = inboxCard(by("overdue:c2"), counts);
    expect(withFounder.primary).toBe("remind");
    expect(withFounder.heading).toBe("No update for 75 days");
    const never = inboxCard(by("overdue:c3"), counts);
    expect(never.primary).toBe("open");
    expect(never.heading).toBe("No founder in Molly");
  });
});

describe("paneActionKey", () => {
  const rows = buildInboxRows(items, { alerts, overdue, now: NOW });
  const by = (id: string) => rows.find((r) => r.id === id)!;

  it("R reminds a behind company that has a founder", () => {
    expect(paneActionKey(by("overdue:c2"), "r")).toBe("remind");
    expect(paneActionKey(by("overdue:c2"), "R")).toBe("remind");
  });
  it("R does nothing where nobody can be reminded, or on other rows", () => {
    expect(paneActionKey(by("overdue:c3"), "r")).toBeNull();
    expect(paneActionKey(by("alert:a1"), "r")).toBeNull();
    expect(paneActionKey(by("queue:approvals"), "r")).toBeNull();
  });
  it("D dismisses an alert and nothing else", () => {
    expect(paneActionKey(by("alert:a1"), "d")).toBe("dismiss");
    expect(paneActionKey(by("overdue:c2"), "d")).toBeNull();
  });
  it("ignores other keys and no row", () => {
    expect(paneActionKey(by("alert:a1"), "x")).toBeNull();
    expect(paneActionKey(null, "d")).toBeNull();
  });
});
