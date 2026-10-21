import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 42 (WS139): the backfill's logic against a small fake database. Synthetic names only
// (Acme, Globex, Initech, Hooli, Umbrella). The CLI in scripts/ is a thin shell over runBackfill.

const audit = vi.hoisted(() => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/audit", () => audit);

type Row = Record<string, any>;
const state = vi.hoisted(() => ({
  memos: [] as Row[],
  companies: [] as Row[],
  ledger: [] as Row[],
  onUpdate: null as null | (() => void),
}));

function matches(where: Row | undefined, row: Row): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === "AND") return (v as Row[]).every((w) => matches(w, row));
    if (k === "OR") return (v as Row[]).some((w) => matches(w, row));
    if (k === "NOT") return !matches(v as Row, row);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("not" in v) return (row[k] ?? null) !== v.not;
      return row[k] != null && matches(v as Row, row[k]);
    }
    if (v instanceof Date) return row[k] instanceof Date && row[k].getTime() === v.getTime();
    return (row[k] ?? null) === (v ?? null);
  });
}

vi.mock("@/lib/db", () => {
  const view = (m: Row): Row => ({
    ...m,
    company: m.companyId ? state.companies.find((c) => c.id === m.companyId) ?? null : null,
    portfolioCompany: m.portfolioCompanyId ? state.ledger.find((l) => l.id === m.portfolioCompanyId) ?? null : null,
  });
  const db: Row = {
    memo: {
      findMany: vi.fn(async ({ where }: Row) => state.memos.filter((m) => matches(where, view(m))).map(view)),
      findFirst: vi.fn(async ({ where }: Row) => {
        const m = state.memos.find((x) => matches(where, view(x)));
        return m ? view(m) : null;
      }),
      updateMany: vi.fn(async ({ where, data }: Row) => {
        state.onUpdate?.();
        const rows = state.memos.filter((m) => matches(where, m));
        for (const m of rows) {
          const { version, ...rest } = data;
          Object.assign(m, rest);
          if (version?.increment) m.version += version.increment;
        }
        return { count: rows.length };
      }),
    },
    company: {
      findFirst: vi.fn(async ({ where }: Row) => state.companies.find((c) => c.id === where.id) ?? null),
      findMany: vi.fn(async () => state.companies),
    },
    portfolioCompany: {
      findUnique: vi.fn(async ({ where }: Row) => state.ledger.find((l) => l.id === where.id) ?? null),
      findMany: vi.fn(async () => state.ledger),
    },
  };
  return { db };
});

import { runBackfill } from "@/lib/memo-link-backfill";

const OWNER = { id: "u1", email: "sam@example.com" };
const T1 = new Date("2026-02-01T10:00:00Z");
const T2 = new Date("2026-03-05T12:30:00Z");
const memo = (id: string, pending: string | null, over: Row = {}): Row => ({
  id, title: `Memo ${id}`, ownerId: "u1", visibility: "TEAM", archivedAt: null, companyId: null, portfolioCompanyId: null,
  companyNamePending: pending, decision: "INVESTED", notionId: `n-${id}`, version: 1, updatedAt: T1, ...over,
});

beforeEach(() => {
  audit.logAdminAction.mockReset();
  state.onUpdate = null;
  state.companies = [
    { id: "c1", name: "Initech Group", aliases: [] },
    { id: "c2", name: "Hooli", aliases: [] },
    { id: "c3", name: "Hooli", aliases: [] }, // two Companies with one name: ambiguous
  ];
  state.ledger = [
    { id: "l1", name: "Globex", companyId: null },
    { id: "l2", name: "Initech Old Name", companyId: "c1" }, // the ledger row of a renamed Company
    { id: "l3", name: "Acme Labs", companyId: null },
  ];
  state.memos = [
    memo("a", "Globex"), // ledger only -> link
    memo("b", "Initech Old Name"), // ledger row with a Company -> link to the Company
    memo("c", "Hooli"), // two exact targets -> check by hand
    memo("d", "AcmeLabs"), // near only -> check by hand
    memo("e", "Umbrella", { decision: "PASSED" }), // nothing -> pending
    memo("f", "Globex", { ownerId: "u2" }), // someone else's -> skipped
    memo("g", "Globex", { archivedAt: new Date() }), // archived -> out of scope
    memo("h", null), // no pending name -> out of scope
    memo("i", "Globex", { companyId: "c1", companyNamePending: null }), // already linked -> out of scope
    memo("j", "Globex", { notionId: null }), // not imported
  ];
});

describe("runBackfill: dry run", () => {
  it("classifies link / check by hand / pending, skips others' memos, and writes nothing", async () => {
    const r = await runBackfill(OWNER, { write: false });
    const by = Object.fromEntries(r.rows.map((x) => [x.memoId, x]));
    expect(by.a).toMatchObject({ action: "link", target: { kind: "ledger", id: "l1" } });
    expect(by.b).toMatchObject({ action: "link", target: { kind: "company", id: "c1" } });
    expect(by.c.action).toBe("check");
    expect(by.c.candidates.map((x: { id: string }) => x.id).sort()).toEqual(["c2", "c3"]);
    expect(by.d).toMatchObject({ action: "check" });
    expect(by.d.candidates.map((x: { id: string }) => x.id)).toEqual(["l3"]);
    expect(by.e).toMatchObject({ action: "pending", target: null, candidates: [] });
    expect(by.f).toBeUndefined();
    expect(by.g).toBeUndefined();
    expect(by.h).toBeUndefined();
    expect(by.i).toBeUndefined();
    expect(r.skippedOtherOwner).toBe(1);
    expect(r.totals).toEqual({ link: 3, linkToCompany: 1, linkToLedger: 2, check: 2, pending: 1 });
    expect(r.written).toBeNull();
    expect(state.memos.find((m) => m.id === "a")).toMatchObject({ portfolioCompanyId: null, companyNamePending: "Globex", version: 1 });
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });

  it("--imported-only and --only narrow the scope", async () => {
    expect((await runBackfill(OWNER, { write: false, importedOnly: true })).rows.some((x) => x.memoId === "j")).toBe(false);
    expect((await runBackfill(OWNER, { write: false })).rows.some((x) => x.memoId === "j")).toBe(true);
    const one = await runBackfill(OWNER, { write: false, only: "e" });
    expect(one.rows.map((x) => x.memoId)).toEqual(["e"]);
  });
});

describe("runBackfill: write", () => {
  it("links only the confident rows, keeps updatedAt, bumps version, audits ids with source backfill", async () => {
    const r = await runBackfill(OWNER, { write: true });
    expect(r.written).toEqual({ linked: 3, stale: 0, failed: 0 });
    const m = (id: string) => state.memos.find((x) => x.id === id)!;
    expect(m("a")).toMatchObject({ portfolioCompanyId: "l1", companyId: null, companyNamePending: null, version: 2, updatedAt: T1 });
    expect(m("b")).toMatchObject({ companyId: "c1", portfolioCompanyId: null, companyNamePending: null, version: 2, updatedAt: T1 });
    expect(m("j")).toMatchObject({ portfolioCompanyId: "l1", version: 2 });
    for (const id of ["c", "d", "e", "f"]) expect(m(id)).toMatchObject({ companyId: null, portfolioCompanyId: null, version: 1 });
    const calls = audit.logAdminAction.mock.calls.filter((c) => c[1] === "MEMO_COMPANY_LINKED");
    expect(calls.map((c) => c[2].metadata)).toEqual([
      { memoId: "a", portfolioCompanyId: "l1", source: "backfill" },
      { memoId: "b", companyId: "c1", source: "backfill" },
      { memoId: "j", portfolioCompanyId: "l1", source: "backfill" },
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/Globex|Initech|Memo /);
  });

  it("re-running after a write finds 0 to link", async () => {
    await runBackfill(OWNER, { write: true });
    const again = await runBackfill(OWNER, { write: false });
    expect(again.totals.link).toBe(0);
    expect(again.totals.check).toBe(2);
  });

  it("a memo edited meanwhile is reported stale, not retried or forced", async () => {
    state.onUpdate = () => {
      // Someone edits memo "a" between the read and the write: its version moves on.
      const a = state.memos.find((x) => x.id === "a")!;
      if (a.version === 1) a.version = 2;
    };
    const r = await runBackfill(OWNER, { write: true });
    const a = r.rows.find((x) => x.memoId === "a")!;
    expect(a.result).toBe("stale");
    expect(r.written).toMatchObject({ stale: 1 });
    expect(state.memos.find((x) => x.id === "a")).toMatchObject({ portfolioCompanyId: null, companyNamePending: "Globex" });
  });

  it("another owner's memo is never written, even with its id", async () => {
    const r = await runBackfill(OWNER, { write: true, only: "f" });
    expect(r.rows).toEqual([]);
    expect(r.skippedOtherOwner).toBe(1);
    expect(state.memos.find((x) => x.id === "f")).toMatchObject({ portfolioCompanyId: null });
  });
});
