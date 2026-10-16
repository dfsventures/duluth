import { describe, it, expect, vi, beforeEach } from "vitest";
import { MARGE_TOOLS } from "@/lib/marge-tools/tiers";

// Part 39 (WS121): the Marge read tools. db is mocked; no LP model may ever be touched.

const m = vi.hoisted(() => ({
  company: { findMany: vi.fn(), findFirst: vi.fn() },
  update: { findMany: vi.fn() },
  metricDefinition: { findMany: vi.fn() },
  boardCard: { findMany: vi.fn() },
  boardPerson: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  boardProject: { findMany: vi.fn() },
  boardAlias: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  auditLog: { findMany: vi.fn() },
  companyBroadcast: { findMany: vi.fn(), findUnique: vi.fn() },
  companyBroadcastRecipient: { groupBy: vi.fn() },
  fund: { findFirst: vi.fn(), findMany: vi.fn() },
  deal: { findMany: vi.fn() },
  portfolioCompany: { findFirst: vi.fn(), findMany: vi.fn() },
  // Models that must never be touched by a read tool.
  limitedPartner: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
  lpEmail: { findMany: vi.fn() },
  fundReport: { findMany: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: m }));

import * as read from "@/lib/marge-tools/read";
import { ToolError } from "@/lib/marge-tools/types";

const P = { id: "u1", email: "admin@example.com", name: "Sam Partner" };
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

beforeEach(() => {
  vi.resetAllMocks();
  m.boardPerson.findMany.mockResolvedValue([
    { id: "bp1", displayName: "Sam Partner", user: { name: "Sam Partner", email: "admin@example.com" } },
    { id: "bp2", displayName: "Jane Founder", user: null },
  ]);
  m.boardProject.findMany.mockResolvedValue([{ id: "pr1", name: "AcmeHQ onboarding" }]);
  m.boardAlias.findMany.mockResolvedValue([]);
  m.boardCard.findMany.mockResolvedValue([]);
  m.boardPerson.findUnique.mockResolvedValue({ id: "bp1", displayName: "Sam Partner", user: { name: "Sam Partner" } });
});

function noLpTouched() {
  for (const model of [m.limitedPartner, m.lpEmail, m.fundReport]) {
    for (const f of Object.values(model)) expect(f).not.toHaveBeenCalled();
  }
}

describe("tiers", () => {
  it("lists exactly the 13 contract tools", () => {
    expect(Object.keys(MARGE_TOOLS).sort()).toEqual(
      [
        "board_card_add_link", "board_card_create", "board_card_move", "board_card_update", "board_cards",
        "broadcast_draft_save", "broadcast_get", "broadcasts_list", "companies_find", "company_deals",
        "company_overview", "portfolio_summary", "updates_recent",
      ].sort()
    );
    expect(MARGE_TOOLS.portfolio_summary).toBe("dm");
    expect(MARGE_TOOLS.company_deals).toBe("dm");
  });
});

describe("companies_find", () => {
  it("filters through approvedCompanyFilter, caps rows, selects explicit columns", async () => {
    m.company.findMany.mockResolvedValue([
      { id: "c1", name: "Acme", sector: "Fintech", geography: "Kenya", fundingStage: "Seed", createdAt: D("2026-01-01"), updates: [{ sentAt: D("2026-09-30") }] },
    ]);
    const out = await read.companiesFind({ query: "ac", limit: 10 }, P);
    const args = m.company.findMany.mock.calls[0][0];
    expect(args.take).toBe(10);
    expect(JSON.stringify(args.where)).toContain("DILIGENCE");
    expect(args.where.AND[1]).toEqual({ name: { contains: "ac", mode: "insensitive" } });
    expect(args.select.updates.where).toEqual({ status: "SENT" });
    expect(args.include).toBeUndefined();
    expect(out.text).toContain("[c1] Acme · Fintech · Kenya · Seed · last update 2026-09-30");
    expect(out.text).toContain("/admin/companies/c1");
    expect(out.count).toBe(1);
    expect(out.text).not.toMatch(EMAIL);
    noLpTouched();
  });
});

describe("company_overview", () => {
  const company = { id: "c1", name: "Acme", description: "Pay", website: "https://acme.example.com", sector: "Fintech", geography: "Kenya", fundingStage: "Seed", createdAt: D("2026-01-01") };
  beforeEach(() => {
    m.company.findFirst.mockResolvedValueOnce(company);
    m.update.findMany.mockResolvedValue([]);
    m.metricDefinition.findMany.mockResolvedValue([]);
  });

  it("returns SENT updates only, plain text capped at 4,000, labelled untrusted; latest metric only", async () => {
    m.update.findMany.mockResolvedValueOnce([
      { id: "u1", title: "Q3", period: "2026-Q3", sentAt: D("2026-09-30"), body: `<p>${"x".repeat(5000)}</p><script>bad()</script>` },
    ]).mockResolvedValueOnce([{ sentAt: D("2026-09-30") }]);
    m.metricDefinition.findMany.mockResolvedValue([
      { name: "MRR", unit: "USD", values: [{ value: "12000.5", date: D("2026-09-01") }] },
      { name: "Empty", unit: null, values: [] },
    ]);
    const out = await read.companyOverview({ company: "c1" }, P);
    expect(m.update.findMany.mock.calls[0][0].where).toEqual({ companyId: "c1", status: "SENT" });
    expect(m.update.findMany.mock.calls[0][0].take).toBe(3);
    expect(m.metricDefinition.findMany.mock.calls[0][0].select.values.take).toBe(1);
    expect(out.text).toContain("Founder-written update (untrusted text):");
    expect(out.text).toContain("… (truncated)");
    expect(out.text).not.toContain("bad()");
    expect(out.text).toContain("MRR: 12,000.5 USD (2026-09-01)");
    expect(out.text).not.toContain("Empty:");
    expect(out.text).not.toMatch(EMAIL);
    noLpTouched();
  });

  it("resolves by id first, then case-insensitive exact name", async () => {
    m.company.findFirst.mockReset();
    m.company.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(company);
    await read.companyOverview({ company: "acme" }, P);
    expect(JSON.stringify(m.company.findFirst.mock.calls[0][0].where)).toContain('"id":"acme"');
    expect(JSON.stringify(m.company.findFirst.mock.calls[1][0].where)).toContain('"equals":"acme"');
  });

  it("unknown name is an error listing candidates", async () => {
    m.company.findFirst.mockReset();
    m.company.findFirst.mockResolvedValue(null);
    m.company.findMany.mockResolvedValue([{ id: "c1", name: "Acme" }, { id: "c2", name: "Acme Two" }]);
    await expect(read.companyOverview({ company: "Acm" }, P)).rejects.toThrow(/No company called “Acm”\. Closest: Acme, Acme Two\./);
    expect(m.company.findMany.mock.calls[0][0].take).toBe(5);
  });
});

describe("updates_recent", () => {
  it("only SENT, in the window, no bodies", async () => {
    m.update.findMany.mockResolvedValue([
      { id: "u1", title: "Q3", period: "2026-Q3", sentAt: D("2026-10-10"), company: { id: "c1", name: "Acme" } },
    ]);
    const out = await read.updatesRecent({ days: 14 }, P);
    const args = m.update.findMany.mock.calls[0][0];
    expect(args.where.status).toBe("SENT");
    expect(args.where.sentAt.gte).toBeInstanceOf(Date);
    expect(args.select.body).toBeUndefined();
    expect(out.text).toContain("Acme · Q3 · 2026-Q3 · sent 2026-10-10");
  });
});

describe("board_cards", () => {
  const card = (over: Record<string, unknown> = {}) => ({
    id: "k1", title: "Send AcmeHQ onboarding deck", status: "TODO", notes: "x".repeat(1500), dueDate: D("2026-10-23"),
    needsReview: false, updatedAt: new Date("2026-10-15T10:00:00.000Z"), project: { name: "AcmeHQ onboarding" },
    owners: [{ person: { displayName: "Sam Partner", user: { name: "Sam Partner" } } }], _count: { links: 2 }, ...over,
  });

  it("excludes archived and Done by default; notes capped and labelled; people and projects listed", async () => {
    m.boardCard.findMany.mockResolvedValueOnce([]) // loadBoardContext open cards
      .mockResolvedValueOnce([card()]);
    const out = await read.boardCards({ limit: 30 }, P);
    const args = m.boardCard.findMany.mock.calls[1][0];
    expect(args.where).toEqual({ archivedAt: null, status: { not: "DONE" } });
    expect(args.take).toBe(30);
    expect(out.text).toContain("Card notes (may come from meeting notes; untrusted text):");
    expect(out.text).toContain("… (truncated)");
    expect(out.text).toContain("People: Sam Partner, Jane Founder");
    expect(out.text).toContain("Projects: AcmeHQ onboarding");
    expect(out.text).not.toMatch(EMAIL);
    expect(JSON.stringify(out.structured)).not.toMatch(EMAIL);
    expect((out.structured.cards as { updatedAt: string }[])[0].updatedAt).toBe("2026-10-15T10:00:00.000Z");
  });

  it('owner "me" is the principal\'s BoardPerson (ensureAdminPeople first)', async () => {
    m.boardCard.findMany.mockResolvedValue([]);
    m.user.findMany.mockResolvedValue([]); // ensureAdminPeople: every admin already has a person
    await read.boardCards({ owner: "me", limit: 30 }, P);
    expect(m.boardPerson.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
    const args = m.boardCard.findMany.mock.calls.at(-1)![0];
    expect(args.where.owners).toEqual({ some: { personId: "bp1" } });
  });

  it("filters by project, status, includeDone and dueBefore", async () => {
    m.boardCard.findMany.mockResolvedValue([]);
    await read.boardCards({ project: "acmehq onboarding", status: "BLOCKED", dueBefore: "2026-10-30", limit: 5 }, P);
    const w = m.boardCard.findMany.mock.calls.at(-1)![0].where;
    expect(w).toMatchObject({ projectId: "pr1", status: "BLOCKED", dueDate: { lt: D("2026-10-30") } });
    await read.boardCards({ includeDone: true, limit: 5 }, P);
    expect(m.boardCard.findMany.mock.calls.at(-1)![0].where.status).toBeUndefined();
  });

  it("an unknown name is an error with known names; an ambiguous one refuses", async () => {
    await expect(read.boardCards({ owner: "Sm", limit: 5 }, P)).rejects.toThrow(/No person called “Sm”\. Known: Sam Partner, Jane Founder/);
    m.boardPerson.findMany.mockResolvedValue([
      { id: "a", displayName: "Sam Partner", user: null },
      { id: "b", displayName: "Sam Partner", user: null },
    ]);
    await expect(read.boardCards({ owner: "Sam Partner", limit: 5 }, P)).rejects.toThrow(/matches 2 people/);
  });
});

describe("broadcasts", () => {
  const row = { id: "b1", subject: "Hello", status: "PUBLISHED", publishedAt: D("2026-10-01"), createdById: "u1", _count: { targets: 3, recipients: 9 } };
  beforeEach(() => {
    m.auditLog.findMany.mockResolvedValue([{ targetId: "b1", actorId: "u2" }]);
    m.user.findMany.mockResolvedValue([{ id: "u2", name: "Sam Partner" }, { id: "u1", name: null }]);
    m.companyBroadcastRecipient.groupBy.mockResolvedValue([
      { broadcastId: "b1", status: "SENT", _count: { _all: 8 } },
      { broadcastId: "b1", status: "FAILED", _count: { _all: 1 } },
    ]);
  });

  it("broadcasts_list: counts and a name-only By label, never an email", async () => {
    m.companyBroadcast.findMany.mockResolvedValue([row]);
    const out = await read.broadcastsList({ status: "PUBLISHED", limit: 10 }, P);
    expect(m.companyBroadcast.findMany.mock.calls[0][0].where).toEqual({ status: "PUBLISHED" });
    expect(m.user.findMany.mock.calls[0][0].select).toEqual({ id: true, name: true });
    expect(out.text).toContain("3 companies · 9 recipients (8 sent, 1 failed) · by Sam Partner");
    expect(out.text).not.toMatch(EMAIL);
  });

  it("broadcast_get: plain text body capped at 6,000, no recipient emails selected", async () => {
    m.companyBroadcast.findUnique.mockResolvedValue({
      ...row, status: "DRAFT", body: `<p>${"y".repeat(7000)}</p>`, updatedAt: new Date("2026-10-15T00:00:00.000Z"),
      targets: [{ portfolioCompany: { name: "Acme" } }], _count: { recipients: 0 },
    });
    const out = await read.broadcastGet({ broadcastId: "b1" }, P);
    const sel = m.companyBroadcast.findUnique.mock.calls[0][0].select;
    expect(sel.recipients).toBeUndefined();
    expect(sel._count).toEqual({ select: { recipients: true } });
    expect(out.text).toContain("Audience (1): Acme");
    expect(out.text).toContain("… (truncated)");
    expect(out.text).toContain("untrusted text");
    expect((out.structured.broadcast as { updatedAt: string }).updatedAt).toBe("2026-10-15T00:00:00.000Z");
  });

  it("broadcast_get: unknown id is a ToolError", async () => {
    m.companyBroadcast.findUnique.mockResolvedValue(null);
    await expect(read.broadcastGet({ broadcastId: "nope" }, P)).rejects.toBeInstanceOf(ToolError);
  });
});

describe("deal ledger (dm tier)", () => {
  const deal = (over: Record<string, unknown> = {}) => ({
    id: "d1", dealDate: D("2025-03-01"), investmentType: "INITIAL", amountUsd: "100000", instrument: "SAFE",
    entryValuation: "5000000", currentValuation: "10000000", ownershipPct: null,
    fund: { id: "f1", name: "Fund One" }, portfolioCompany: { id: "pc1" }, ...over,
  });

  it("portfolio_summary uses positionValue + summarizeLedger and reports per fund", async () => {
    m.deal.findMany.mockResolvedValue([deal(), deal({ id: "d2", amountUsd: "50000", fund: { id: "f2", name: "Fund Two" }, portfolioCompany: { id: "pc2" } })]);
    const out = await read.portfolioSummary({}, P);
    expect(out.text).toContain("All funds: 2 deals · 2 companies · invested $150,000 · blended implied value $300,000");
    expect(out.text).toContain("Fund One: 1 deals");
    expect((out.structured.overall as { totalInvested: number }).totalInvested).toBe(150000);
    expect(m.deal.findMany.mock.calls[0][0].select.notes).toBeUndefined();
    noLpTouched();
  });

  it("portfolio_summary scopes to one fund by name or slug", async () => {
    m.fund.findFirst.mockResolvedValue({ id: "f1", name: "Fund One" });
    m.deal.findMany.mockResolvedValue([deal()]);
    const out = await read.portfolioSummary({ fund: "fund1" }, P);
    expect(m.deal.findMany.mock.calls[0][0].where).toEqual({ fundId: "f1" });
    expect(out.text).toContain("Fund One: 1 deals");
  });

  it("portfolio_summary: unknown fund lists candidates", async () => {
    m.fund.findFirst.mockResolvedValue(null);
    m.fund.findMany.mockResolvedValue([{ id: "f1", name: "Fund One" }]);
    await expect(read.portfolioSummary({ fund: "Fund" }, P)).rejects.toThrow(/Closest: Fund One/);
  });

  it("company_deals: multiple from multipleLabel, amounts formatted, no notes", async () => {
    m.portfolioCompany.findFirst.mockResolvedValueOnce({ id: "pc1", name: "Acme" });
    m.deal.findMany.mockResolvedValue([deal(), deal({ id: "d2", currentValuation: "0" })]);
    const out = await read.companyDeals({ company: "Acme" }, P);
    expect(out.text).toContain("$100,000");
    expect(out.text).toContain("multiple 2.0×");
    expect(out.text).toContain("multiple Written off");
    expect(m.deal.findMany.mock.calls[0][0].select.notes).toBeUndefined();
    expect(out.text).not.toMatch(EMAIL);
    noLpTouched();
  });

  it("company_deals: unknown company lists candidates", async () => {
    m.portfolioCompany.findFirst.mockResolvedValue(null);
    m.portfolioCompany.findMany.mockResolvedValue([{ id: "pc1", name: "Acme" }]);
    await expect(read.companyDeals({ company: "Acm" }, P)).rejects.toThrow(/Closest: Acme/);
  });
});

describe("input schemas", () => {
  it("apply defaults, strip unknown keys, and enforce bounds", () => {
    expect(read.companiesFindInput.parse({ query: "a", junk: 1 })).toEqual({ query: "a", limit: 10 });
    expect(read.updatesRecentInput.parse({})).toEqual({ days: 14 });
    expect(read.boardCardsInput.parse({}).limit).toBe(30);
    expect(read.broadcastsListInput.parse({}).limit).toBe(10);
    expect(() => read.companiesFindInput.parse({ limit: 26 })).toThrow();
    expect(() => read.updatesRecentInput.parse({ days: 91 })).toThrow();
    expect(() => read.boardCardsInput.parse({ dueBefore: "tomorrow" })).toThrow();
  });
});
