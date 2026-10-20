import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 41 (WS134): importMemo against a small fake database (the memo-routes.test.ts style).
// Synthetic data only (Acme, Globex, Jane Founder).

const audit = vi.hoisted(() => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/audit", () => audit);

type Row = Record<string, any>;
const state = vi.hoisted(() => ({
  memos: [] as Row[],
  revisions: [] as Row[],
  companies: [] as Row[],
  raceOnce: false,
}));

vi.mock("@/lib/db", () => {
  const memo = {
    findUnique: vi.fn(async ({ where }: Row) => state.memos.find((m) => m.notionId === where.notionId) ?? null),
    create: vi.fn(async ({ data }: Row) => {
      if (state.raceOnce) {
        state.raceOnce = false;
        state.memos.push({ id: "winner", notionId: data.notionId, sections: [] });
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
      if (state.memos.some((m) => m.notionId === data.notionId)) throw Object.assign(new Error("unique"), { code: "P2002" });
      const { sections, ...rest } = data;
      const id = `m${state.memos.length + 1}`;
      const row: Row = { id, version: 1, createdAt: new Date("2026-10-20T00:00:00Z"), updatedAt: new Date("2026-10-20T00:00:00Z"), ...rest, sections: [] };
      state.memos.push(row);
      sections.create.forEach((s: Row, i: number) => {
        const { revisions, ...sr } = s;
        const sec = { id: `${id}-s${i}`, ...sr };
        row.sections.push(sec);
        for (const r of revisions.create) state.revisions.push({ sectionId: sec.id, ...r });
      });
      return row;
    }),
  };
  return {
    db: {
      memo,
      company: { findMany: vi.fn(async () => state.companies) },
    },
  };
});

import { db } from "@/lib/db";
import { importMemo } from "@/lib/memo-actions";
import { parseNotionPage, statusForDecision, type NotionMemoDraft } from "@/lib/notion-memo-import";

const ACTOR = { id: "u1", email: "sam@example.com" };
const ID = "0123456789abcdef0123456789abcdef";

function draft(over: Partial<NotionMemoDraft> = {}): NotionMemoDraft {
  return {
    notionId: ID,
    title: "Acme",
    decision: "INVESTED",
    source: "VC Intro",
    tags: ["Fintech"],
    introDate: "2025-10-03",
    lastEdited: new Date("2026-03-02T12:00:00.000Z"),
    websiteUrl: "https://acme.example.com",
    introCalls: [{ label: "Intro call", date: "2025-10-03", url: "https://example.com/call" }],
    sections: [
      { key: "team", title: "Team", markdown: "Jane Founder (CEO).", citations: [{ label: "Deck", kind: "deck", url: "https://example.com/deck" }], includeInShare: true },
      { key: "open-questions", title: "Open Questions", markdown: "Churn?", citations: [], includeInShare: false },
    ],
    deck: null,
    splitMode: "###",
    warnings: [],
    ...over,
  };
}

beforeEach(() => {
  state.memos = [];
  state.revisions = [];
  state.companies = [];
  state.raceOnce = false;
  audit.logAdminAction.mockReset();
  vi.mocked(db.memo.create).mockClear();
});

describe("importMemo", () => {
  it("creates a TEAM memo owned by the actor with the given status, decision, notionId and Notion's date", async () => {
    const r = await importMemo(ACTOR, draft(), { status: "FINAL" });
    expect(r).toEqual({ ok: true, value: { id: "m1", duplicate: false, linkedCompany: false } });
    const data = vi.mocked(db.memo.create).mock.calls[0][0].data as Row;
    expect(data).toMatchObject({
      ownerId: "u1",
      visibility: "TEAM",
      status: "FINAL",
      decision: "INVESTED",
      notionId: ID,
      templateVersion: null,
      draftedByMarge: false,
      source: "VC Intro",
      tags: ["Fintech"],
      websiteUrl: "https://acme.example.com",
      companyNamePending: "Acme",
      companyId: null,
    });
    expect(data.updatedAt).toEqual(new Date("2026-03-02T12:00:00.000Z"));
    expect(data.createdAt).toEqual(new Date("2026-03-02T12:00:00.000Z"));
    expect(data.introDate).toEqual(new Date("2025-10-03T00:00:00.000Z"));
    expect(state.memos[0].updatedAt).toEqual(new Date("2026-03-02T12:00:00.000Z"));
  });

  it("without a Notion date, createdAt and updatedAt are left to the database", async () => {
    await importMemo(ACTOR, draft({ lastEdited: null }), { status: "DRAFT" });
    const data = vi.mocked(db.memo.create).mock.calls[0][0].data as Row;
    expect(data).not.toHaveProperty("createdAt");
    expect(data).not.toHaveProperty("updatedAt");
  });

  it("writes one revision per section marked 'notion', the share flag per section, positions in order", async () => {
    await importMemo(ACTOR, draft(), { status: "IN_REVIEW" });
    const m = state.memos[0];
    expect(m.sections.map((s: Row) => [s.key, s.position, s.includeInShare, s.updatedVia])).toEqual([
      ["team", 0, true, "notion"],
      ["open-questions", 1, false, "notion"],
    ]);
    expect(state.revisions.map((r) => [r.version, r.via, r.includeInShare, r.editedById])).toEqual([
      [1, "notion", true, "u1"],
      [1, "notion", false, "u1"],
    ]);
    expect(m.sections[0].citations).toEqual([{ label: "Deck", kind: "deck", url: "https://example.com/deck" }]);
  });

  it("a second import of the same notionId is a duplicate and writes no second row", async () => {
    await importMemo(ACTOR, draft(), { status: "FINAL" });
    const again = await importMemo(ACTOR, draft(), { status: "FINAL" });
    expect(again).toEqual({ ok: true, value: { id: "m1", duplicate: true, linkedCompany: false } });
    expect(state.memos).toHaveLength(1);
    expect(db.memo.create).toHaveBeenCalledTimes(1);
    expect(audit.logAdminAction).toHaveBeenCalledTimes(1);
  });

  it("a parallel run that wins the unique notionId is reported as a duplicate", async () => {
    state.raceOnce = true;
    const r = await importMemo(ACTOR, draft(), { status: "FINAL" });
    expect(r).toEqual({ ok: true, value: { id: "winner", duplicate: true, linkedCompany: false } });
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });

  it("a unique company match links it (pending cleared); no match or two matches stays pending", async () => {
    state.companies = [{ id: "c1", name: "Acme", aliases: [] }];
    const linked = await importMemo(ACTOR, draft(), { status: "FINAL" });
    expect(linked).toMatchObject({ ok: true, value: { linkedCompany: true } });
    expect(state.memos[0]).toMatchObject({ companyId: "c1", companyNamePending: null });

    state.companies = [{ id: "c2", name: "Globex", aliases: [] }];
    await importMemo(ACTOR, draft({ notionId: "f".repeat(32) }), { status: "FINAL" });
    expect(state.memos[1]).toMatchObject({ companyId: null, companyNamePending: "Acme" });

    state.companies = [{ id: "c1", name: "Acme", aliases: [] }, { id: "c3", name: "ACME Inc", aliases: ["Acme"] }];
    await importMemo(ACTOR, draft({ notionId: "e".repeat(32) }), { status: "FINAL" });
    expect(state.memos[2]).toMatchObject({ companyId: null, companyNamePending: "Acme" });
  });

  it("audits MEMO_IMPORTED with ids and counts only (canary), and never MEMO_CREATED", async () => {
    const C = "CANARY-5c1d";
    state.companies = [{ id: "c1", name: `Co ${C}`, aliases: [] }];
    await importMemo(
      ACTOR,
      draft({
        title: `Co ${C}`,
        tags: [`tag ${C}`],
        websiteUrl: `https://example.com/${C}`,
        sections: [{ key: "team", title: `Team ${C}`, markdown: `Body ${C}`, citations: [{ label: `Cite ${C}`, kind: "call" }], includeInShare: true }],
      }),
      { status: "FINAL" }
    );
    const calls = audit.logAdminAction.mock.calls;
    expect(calls.map((c) => c[1])).toEqual(["MEMO_IMPORTED"]);
    expect(calls[0][2]).toEqual({ targetType: "Memo", targetId: "m1", metadata: { memoId: "m1", sectionCount: 1, linkedCompany: true, source: "notion" } });
    expect(JSON.stringify(calls)).not.toContain("CANARY");
  });

  it("validates again: bad sections, a bad decision, a bad status and a bad id are 400s that write nothing", async () => {
    const bad = (d: NotionMemoDraft, status: any = "FINAL") => importMemo(ACTOR, d, { status });
    expect(await bad(draft({ sections: [] }))).toMatchObject({ ok: false, status: 400, error: "A memo needs at least one section." });
    expect(await bad(draft({ decision: "MAYBE" as never }))).toMatchObject({ ok: false, status: 400, error: "That decision isn't one of the options." });
    expect(await bad(draft({ title: "" }))).toMatchObject({ ok: false, status: 400 });
    expect(await bad(draft(), "ARCHIVED")).toMatchObject({ ok: false, status: 400 });
    expect(await bad(draft({ notionId: "nope" }))).toMatchObject({ ok: false, status: 400 });
    expect(await bad(draft({ source: "Billboard" as never }))).toMatchObject({ ok: false, status: 400, error: "That source isn't one of the options." });
    expect(db.memo.create).not.toHaveBeenCalled();
  });

  it("end to end with the parser: a synthetic page imports with the Q127 status", async () => {
    const text = `# Globex\n\nDecision: Memo\nLast Edit: April 28, 2026 12:20 PM\n\n### Team\n\n${"Jane Founder leads the company. ".repeat(12)}`;
    const parsed = parseNotionPage(`Globex ${ID}.md`, text);
    if (parsed.kind !== "memo") throw new Error("expected a memo");
    const r = await importMemo(ACTOR, parsed.draft, { status: statusForDecision(parsed.draft.decision) });
    expect(r).toMatchObject({ ok: true, value: { duplicate: false } });
    expect(state.memos[0]).toMatchObject({ status: "IN_REVIEW", decision: "MEMO", title: "Globex" });
  });
});
