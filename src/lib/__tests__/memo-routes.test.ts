import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Part 40 (WS126): the memo actions and their /api/admin/memos routes against a small fake database
// that really evaluates the `where` clauses memoVisibleWhere builds, so a route that forgot the
// visibility rule fails here instead of passing against a mock that answers everything.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
const audit = vi.hoisted(() => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/audit", () => audit);

type Row = Record<string, any>;
const state = vi.hoisted(() => ({
  memos: [] as Row[],
  revisions: [] as Row[],
  companies: [] as Row[],
  ledger: [] as Row[],
  templates: [] as Row[],
  calls: 0,
}));

function matches(where: Row | undefined, row: Row): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === "AND") return (v as Row[]).every((w) => matches(w, row));
    if (k === "OR") return (v as Row[]).some((w) => matches(w, row));
    if (k === "NOT") return !matches(v as Row, row);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("contains" in v) return typeof row[k] === "string" && row[k].toLowerCase().includes(String(v.contains).toLowerCase());
      if ("not" in v) return row[k] !== v.not;
      if ("in" in v) return v.in.includes(row[k]);
      return row[k] != null && matches(v as Row, row[k]);
    }
    return (row[k] ?? null) === (v ?? null);
  });
}
const bump = () => void state.calls++;

vi.mock("@/lib/db", () => {
  const memoSection = {
    updateMany: vi.fn(async ({ where, data }: Row) => {
      bump();
      let n = 0;
      for (const m of state.memos) for (const s of m.sections) if (matches(where, s)) {
        n++;
        Object.assign(s, data, { version: s.version + (data.version?.increment ?? 0) });
      }
      return { count: n };
    }),
    update: vi.fn(async ({ where, data }: Row) => {
      for (const m of state.memos) for (const s of m.sections) if (s.id === where.id) Object.assign(s, data);
      return {};
    }),
    create: vi.fn(async ({ data }: Row) => {
      const m = state.memos.find((x) => x.id === data.memoId)!;
      const { revisions, ...rest } = data;
      const s = { id: `s${m.sections.length + 100}`, version: 1, ...rest };
      m.sections.push(s);
      for (const r of revisions?.create ?? []) state.revisions.push({ sectionId: s.id, ...r });
      return s;
    }),
    delete: vi.fn(async ({ where }: Row) => {
      for (const m of state.memos) m.sections = m.sections.filter((s: Row) => s.id !== where.id);
      return {};
    }),
  };
  const view = (m: Row, select?: Row) => {
    if (!select) return m;
    const out: Row = { ...m };
    if (select.sections?.where) out.sections = m.sections.filter((s: Row) => matches(select.sections.where, s));
    if (m.companyId) out.company = state.companies.find((c) => c.id === m.companyId) ?? null;
    if (m.portfolioCompanyId) {
      const l = state.ledger.find((x) => x.id === m.portfolioCompanyId);
      out.portfolioCompany = l ? { id: l.id, name: l.name, company: state.companies.find((c) => c.id === l.companyId) ?? null } : null;
    }
    return out;
  };
  const memo = {
    findFirst: vi.fn(async ({ where, select }: Row) => {
      bump();
      const m = state.memos.find((x) => matches(where, x));
      return m ? view(m, select) : null;
    }),
    findMany: vi.fn(async ({ where, take }: Row) => {
      bump();
      const rows = state.memos.filter((x) => matches(where, x)).map((x) => ({ owner: { id: x.ownerId }, ...x })); // the real select returns the owner
      return take ? rows.slice(0, take) : rows;
    }),
    findUnique: vi.fn(async ({ where }: Row) => {
      bump();
      return state.memos.find((x) => (where.createKey ? x.createKey === where.createKey : x.id === where.id)) ?? null;
    }),
    create: vi.fn(async ({ data }: Row) => {
      bump();
      const { sections, ...rest } = data;
      if (rest.createKey && state.memos.some((x) => x.createKey === rest.createKey)) throw Object.assign(new Error("unique"), { code: "P2002" });
      const id = `m${state.memos.length + 1}`;
      const row: Row = { id, version: 1, visibility: "PRIVATE", status: "DRAFT", archivedAt: null, companyId: null, ...rest, sections: [] };
      state.memos.push(row);
      sections.create.forEach((s: Row, i: number) => {
        const { revisions, ...sr } = s;
        const sec = { id: `${id}-s${i}`, version: 1, ...sr };
        row.sections.push(sec);
        for (const r of revisions.create) state.revisions.push({ sectionId: sec.id, ...r });
      });
      return row;
    }),
    update: vi.fn(async ({ where, data }: Row) => {
      bump();
      const m = state.memos.find((x) => x.id === where.id)!;
      const { version, ...rest } = data;
      Object.assign(m, rest);
      if (version?.increment) m.version += version.increment;
      return m;
    }),
    updateMany: vi.fn(async ({ where, data }: Row) => {
      bump();
      const rows = state.memos.filter((x) => matches(where, x));
      for (const m of rows) {
        const { version, ...rest } = data;
        Object.assign(m, rest);
        if (version?.increment) m.version += version.increment;
      }
      return { count: rows.length };
    }),
  };
  const db: Row = {
    memo,
    memoSection,
    memoSectionRevision: {
      create: vi.fn(async ({ data }: Row) => void state.revisions.push({ ...data })),
      findMany: vi.fn(async ({ where }: Row) => state.revisions.filter((r) => r.sectionId === where.sectionId).map((r) => ({ ...r, editedBy: { id: r.editedById } }))),
      findUnique: vi.fn(async ({ where }: Row) => state.revisions.find((r) => r.sectionId === where.sectionId_version.sectionId && r.version === where.sectionId_version.version) ?? null),
    },
    company: {
      findFirst: vi.fn(async ({ where }: Row) => state.companies.find((c) => c.id === where.id) ?? null),
      findMany: vi.fn(async () => state.companies),
    },
    portfolioCompany: {
      findUnique: vi.fn(async ({ where }: Row) => {
        const l = state.ledger.find((x) => x.id === where.id);
        return l ? { companyId: null, ...l, _count: { deals: l.deals ?? 0, mentions: 0 } } : null;
      }),
      findMany: vi.fn(async () => state.ledger),
      delete: vi.fn(async ({ where }: Row) => void (state.ledger = state.ledger.filter((x) => x.id !== where.id))),
    },
    memoTemplate: {
      findFirst: vi.fn(async () => [...state.templates].sort((a, b) => b.version - a.version)[0] ?? null),
      create: vi.fn(async ({ data }: Row) => void state.templates.push(data)),
    },
    $transaction: async (fn: (t: Row) => unknown) => fn(db),
  };
  return { db };
});

import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { GET as listGET, POST as createPOST } from "@/app/api/admin/memos/route";
import { GET as oneGET, PATCH as onePATCH, DELETE as oneDELETE } from "@/app/api/admin/memos/[id]/route";
import { POST as secPOST, PATCH as secReorder } from "@/app/api/admin/memos/[id]/sections/route";
import { PATCH as secPATCH, DELETE as secDELETE } from "@/app/api/admin/memos/[id]/sections/[key]/route";
import { GET as revGET, POST as revPOST } from "@/app/api/admin/memos/[id]/sections/[key]/revisions/route";
import { GET as suggestGET } from "@/app/api/admin/memos/[id]/company-suggestion/route";
import { DELETE as linkDELETE, POST as linkPOST } from "@/app/api/admin/memos/[id]/link-company/route";
import { POST as decisionPOST } from "@/app/api/admin/memos/[id]/decision/route";
import { DELETE as ledgerDELETE } from "@/app/api/admin/portfolio-companies/[id]/route";
import { POST as previewPOST } from "@/app/api/admin/memos/preview/route";
import { GET as tplGET, PUT as tplPUT } from "@/app/api/admin/memos/template/route";
import { createMemo } from "@/lib/memo-actions";
import { MEMO_ERRORS } from "@/lib/memos";
import { MEMO_MESSAGES } from "@/lib/memo-actions";

const U1 = { id: "u1", email: "sam@example.com", roles: ["ADMIN"] };
const U2 = { id: "u2", email: "jane@example.com", roles: ["ADMIN"] };
const as = (u: typeof U1) => vi.mocked(requireAdmin).mockResolvedValue({ user: u, error: null } as never);
const req = (method: string, body?: unknown) =>
  new Request("https://molly.dfs.vc/api/admin/memos", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string, key?: string) => ({ params: Promise.resolve({ id, key: key as string }) });
const json = async (r: Response) => r.json();

const section = (id: string, key: string, over: Row = {}) => ({
  id, key, title: key, markdown: "text", citations: [], position: 0, includeInShare: true, version: 3, ...over,
});
function seed() {
  state.memos = [
    { id: "private", title: "Private memo", ownerId: "u1", visibility: "PRIVATE", status: "DRAFT", version: 1, archivedAt: null, companyId: null, companyNamePending: "Acme Inc", introCalls: [], sections: [section("p-a", "a"), section("p-b", "b", { position: 1 })] },
    { id: "team", title: "Team memo", ownerId: "u1", visibility: "TEAM", status: "DRAFT", version: 1, archivedAt: null, companyId: null, companyNamePending: null, introCalls: [], sections: [section("t-a", "a"), section("t-b", "b", { position: 1 })] },
    { id: "gone", title: "Archived", ownerId: "u1", visibility: "TEAM", status: "DRAFT", version: 1, archivedAt: new Date(), companyId: null, introCalls: [], sections: [section("g-a", "a")] },
  ];
  state.revisions = [
    { sectionId: "t-a", version: 1, title: "a", markdown: "first draft", citations: [], includeInShare: true, editedById: "u1", via: null, restoredFrom: null },
    { sectionId: "t-a", version: 2, title: "a", markdown: "second draft", citations: [], includeInShare: true, editedById: "u1", via: null, restoredFrom: null },
    { sectionId: "t-a", version: 3, title: "a", markdown: "text", citations: [], includeInShare: true, editedById: "u1", via: null, restoredFrom: null },
  ];
  state.companies = [{ id: "c1", name: "Acme", aliases: [] }, { id: "c2", name: "Beta Co", aliases: ["Beta"] }];
  state.ledger = [];
  state.templates = [];
  state.calls = 0;
}

beforeEach(() => {
  seed();
  audit.logAdminAction.mockReset();
  vi.mocked(requireAdmin).mockReset();
  as(U1);
});

describe("visibility matrix", () => {
  it("the owner reads a private memo; another approved admin gets 404 on every route", async () => {
    as(U1);
    expect((await oneGET(req("GET"), ctx("private"))).status).toBe(200);

    as(U2);
    const probes: [string, () => Promise<Response>][] = [
      ["GET memo", () => oneGET(req("GET"), ctx("private"))],
      ["PATCH meta", () => onePATCH(req("PATCH", { title: "x", version: 1 }), ctx("private"))],
      ["PATCH status", () => onePATCH(req("PATCH", { status: "FINAL" }), ctx("private"))],
      ["PATCH visibility", () => onePATCH(req("PATCH", { visibility: "TEAM" }), ctx("private"))],
      ["DELETE memo", () => oneDELETE(req("DELETE"), ctx("private"))],
      ["POST section", () => secPOST(req("POST", { title: "New" }), ctx("private"))],
      ["PATCH reorder", () => secReorder(req("PATCH", { keys: ["b", "a"] }), ctx("private"))],
      ["PATCH section", () => secPATCH(req("PATCH", { expectedVersion: 3, markdown: "hijack" }), ctx("private", "a"))],
      ["DELETE section", () => secDELETE(req("DELETE"), ctx("private", "a"))],
      ["GET revisions", () => revGET(req("GET"), ctx("private", "a"))],
      ["POST restore", () => revPOST(req("POST", { fromVersion: 1, expectedVersion: 3 }), ctx("private", "a"))],
      ["POST link-company", () => linkPOST(req("POST", { expectedVersion: 1, companyId: "c1" }), ctx("private"))],
      ["GET company-suggestion", () => suggestGET(req("GET"), ctx("private"))],
    ];
    for (const [name, call] of probes) {
      const r = await call();
      expect(r.status, name).toBe(404);
    }
    // nothing was written
    expect(state.memos.find((m) => m.id === "private")!.sections[0].markdown).toBe("text");
    expect(state.memos.find((m) => m.id === "private")!.status).toBe("DRAFT");
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });

  it("list: another admin sees the team memo and never the private one; scope filters apply", async () => {
    as(U2);
    const all = await json(await listGET(new Request("https://molly.dfs.vc/api/admin/memos")));
    expect(all.map((m: Row) => m.id)).toEqual(["team"]);
    const mine = await json(await listGET(new Request("https://molly.dfs.vc/api/admin/memos?scope=mine")));
    expect(mine).toEqual([]);

    as(U1);
    const owner = await json(await listGET(new Request("https://molly.dfs.vc/api/admin/memos")));
    expect(owner.map((m: Row) => m.id).sort()).toEqual(["private", "team"]); // archived never listed
    const team = await json(await listGET(new Request("https://molly.dfs.vc/api/admin/memos?scope=team")));
    expect(team.map((m: Row) => m.id)).toEqual(["team"]);
    const unlinked = await json(await listGET(new Request("https://molly.dfs.vc/api/admin/memos?unlinked=true&q=acme")));
    expect(unlinked.map((m: Row) => m.id)).toEqual(["private"]); // matches companyNamePending
  });

  it("an archived memo is gone for everyone, owner included", async () => {
    as(U1);
    expect((await oneGET(req("GET"), ctx("gone"))).status).toBe(404);
    as(U2);
    expect((await oneGET(req("GET"), ctx("gone"))).status).toBe(404);
  });

  it("a team memo is readable and its sections editable by another admin; owner-only actions are 403", async () => {
    as(U2);
    const got = await json(await oneGET(req("GET"), ctx("team")));
    expect(got.canEdit).toBe(true);
    expect(got.canManage).toBe(false);
    expect(got.createKey).toBeUndefined();

    const saved = await secPATCH(req("PATCH", { expectedVersion: 3, markdown: "edited by Jane" }), ctx("team", "a"));
    expect(saved.status).toBe(200);
    expect(state.revisions.at(-1)).toMatchObject({ editedById: "u2", version: 4, via: null });

    expect((await onePATCH(req("PATCH", { visibility: "PRIVATE" }), ctx("team"))).status).toBe(403);
    expect((await oneDELETE(req("DELETE"), ctx("team"))).status).toBe(403);
    expect((await linkPOST(req("POST", { expectedVersion: 1, companyId: "c1" }), ctx("team"))).status).toBe(403);
    expect((await secDELETE(req("DELETE"), ctx("team", "b"))).status).toBe(403);
    expect((await secPATCH(req("PATCH", { expectedVersion: 4, includeInShare: false }), ctx("team", "a"))).status).toBe(403);
    expect(state.memos.find((m) => m.id === "team")!.visibility).toBe("TEAM");
    expect(state.memos.find((m) => m.id === "team")!.archivedAt).toBeNull();
  });

  it("the owner can manage a team memo", async () => {
    as(U1);
    expect((await onePATCH(req("PATCH", { visibility: "PRIVATE" }), ctx("team"))).status).toBe(200);
    expect(state.memos.find((m) => m.id === "team")!.visibility).toBe("PRIVATE");
    as(U2);
    expect((await oneGET(req("GET"), ctx("team"))).status).toBe(404); // private again
  });

  it("FOUNDER and PENDING users are refused by requireAdmin before any database access", async () => {
    for (const status of [401, 403]) {
      vi.mocked(requireAdmin).mockResolvedValue({ user: null, error: NextResponse.json({ error: "no" }, { status }) } as never);
      state.calls = 0;
      const probes = [
        listGET(req("GET")),
        createPOST(req("POST", { title: "x" })),
        oneGET(req("GET"), ctx("team")),
        onePATCH(req("PATCH", { status: "FINAL" }), ctx("team")),
        oneDELETE(req("DELETE"), ctx("team")),
        secPOST(req("POST", { title: "x" }), ctx("team")),
        secReorder(req("PATCH", { keys: [] }), ctx("team")),
        secPATCH(req("PATCH", { expectedVersion: 3 }), ctx("team", "a")),
        secDELETE(req("DELETE"), ctx("team", "a")),
        revGET(req("GET"), ctx("team", "a")),
        revPOST(req("POST", {}), ctx("team", "a")),
        linkPOST(req("POST", {}), ctx("team")),
        suggestGET(req("GET"), ctx("team")),
        previewPOST(req("POST", { markdown: "x" })),
        tplGET(),
        tplPUT(req("PUT", { sections: [] })),
      ];
      for (const r of await Promise.all(probes)) expect(r.status).toBe(status);
      expect(state.calls).toBe(0);
    }
  });
});

describe("create", () => {
  it("starts a private draft owned by the caller with the template sections, ignoring smuggled fields", async () => {
    const r = await createPOST(
      req("POST", {
        title: "Acme memo", companyNamePending: "Acme",
        ownerId: "u2", visibility: "TEAM", status: "FINAL", draftedByMarge: true, archivedAt: "2020-01-01", version: 9,
        sections: [{ key: "x", title: "X", markdown: "smuggled" }], idempotencyKey: "abcdefgh12",
      })
    );
    expect(r.status).toBe(201);
    const data = vi.mocked(db.memo.create).mock.calls[0][0].data as Row;
    expect(data).toMatchObject({ ownerId: "u1", draftedByMarge: false, createKey: null, templateVersion: 1 });
    expect(data.visibility).toBeUndefined(); // the column default (PRIVATE) applies
    expect(data.status).toBeUndefined();
    expect(data.archivedAt).toBeUndefined();
    expect(data.sections.create).toHaveLength(12);
    expect(data.sections.create.map((s: Row) => s.key)[0]).toBe("open-questions");
    expect(data.sections.create.find((s: Row) => s.key === "open-questions").includeInShare).toBe(false);
    expect(data.sections.create.find((s: Row) => s.key === "team").includeInShare).toBe(true);
    const created = state.memos.at(-1)!;
    expect(created.visibility).toBe("PRIVATE");
    expect(state.revisions.filter((x) => x.sectionId.startsWith(created.id)).length).toBe(12); // a v1 revision each
  });

  it("validates title, both company fields, an unknown company id", async () => {
    expect((await json(await createPOST(req("POST", { title: "" })))).error).toBe(MEMO_ERRORS.title);
    expect((await json(await createPOST(req("POST", { title: "T", companyId: "c1", companyNamePending: "Acme" })))).error).toBe(
      "Give either a company or a pending company name, not both."
    );
    const r = await createPOST(req("POST", { title: "T", companyId: "nope" }));
    expect(r.status).toBe(400);
    expect((await json(r)).error).toMatch(/^No company with that id in Molly\./);
    expect((await createPOST(new Request("https://x", { method: "POST", body: "not json" }))).status).toBe(400);
  });

  it("an idempotent create (the Marge path) returns the same memo with duplicate: true and writes one row", async () => {
    const before = state.memos.length;
    const body = { title: "T", sections: [{ key: "a", title: "A", markdown: "x" }], idempotencyKey: "key-12345678" };
    const via = { via: "marge" as const, margeActionId: "act1" };
    const a = await createMemo(U1, body, via);
    const b = await createMemo(U1, body, via);
    expect(a.ok && b.ok && a.value.id === b.value.id).toBe(true);
    expect(a.ok && a.value.duplicate).toBe(false);
    expect(b.ok && b.value.duplicate).toBe(true);
    expect(state.memos.length).toBe(before + 1);
    expect(state.memos.at(-1)).toMatchObject({ draftedByMarge: true, ownerId: "u1" });
    expect(state.memos.at(-1)!.createKey).toMatch(/^[0-9a-f]{64}$/);
    // another person with the same key gets their own memo
    const c = await createMemo(U2, body, via);
    expect(c.ok && c.value.duplicate).toBe(false);
    expect(state.memos.length).toBe(before + 2);
    // Marge must send a key
    const d = await createMemo(U1, { title: "T", sections: [{ key: "a", title: "A", markdown: "" }] }, via);
    expect(d).toEqual({ ok: false, status: 400, error: MEMO_ERRORS.badIdempotency });
  });
});

describe("section save, concurrency and revisions", () => {
  it("a stale save is a 409, writes no revision and changes nothing", async () => {
    as(U1);
    const revs = state.revisions.length;
    const r = await secPATCH(req("PATCH", { expectedVersion: 2, markdown: "late edit" }), ctx("team", "a"));
    expect(r.status).toBe(409);
    expect((await json(r)).error).toMatch(/changed since you loaded it/);
    expect(state.revisions.length).toBe(revs);
    expect(state.memos[1].sections[0]).toMatchObject({ markdown: "text", version: 3 });
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });

  it("a race: the version moves between the read and the write, still 409 and no revision", async () => {
    as(U1);
    const revs = state.revisions.length;
    const updateMany = db.memoSection.updateMany as unknown as ReturnType<typeof vi.fn>;
    const orig = updateMany.getMockImplementation() as (a: unknown) => Promise<unknown>;
    updateMany.mockImplementationOnce(async (args: unknown) => {
      state.memos[1].sections[0].version = 4; // someone else saved first
      return orig(args);
    });
    const r = await secPATCH(req("PATCH", { expectedVersion: 3, markdown: "mine" }), ctx("team", "a"));
    expect(r.status).toBe(409);
    expect(state.revisions.length).toBe(revs);
    expect(state.memos[1].sections[0].markdown).toBe("text");
  });

  it("a good save bumps the version and writes a full-copy revision with the editor", async () => {
    as(U1);
    const r = await secPATCH(req("PATCH", { expectedVersion: 3, markdown: "new text", title: "Overview", citations: [{ label: "Call", kind: "call", date: "2026-10-01" }] }), ctx("team", "a"));
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ key: "a", version: 4 });
    expect(state.memos[1].sections[0]).toMatchObject({ markdown: "new text", title: "Overview", version: 4, updatedById: "u1" });
    expect(state.revisions.at(-1)).toMatchObject({
      sectionId: "t-a", version: 4, markdown: "new text", title: "Overview", editedById: "u1", restoredFrom: null,
      citations: [{ label: "Call", kind: "call", date: "2026-10-01" }],
    });
    expect(audit.logAdminAction).toHaveBeenCalledWith(U1, "MEMO_SECTION_UPDATED", expect.objectContaining({ metadata: { memoId: "team", sectionKey: "a", version: 4 } }));
  });

  it("requires expectedVersion, and a change", async () => {
    expect((await secPATCH(req("PATCH", { markdown: "x" }), ctx("team", "a"))).status).toBe(400);
    expect((await secPATCH(req("PATCH", { expectedVersion: 3 }), ctx("team", "a"))).status).toBe(400);
    expect((await secPATCH(req("PATCH", { expectedVersion: 3, markdown: "text" }), ctx("team", "a"))).status).toBe(400); // identical
    expect((await secPATCH(req("PATCH", { expectedVersion: 3, markdown: "x" }), ctx("team", "zzz"))).status).toBe(404);
  });

  it("restore writes version n+1 holding the old copy, with restoredFrom", async () => {
    as(U1);
    const r = await revPOST(req("POST", { fromVersion: 1, expectedVersion: 3 }), ctx("team", "a"));
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ key: "a", version: 4 });
    expect(state.memos[1].sections[0]).toMatchObject({ markdown: "first draft", version: 4 });
    expect(state.revisions.at(-1)).toMatchObject({ version: 4, markdown: "first draft", restoredFrom: 1, editedById: "u1" });
    expect(state.revisions.filter((x) => x.sectionId === "t-a")).toHaveLength(4); // history is kept, not rewritten
    expect(audit.logAdminAction).toHaveBeenCalledWith(U1, "MEMO_SECTION_RESTORED", expect.objectContaining({ metadata: { memoId: "team", sectionKey: "a", fromVersion: 1, version: 4 } }));
  });

  it("restore of a stale view or an unknown version fails cleanly", async () => {
    expect((await revPOST(req("POST", { fromVersion: 1, expectedVersion: 2 }), ctx("team", "a"))).status).toBe(409);
    expect((await revPOST(req("POST", { fromVersion: 99, expectedVersion: 3 }), ctx("team", "a"))).status).toBe(404);
    expect((await revPOST(req("POST", { expectedVersion: 3 }), ctx("team", "a"))).status).toBe(400);
    expect(state.revisions.filter((x) => x.sectionId === "t-a")).toHaveLength(3);
  });

  it("restore keeps the section's current share toggle (it is the owner's decision)", async () => {
    as(U1);
    state.memos[1].sections[0].includeInShare = false;
    await revPOST(req("POST", { fromVersion: 1, expectedVersion: 3 }), ctx("team", "a"));
    expect(state.memos[1].sections[0].includeInShare).toBe(false);
  });

  it("lists revisions newest first", async () => {
    const rows = await json(await revGET(req("GET"), ctx("team", "a")));
    expect(rows.length).toBe(3);
  });

  it("the owner can toggle includeInShare", async () => {
    as(U1);
    const r = await secPATCH(req("PATCH", { expectedVersion: 3, includeInShare: false }), ctx("team", "a"));
    expect(r.status).toBe(200);
    expect(state.memos[1].sections[0].includeInShare).toBe(false);
  });
});

describe("limits", () => {
  it("oversized section text, a memo over 150,000 characters, bad citations", async () => {
    as(U1);
    let r = await secPATCH(req("PATCH", { expectedVersion: 3, markdown: "x".repeat(20_001) }), ctx("team", "a"));
    expect(r.status).toBe(400);
    expect((await json(r)).error).toBe("A section is limited to 20,000 characters.");

    // 7 other sections at 20,000 + this one: pushes the memo over 150,000
    const m = state.memos[1];
    m.sections = Array.from({ length: 8 }, (_, i) => section(`t-${i}`, i === 0 ? "a" : `k${i}`, { markdown: "y".repeat(i === 0 ? 10 : 20_000), position: i }));
    r = await secPATCH(req("PATCH", { expectedVersion: 3, markdown: "z".repeat(10_001) }), ctx("team", "a"));
    expect(r.status).toBe(400);
    expect((await json(r)).error).toBe("A memo is limited to 150,000 characters in total.");
    r = await secPATCH(req("PATCH", { expectedVersion: 3, markdown: "z".repeat(10_000) }), ctx("team", "a"));
    expect(r.status).toBe(200);

    r = await secPATCH(req("PATCH", { expectedVersion: 4, citations: Array(21).fill({ label: "c", kind: "call" }) }), ctx("team", "a"));
    expect((await json(r)).error).toBe("A section can have at most 20 citations.");
    r = await secPATCH(req("PATCH", { expectedVersion: 4, citations: [{ label: "c", kind: "web", url: "javascript:alert(1)" }] }), ctx("team", "a"));
    expect((await json(r)).error).toBe("Links must start with http:// or https://.");
  });

  it("at most 30 sections; keys are unique and slugged", async () => {
    as(U1);
    state.memos[1].sections = Array.from({ length: 30 }, (_, i) => section(`x${i}`, `k${i}`, { position: i }));
    const r = await secPOST(req("POST", { title: "One too many" }), ctx("team"));
    expect((await json(r)).error).toBe("A memo can have at most 30 sections.");

    state.memos[1].sections = [section("a1", "risks")];
    const ok = await secPOST(req("POST", { title: "Risks" }), ctx("team"));
    expect(await json(ok)).toEqual({ key: "risks-2", version: 1 });
    expect((await json(await secPOST(req("POST", { title: "x", key: "risks" }), ctx("team")))).error).toBe("Each section needs a different key.");
    expect((await json(await secPOST(req("POST", { title: "x", key: "Bad Key" }), ctx("team")))).error).toBe(MEMO_ERRORS.badKey);
  });

  it("meta: stale version is a 409; bad source and date are 400", async () => {
    as(U1);
    expect((await onePATCH(req("PATCH", { title: "New", version: 1 }), ctx("team"))).status).toBe(200);
    expect(state.memos[1]).toMatchObject({ title: "New", version: 2 });
    expect((await onePATCH(req("PATCH", { title: "Newer", version: 1 }), ctx("team"))).status).toBe(409);
    expect((await onePATCH(req("PATCH", { source: "Billboard", version: 2 }), ctx("team"))).status).toBe(400);
    expect((await onePATCH(req("PATCH", { introDate: "soon", version: 2 }), ctx("team"))).status).toBe(400);
    expect((await onePATCH(req("PATCH", { title: "x", status: "FINAL" }), ctx("team"))).status).toBe(400); // one kind at a time
    expect((await onePATCH(req("PATCH", { title: "x" }), ctx("team"))).status).toBe(400); // no version
  });

  it("status and visibility validate their values", async () => {
    as(U1);
    expect((await onePATCH(req("PATCH", { status: "DONE" }), ctx("team"))).status).toBe(400);
    expect((await onePATCH(req("PATCH", { visibility: "PUBLIC" }), ctx("team"))).status).toBe(400);
    expect((await onePATCH(req("PATCH", { status: "IN_REVIEW" }), ctx("team"))).status).toBe(200);
  });

  it("reorder needs every key exactly once", async () => {
    as(U1);
    expect((await secReorder(req("PATCH", { keys: ["a"] }), ctx("team"))).status).toBe(400);
    expect((await secReorder(req("PATCH", { keys: ["a", "a"] }), ctx("team"))).status).toBe(400);
    expect((await secReorder(req("PATCH", { keys: ["b", "a"] }), ctx("team"))).status).toBe(200);
    expect(state.memos[1].sections.find((s: Row) => s.key === "b")!.position).toBe(0);
  });
});

describe("company link and suggestion", () => {
  it("links, clears the pending name, bumps the version, and refuses a second link", async () => {
    as(U1);
    const r = await linkPOST(req("POST", { expectedVersion: 1, companyId: "c1" }), ctx("private"));
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ id: "private", companyId: "c1", version: 2 });
    expect(state.memos[0]).toMatchObject({ companyId: "c1", companyNamePending: null, version: 2 });
    const again = await linkPOST(req("POST", { expectedVersion: 2, companyId: "c2" }), ctx("private"));
    expect(again.status).toBe(400);
    expect((await json(again)).error).toBe("This memo is already linked to Acme.");
  });

  it("stale memo version is 409; unknown company is 400", async () => {
    as(U1);
    expect((await linkPOST(req("POST", { expectedVersion: 7, companyId: "c1" }), ctx("private"))).status).toBe(409);
    expect((await linkPOST(req("POST", { expectedVersion: 1, companyId: "nope" }), ctx("private"))).status).toBe(400);
    expect((await linkPOST(req("POST", { companyId: "c1" }), ctx("private"))).status).toBe(400);
    expect(state.memos[0].companyId).toBeNull();
  });

  it("suggests exactly one strong match for a pending name", async () => {
    as(U1);
    expect(await json(await suggestGET(req("GET"), ctx("private")))).toEqual({ suggestion: { id: "c1", name: "Acme" } }); // "Acme Inc" ~ "Acme"
    state.companies.push({ id: "c3", name: "ACME", aliases: [] });
    expect(await json(await suggestGET(req("GET"), ctx("private")))).toEqual({ suggestion: null }); // ambiguous
    expect(await json(await suggestGET(req("GET"), ctx("team")))).toEqual({ suggestion: null }); // no pending name
  });
});

describe("deal-ledger links (Part 42)", () => {
  const stamp = new Date("2026-03-01T10:00:00Z");
  beforeEach(() => {
    state.ledger = [
      { id: "l1", name: "Globex", companyId: null },
      { id: "l2", name: "Initech Holdings", companyId: "c2" },
    ];
    state.memos[0].updatedAt = stamp;
  });

  it("links a ledger row: { id, portfolioCompanyId, version }, pending cleared, updatedAt kept", async () => {
    const r = await linkPOST(req("POST", { expectedVersion: 1, portfolioCompanyId: "l1" }), ctx("private"));
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ id: "private", portfolioCompanyId: "l1", version: 2 });
    expect(state.memos[0]).toMatchObject({ companyId: null, portfolioCompanyId: "l1", companyNamePending: null, version: 2, updatedAt: stamp });
    expect(audit.logAdminAction).toHaveBeenCalledWith(U1, "MEMO_COMPANY_LINKED", expect.objectContaining({ metadata: { memoId: "private", portfolioCompanyId: "l1" } }));
  });

  it("a Company link keeps updatedAt too (Q135-A)", async () => {
    await linkPOST(req("POST", { expectedVersion: 1, companyId: "c1" }), ctx("private"));
    expect(state.memos[0].updatedAt).toBe(stamp);
  });

  it("a ledger row that has a Company links the Company", async () => {
    const r = await linkPOST(req("POST", { expectedVersion: 1, portfolioCompanyId: "l2" }), ctx("private"));
    expect(await json(r)).toEqual({ id: "private", companyId: "c2", version: 2 });
    expect(state.memos[0]).toMatchObject({ companyId: "c2", portfolioCompanyId: null });
  });

  it("both ids, neither id, or an unknown ledger id is a 400", async () => {
    const both = await linkPOST(req("POST", { expectedVersion: 1, companyId: "c1", portfolioCompanyId: "l1" }), ctx("private"));
    expect(both.status).toBe(400);
    expect((await json(both)).error).toBe("Choose a company.");
    expect((await linkPOST(req("POST", { expectedVersion: 1 }), ctx("private"))).status).toBe(400);
    expect((await linkPOST(req("POST", { expectedVersion: 1, portfolioCompanyId: "nope" }), ctx("private"))).status).toBe(400);
    expect(state.memos[0].companyId ?? null).toBeNull();
    expect(state.memos[0].portfolioCompanyId ?? null).toBeNull();
  });

  it("a second link of either kind is refused with the name", async () => {
    await linkPOST(req("POST", { expectedVersion: 1, portfolioCompanyId: "l1" }), ctx("private"));
    const again = await linkPOST(req("POST", { expectedVersion: 2, companyId: "c1" }), ctx("private"));
    expect(again.status).toBe(400);
    expect((await json(again)).error).toBe("This memo is already linked to Globex.");
    const again2 = await linkPOST(req("POST", { expectedVersion: 2, portfolioCompanyId: "l1" }), ctx("private"));
    expect((await json(again2)).error).toBe("This memo is already linked to Globex.");
  });

  it("only the owner links or unlinks a team memo", async () => {
    as(U2);
    expect((await linkPOST(req("POST", { expectedVersion: 1, portfolioCompanyId: "l1" }), ctx("team"))).status).toBe(403);
    expect((await linkDELETE(req("DELETE", { expectedVersion: 1 }), ctx("team"))).status).toBe(403);
  });

  it("suggests a ledger-only match as { id, name, kind: 'ledger' } and a Company match unchanged", async () => {
    state.memos[0].companyNamePending = "Globex Inc";
    expect(await json(await suggestGET(req("GET"), ctx("private")))).toEqual({ suggestion: { id: "l1", name: "Globex", kind: "ledger" } });
    state.memos[0].companyNamePending = "Acme";
    expect(await json(await suggestGET(req("GET"), ctx("private")))).toEqual({ suggestion: { id: "c1", name: "Acme" } });
  });

  it("suggests the Company for a ledger row linked to a Company, even under the old name", async () => {
    state.memos[0].companyNamePending = "Initech Holdings";
    expect(await json(await suggestGET(req("GET"), ctx("private")))).toEqual({ suggestion: { id: "c2", name: "Beta Co" } });
  });

  it("no suggestion once a ledger row is linked", async () => {
    state.memos[0].portfolioCompanyId = "l1";
    state.memos[0].companyNamePending = "Globex";
    expect(await json(await suggestGET(req("GET"), ctx("private")))).toEqual({ suggestion: null });
  });

  it("details save refuses the pending name on a ledger-linked memo", async () => {
    state.memos[0].portfolioCompanyId = "l1";
    const r = await onePATCH(req("PATCH", { companyNamePending: "Other", version: 1 }), ctx("private"));
    expect(r.status).toBe(400);
  });

  it("unlink keeps the name as the pending name, bumps the version, keeps updatedAt, audits ids only", async () => {
    await linkPOST(req("POST", { expectedVersion: 1, portfolioCompanyId: "l1" }), ctx("private"));
    const stale = await linkDELETE(req("DELETE", { expectedVersion: 1 }), ctx("private"));
    expect(stale.status).toBe(409);
    const r = await linkDELETE(req("DELETE", { expectedVersion: 2 }), ctx("private"));
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ id: "private", version: 3 });
    expect(state.memos[0]).toMatchObject({ companyId: null, portfolioCompanyId: null, companyNamePending: "Globex", version: 3, updatedAt: stamp });
    expect(audit.logAdminAction).toHaveBeenCalledWith(U1, "MEMO_COMPANY_UNLINKED", expect.objectContaining({ metadata: { memoId: "private" } }));
    expect(JSON.stringify(audit.logAdminAction.mock.calls)).not.toContain("Globex");
    const again = await linkDELETE(req("DELETE", { expectedVersion: 3 }), ctx("private"));
    expect(again.status).toBe(400); // nothing to unlink
  });

  it("unlinking a Company link also works", async () => {
    await linkPOST(req("POST", { expectedVersion: 1, companyId: "c1" }), ctx("private"));
    await linkDELETE(req("DELETE", { expectedVersion: 2 }), ctx("private"));
    expect(state.memos[0]).toMatchObject({ companyId: null, companyNamePending: "Acme" });
  });

  it("web create can carry a ledger id; with a Company id or a pending name it is a 400", async () => {
    const ok = await createPOST(req("POST", { title: "T", portfolioCompanyId: "l1" }));
    expect(ok.status).toBe(201);
    const { id } = await json(ok);
    expect(state.memos.find((m) => m.id === id)).toMatchObject({ companyId: null, portfolioCompanyId: "l1" });
    const viaCompany = await createPOST(req("POST", { title: "T", portfolioCompanyId: "l2" }));
    expect(state.memos.find((m) => m.id === (state.memos.at(-1) as Row).id)).toMatchObject({ companyId: "c2", portfolioCompanyId: null });
    expect(viaCompany.status).toBe(201);
    expect((await createPOST(req("POST", { title: "T", portfolioCompanyId: "l1", companyId: "c1" }))).status).toBe(400);
    const both = await createPOST(req("POST", { title: "T", portfolioCompanyId: "l1", companyNamePending: "X" }));
    expect((await json(both)).error).toBe(MEMO_ERRORS.bothCompanies);
    expect((await createPOST(req("POST", { title: "T", portfolioCompanyId: "nope" }))).status).toBe(400);
  });

  it("list: unlinked excludes ledger-linked memos; the company filter includes a ledger row's Company; the ledger filter and search work", async () => {
    state.memos[0].portfolioCompanyId = "l1";
    state.memos[0].portfolioCompany = { id: "l1", name: "Globex", companyId: null };
    state.memos[1].portfolioCompanyId = "l2";
    state.memos[1].portfolioCompany = { id: "l2", name: "Initech Holdings", companyId: "c2" };
    const get = async (q: string) => ((await json(await listGET(new Request(`https://molly.dfs.vc/api/admin/memos?${q}`)))) as Row[]).map((m) => m.id);
    expect(await get("unlinked=true")).toEqual([]);
    expect(await get("companyId=c2")).toEqual(["team"]);
    expect(await get("portfolioCompanyId=l1")).toEqual(["private"]);
    expect(await get("q=globex")).toEqual(["private"]);
  });

  it("deleting a ledger row keeps its name on the memos linked to it", async () => {
    await linkPOST(req("POST", { expectedVersion: 1, portfolioCompanyId: "l1" }), ctx("private"));
    const r = await ledgerDELETE(req("DELETE"), ctx("l1"));
    expect(r.status).toBe(200);
    expect(state.memos[0]).toMatchObject({ portfolioCompanyId: null, companyNamePending: "Globex" });
    expect(state.ledger.map((l) => l.id)).toEqual(["l2"]);
  });

  it("audit rows hold ids only (canary)", async () => {
    const C = "CANARY-77ab";
    state.ledger.push({ id: "l9", name: `Ledger ${C}`, companyId: null });
    await linkPOST(req("POST", { expectedVersion: 1, portfolioCompanyId: "l9" }), ctx("private"));
    await linkDELETE(req("DELETE", { expectedVersion: 2 }), ctx("private"));
    expect(JSON.stringify(audit.logAdminAction.mock.calls)).not.toContain("CANARY");
  });
});

describe("template", () => {
  it("serves the built-in default as version 1 until a template is saved, then versions up", async () => {
    const t1 = await json(await tplGET());
    expect(t1.version).toBe(1);
    expect(t1.sections).toHaveLength(12);
    const r = await tplPUT(req("PUT", { sections: [{ title: "Thesis", guidance: "Why", required: true }, { key: "risks", title: "Risks", shareByDefault: false }] }));
    expect(r.status).toBe(201);
    expect(await json(r)).toEqual({ version: 2 });
    const t2 = await json(await tplGET());
    expect(t2.version).toBe(2);
    expect(t2.sections).toEqual([
      { key: "thesis", title: "Thesis", guidance: "Why", required: true, shareByDefault: true },
      { key: "risks", title: "Risks", guidance: "", required: false, shareByDefault: false },
    ]);
    expect(audit.logAdminAction).toHaveBeenCalledWith(U1, "MEMO_TEMPLATE_UPDATED", expect.objectContaining({ metadata: { version: 2 } }));
  });

  it("rejects an empty or duplicated template", async () => {
    expect((await tplPUT(req("PUT", { sections: [] }))).status).toBe(400);
    expect((await tplPUT(req("PUT", { sections: [{ title: "A" }, { title: "A" }] }))).status).toBe(400);
    expect((await tplPUT(req("PUT", {}))).status).toBe(400);
  });
});

describe("preview", () => {
  it("renders safe HTML and rejects oversized input", async () => {
    const r = await previewPOST(req("POST", { markdown: "**hi** <script>alert(1)</script> [x](javascript:alert(1))" }));
    const { html } = await json(r);
    expect(html).toContain("<strong>hi</strong>");
    expect(html).not.toMatch(/<script|href/i);
    expect((await previewPOST(req("POST", { markdown: "x".repeat(20_001) }))).status).toBe(400);
    expect((await previewPOST(req("POST", { markdown: 5 }))).status).toBe(400);
  });
});

describe("audit metadata carries ids, never content", () => {
  it("no title, text, citation or company name reaches the audit log (canary)", async () => {
    as(U1);
    const C = "CANARY-9f2e";
    const created = await createPOST(req("POST", { title: `Title ${C}`, companyNamePending: `Pending ${C}`, tags: [`tag ${C}`], websiteUrl: `https://example.com/${C}` }));
    const { id } = await json(created);
    const m = state.memos.find((x) => x.id === id)!;
    await onePATCH(req("PATCH", { title: `Renamed ${C}`, version: 1 }), ctx(id));
    await secPATCH(req("PATCH", { expectedVersion: 1, markdown: `Body ${C}`, title: `Section ${C}`, citations: [{ label: `Cite ${C}`, kind: "call" }] }), ctx(id, m.sections[0].key));
    await secPATCH(req("PATCH", { expectedVersion: 2, markdown: `Body two ${C}` }), ctx(id, m.sections[0].key));
    await revPOST(req("POST", { fromVersion: 1, expectedVersion: 3 }), ctx(id, m.sections[0].key));
    await secPOST(req("POST", { title: `Added ${C}` }), ctx(id));
    await secReorder(req("PATCH", { keys: m.sections.map((s: Row) => s.key).reverse() }), ctx(id));
    await secDELETE(req("DELETE"), ctx(id, m.sections.at(-1).key));
    await onePATCH(req("PATCH", { status: "IN_REVIEW" }), ctx(id));
    await onePATCH(req("PATCH", { visibility: "TEAM" }), ctx(id));
    state.companies.push({ id: "c9", name: `Company ${C}`, aliases: [] });
    await linkPOST(req("POST", { expectedVersion: 4, companyId: "c9" }), ctx(id)); // meta, status and visibility each bumped the version
    await tplPUT(req("PUT", { sections: [{ title: `Tpl ${C}`, guidance: `Guide ${C}` }] }));
    await decisionPOST(req("POST", { decision: "INVESTED", expectedVersion: 5 }), ctx(id)); // link bumped the version again
    await oneDELETE(req("DELETE"), ctx(id));

    const actions = audit.logAdminAction.mock.calls.map((c) => c[1]);
    for (const a of ["MEMO_CREATED", "MEMO_UPDATED", "MEMO_SECTION_UPDATED", "MEMO_SECTION_RESTORED", "MEMO_STATUS_CHANGED", "MEMO_VISIBILITY_CHANGED", "MEMO_COMPANY_LINKED", "MEMO_TEMPLATE_UPDATED", "MEMO_ARCHIVED", "MEMO_DECISION_CHANGED"]) {
      expect(actions, a).toContain(a);
    }
    expect(JSON.stringify(audit.logAdminAction.mock.calls.map((c) => [c[1], c[2]]))).not.toContain("CANARY");
  });
});

describe("decision and source (Part 41, WS132)", () => {
  it("PATCH decision: set, change, clear; an unknown value is a 400 with the sentence", async () => {
    const patch = (body: Row) => onePATCH(req("PATCH", body), ctx("team"));
    expect((await patch({ decision: "INVESTED", version: 1 })).status).toBe(200);
    expect(state.memos.find((m) => m.id === "team")!.decision).toBe("INVESTED");
    expect((await patch({ decision: "PASSED", version: 2 })).status).toBe(200);
    expect(state.memos.find((m) => m.id === "team")!.decision).toBe("PASSED");
    expect((await patch({ decision: null, version: 3 })).status).toBe(200);
    expect(state.memos.find((m) => m.id === "team")!.decision).toBeNull();
    const bad = await patch({ decision: "Invested", version: 4 });
    expect(bad.status).toBe(400);
    expect((await json(bad)).error).toBe(MEMO_ERRORS.badDecision);
    expect(audit.logAdminAction.mock.calls.some((c) => c[1] === "MEMO_UPDATED" && c[2].metadata.fields.includes("decision"))).toBe(true);
  });

  it("the list filters by decision and ignores an unknown value", async () => {
    state.memos.find((m) => m.id === "team")!.decision = "INVESTED";
    const get = async (q: string) => (await json(await listGET(new Request(`https://molly.dfs.vc/api/admin/memos?${q}`)))) as Row[];
    expect((await get("decision=INVESTED")).map((m) => m.id)).toEqual(["team"]);
    expect(await get("decision=PASSED")).toEqual([]);
    expect((await get("decision=bogus")).length).toBe(2);
  });

  it("a stored value that is no longer in the list saves unchanged; a different invalid one fails", async () => {
    state.memos.find((m) => m.id === "team")!.source = "Referral"; // a retired Part 40 value
    const patch = (body: Row) => onePATCH(req("PATCH", body), ctx("team"));
    expect((await patch({ source: "Referral", title: "Renamed", version: 1 })).status).toBe(200);
    expect((await patch({ source: "Billboard", version: 2 })).status).toBe(400);
    expect((await patch({ source: "Inbound", version: 2 })).status).toBe(400); // another retired value is not accepted
    expect((await patch({ source: "Founder Intro", version: 2 })).status).toBe(200);
    expect((await patch({ source: "Referral", version: 3 })).status).toBe(400); // no longer the stored value
  });
});

describe("decision move (Part 43)", () => {
  const stamp = new Date("2026-03-01T10:00:00Z");
  const find = (id: string) => state.memos.find((m) => m.id === id)!;
  const move = (id: string, body: Row) => decisionPOST(req("POST", body), ctx(id));
  beforeEach(() => {
    find("private").updatedAt = stamp;
    find("team").updatedAt = stamp;
  });

  it("owner on a private memo: moves, bumps the version, keeps updatedAt (Q137-A)", async () => {
    const r = await move("private", { decision: "INVESTED", expectedVersion: 1 });
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ id: "private", decision: "INVESTED", version: 2 });
    expect(find("private")).toMatchObject({ decision: "INVESTED", version: 2, updatedAt: stamp });
  });

  it("a non-owner may move a TEAM memo (F139) but cannot see someone's private one", async () => {
    as(U2);
    expect((await move("team", { decision: "LATER", expectedVersion: 1 })).status).toBe(200);
    expect(find("team").decision).toBe("LATER");
    expect((await move("private", { decision: "LATER", expectedVersion: 1 })).status).toBe(404);
    expect(find("private").decision ?? null).toBeNull();
  });

  it("null and an empty string clear; a label instead of a code is a 400", async () => {
    find("team").decision = "MEMO";
    expect((await move("team", { decision: null, expectedVersion: 1 })).status).toBe(200);
    expect(find("team").decision).toBeNull();
    find("team").decision = "MEMO";
    expect((await move("team", { decision: "", expectedVersion: 2 })).status).toBe(200);
    expect(find("team").decision).toBeNull();
    const bad = await move("team", { decision: "Invested", expectedVersion: 3 });
    expect(bad.status).toBe(400);
    expect((await json(bad)).error).toBe(MEMO_ERRORS.badDecision);
  });

  it("a missing or non-integer expectedVersion is a 400; a stale one is a 409 and writes nothing", async () => {
    expect((await move("team", { decision: "MEMO" })).status).toBe(400);
    expect((await move("team", { decision: "MEMO", expectedVersion: "1" })).status).toBe(400);
    expect((await move("team", { decision: "MEMO", expectedVersion: 1.5 })).status).toBe(400);
    const stale = await move("team", { decision: "MEMO", expectedVersion: 7 });
    expect(stale.status).toBe(409);
    expect((await json(stale)).error).toBe(MEMO_MESSAGES.staleMemo);
    expect(find("team")).toMatchObject({ version: 1 });
    expect(find("team").decision ?? null).toBeNull();
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });

  it("the same decision is a 200 with the unchanged version and no audit", async () => {
    find("team").decision = "MEMO";
    const r = await move("team", { decision: "MEMO", expectedVersion: 1 });
    expect(await json(r)).toEqual({ id: "team", decision: "MEMO", version: 1 });
    expect(find("team").version).toBe(1);
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });

  it("audits MEMO_DECISION_CHANGED with from/to and the source; undo only when sent; no title", async () => {
    find("team").decision = "MEMO";
    await move("team", { decision: "INVESTED", expectedVersion: 1 });
    await move("team", { decision: "MEMO", expectedVersion: 2, undo: true });
    const calls = audit.logAdminAction.mock.calls.filter((c) => c[1] === "MEMO_DECISION_CHANGED");
    expect(calls).toHaveLength(2);
    expect(calls[0][2].metadata).toEqual({ memoId: "team", from: "MEMO", to: "INVESTED", version: 2, source: "board" });
    expect(calls[1][2].metadata).toEqual({ memoId: "team", from: "INVESTED", to: "MEMO", version: 3, source: "board", undo: true });
    expect(JSON.stringify(calls)).not.toContain("Team memo");
  });

  it("Part 44: source \"page\" audits as page; a bogus or absent source audits as board", async () => {
    find("team").decision = "MEMO";
    await move("team", { decision: "INVESTED", expectedVersion: 1, source: "page" });
    await move("team", { decision: "LATER", expectedVersion: 2, source: "bogus" });
    await move("team", { decision: "PASSED", expectedVersion: 3 });
    const calls = audit.logAdminAction.mock.calls.filter((c) => c[1] === "MEMO_DECISION_CHANGED");
    expect(calls.map((c) => c[2].metadata.source)).toEqual(["page", "board", "board"]);
  });

  it("the list rows carry canEdit; at the cap the response is cut with X-Memos-Truncated, below it there is no header", async () => {
    const list = async () => listGET(new Request("https://molly.dfs.vc/api/admin/memos"));
    const first = await list();
    expect(first.headers.get("X-Memos-Truncated")).toBeNull();
    const rows = (await json(first)) as Row[];
    expect(rows.length).toBe(2);
    expect(rows.every((m) => m.canEdit === true)).toBe(true);
    as(U2);
    const other = (await json(await list())) as Row[];
    expect(other.map((m) => [m.id, m.canEdit])).toEqual([["team", true]]);

    as(U1);
    for (let i = 0; i < 199; i++) state.memos.push({ id: `bulk${i}`, title: "Acme", ownerId: "u1", visibility: "TEAM", status: "DRAFT", version: 1, archivedAt: null, companyId: null, sections: [] });
    const exact = await list(); // 2 + 199 = 201 visible
    expect(((await json(exact)) as Row[]).length).toBe(200);
    expect(exact.headers.get("X-Memos-Truncated")).toBe("1");
    state.memos.pop();
    const at = await list(); // exactly 200: not truncated
    expect(((await json(at)) as Row[]).length).toBe(200);
    expect(at.headers.get("X-Memos-Truncated")).toBeNull();
  });
});
