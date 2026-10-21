import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import * as jose from "jose";

// Part 40 (WS129): the six memo tools, through the real route, the real gate (runTool), the real
// tool functions and the real shared memo actions, against a small fake database that evaluates the
// `where` clauses (so visibility is tested, not assumed). Existing Marge test files are untouched.

type Row = Record<string, any>;
const state = vi.hoisted(() => ({
  memos: [] as Row[],
  revisions: [] as Row[],
  companies: [] as Row[],
  ledger: [] as Row[],
  templates: [] as Row[],
  users: [] as Row[],
  writes: 0,
}));

function matches(where: Row | undefined, row: Row): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === "AND") return (v as Row[]).every((w) => matches(w, row));
    if (k === "OR") return (v as Row[]).some((w) => matches(w, row));
    if (k === "NOT") return !matches(v as Row, row);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("contains" in v) return typeof row[k] === "string" && row[k].toLowerCase().includes(String(v.contains).toLowerCase());
      if ("equals" in v) return typeof row[k] === "string" && row[k].toLowerCase() === String(v.equals).toLowerCase();
      if ("not" in v) return (row[k] ?? null) !== v.not;
      return row[k] != null && matches(v as Row, row[k]);
    }
    return (row[k] ?? null) === (v ?? null);
  });
}
const w = () => void state.writes++;

vi.mock("@/lib/db", () => {
  const view = (m: Row, select?: Row): Row => {
    const out: Row = { ...m, company: m.companyId ? state.companies.find((c) => c.id === m.companyId) ?? null : null };
    out.owner = state.users.find((u) => u.id === m.ownerId);
    if (m.portfolioCompanyId) {
      const l = state.ledger.find((x) => x.id === m.portfolioCompanyId);
      out.portfolioCompany = l ? { id: l.id, name: l.name, companyId: l.companyId, company: state.companies.find((c) => c.id === l.companyId) ?? null } : null;
    }
    if (select?.sections?.select) {
      out.sections = [...m.sections]
        .sort((a: Row, b: Row) => a.position - b.position)
        .map((s: Row) => Object.fromEntries(Object.keys(select.sections.select).map((k) => [k, s[k]])));
    }
    return out;
  };
  const db: Row = {
    user: { findUnique: vi.fn(async ({ where }: Row) => state.users.find((u) => u.googleId === where.googleId) ?? null), findFirst: vi.fn(async () => null) },
    rateLimitCounter: { create: vi.fn(async () => ({})) },
    memo: {
      findFirst: vi.fn(async ({ where, select }: Row) => {
        const m = state.memos.find((x) => matches(where, view(x)));
        return m ? view(m, select) : null;
      }),
      findMany: vi.fn(async ({ where, take, select }: Row) =>
        state.memos
          .filter((x) => matches(where, view(x)))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, take)
          .map((m) => view(m, select))
      ),
      findUnique: vi.fn(async ({ where }: Row) => state.memos.find((x) => (where.createKey ? x.createKey === where.createKey : x.id === where.id)) ?? null),
      create: vi.fn(async ({ data }: Row) => {
        w();
        const { sections, ...rest } = data;
        const id = `m-new-${state.memos.length}`;
        const row: Row = { id, version: 1, visibility: "PRIVATE", status: "DRAFT", archivedAt: null, companyId: null, updatedAt: new Date(), ...rest, sections: [] };
        state.memos.push(row);
        sections.create.forEach((s: Row, i: number) => {
          const { revisions, ...sr } = s;
          row.sections.push({ id: `${id}-s${i}`, version: 1, ...sr });
          for (const r of revisions.create) state.revisions.push({ sectionId: `${id}-s${i}`, ...r });
        });
        return row;
      }),
      update: vi.fn(async ({ where, data }: Row) => {
        w();
        Object.assign(state.memos.find((x) => x.id === where.id)!, data.updatedAt ? { updatedAt: data.updatedAt } : {});
        return {};
      }),
      updateMany: vi.fn(async ({ where, data }: Row) => {
        w();
        const rows = state.memos.filter((x) => matches(where, x));
        for (const m of rows) {
          const { version, ...rest } = data;
          Object.assign(m, rest);
          if (version?.increment) m.version += version.increment;
        }
        return { count: rows.length };
      }),
    },
    memoSection: {
      updateMany: vi.fn(async ({ where, data }: Row) => {
        w();
        let count = 0;
        for (const m of state.memos) for (const s of m.sections) if (matches(where, s)) {
          count++;
          const { version, ...rest } = data;
          Object.assign(s, rest);
          s.version += version?.increment ?? 0;
        }
        return { count };
      }),
    },
    memoSectionRevision: { create: vi.fn(async ({ data }: Row) => void (w(), state.revisions.push({ ...data }))) },
    company: {
      findFirst: vi.fn(async ({ where }: Row) => state.companies.find((c) => (where.id ? c.id === where.id : true)) ?? null),
      findMany: vi.fn(async ({ where, take }: Row) => {
        const f = (c: Row) => (where?.AND ? where.AND.every((x: Row) => !x.name || matches(x, c)) : true);
        return state.companies.filter(f).slice(0, take ?? 100);
      }),
    },
    portfolioCompany: {
      findUnique: vi.fn(async ({ where }: Row) => state.ledger.find((l) => l.id === where.id) ?? null),
      findMany: vi.fn(async () => state.ledger),
    },
    memoTemplate: { findFirst: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: (t: Row) => unknown) => fn(db)),
  };
  return { db };
});
vi.mock("@/lib/org", () => ({ isAdminEmailDomain: (e: string) => e.endsWith("@example.com") }));
const audit = vi.hoisted(() => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/audit", () => audit);
const limiter = vi.hoisted(() => ({ checkRateLimit: vi.fn(async () => true) }));
vi.mock("@/lib/rate-limit", () => limiter);

import { POST } from "@/app/api/mcp/marge/route";
import { MARGE_TOOLS, MARGE_MEMO_TOOLS } from "@/lib/marge-tools/tiers";
import { argsHash } from "@/lib/marge-hash";
import * as tools from "@/lib/marge-tools/memos";
import { MEMO_ERRORS } from "@/lib/memos";
import { createMemo } from "@/lib/memo-actions";
import { ToolError } from "@/lib/marge-tools/types";

const KID = "marge-test";
const URL_ = "https://molly.dfs.vc/api/mcp/marge";
let priv: jose.CryptoKey;
const SAM = { id: "u1", email: "admin@example.com", name: "Sam Partner", googleId: "g-1", roles: ["ADMIN"], status: "APPROVED" };
const JANE = { id: "u2", email: "jane@example.com", name: "Jane Partner", googleId: "g-2", roles: ["ADMIN"], status: "APPROVED" };
const P = { id: "u1", email: "admin@example.com", name: "Sam Partner" };
const VIA = { via: "marge" as const, margeActionId: "act1" };
const DRY = { dryRun: true };
const APPLY = { dryRun: false, via: VIA };
const CANARY = "CANARY-PRIVATE-7c1d";

async function token(over: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({
    sub: "g-1", email: "admin@example.com", scope: "read", ctx: "private", jti: crypto.randomUUID(),
    iss: "marge", aud: "molly-mcp", iat: now, exp: now + 60, ...over,
  } as jose.JWTPayload)
    .setProtectedHeader({ alg: "EdDSA", kid: KID, typ: "JWT" })
    .sign(priv);
}
const rpc = (method: string, params?: unknown) => ({ jsonrpc: "2.0", id: 1, method, params });
async function post(body: unknown, tok?: string) {
  return POST(
    new Request(URL_, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${tok ?? (await token())}` },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}
async function json(res: Response) {
  const raw = await res.text();
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) return JSON.parse(raw.split("\n").find((l) => l.startsWith("data: "))!.slice(6));
  return JSON.parse(raw);
}
const callBody = (name: string, args: Record<string, unknown> = {}) => rpc("tools/call", { name, arguments: args });
/** A tool call as the route sees it, with a write token bound to the arguments Marge confirmed. */
async function applyCall(name: string, args: Record<string, unknown>, over: { hashOf?: Record<string, unknown>; ctx?: string } = {}) {
  const tok = await token({ scope: "write", ctx: over.ctx ?? "private", act: { tool: name, h: argsHash(over.hashOf ?? args), aid: "act-77" } });
  return post(callBody(name, { ...args, dryRun: false }), tok);
}
async function result(res: Response) {
  const j = await json(res);
  return j.result as { isError?: boolean; content: { text: string }[]; structuredContent?: Row };
}
const sentence = async (res: Response) => (await result(res)).content[0].text;
const section = (id: string, key: string, over: Row = {}) => ({ id, key, title: key, markdown: "text", citations: [], position: 0, includeInShare: true, version: 3, ...over });

function seed() {
  state.users = [SAM, JANE];
  state.writes = 0;
  state.revisions = [];
  state.templates = [];
  state.ledger = [];
  state.companies = [
    { id: "c1", name: "Acme", aliases: [] },
    { id: "c2", name: "Beta Co", aliases: [] },
    { id: "c3", name: "Gamma", aliases: [] },
    { id: "c4", name: "Gamma", aliases: [] },
  ];
  const base = { status: "DRAFT", archivedAt: null, draftedByMarge: false, companyId: null, companyNamePending: null, source: null, tags: [], introDate: null, websiteUrl: null, introCalls: [], templateVersion: 1, version: 1, updatedAt: new Date("2026-10-18T10:00:00Z") };
  state.memos = [
    { ...base, id: "own", title: "Acme: seed", visibility: "PRIVATE", ownerId: "u1", companyNamePending: "Acme", sections: [section("o-a", "open-questions", { markdown: "Own text one", citations: [{ label: "Intro call", kind: "call", date: "2026-10-01", url: "https://granola.ai/notes/1" }] }), section("o-b", "team", { position: 1, markdown: "Jane Founder leads." })] },
    { ...base, id: "priv", title: `Private ${CANARY}`, visibility: "PRIVATE", ownerId: "u2", sections: [section("p-a", "team", { markdown: CANARY })] },
    { ...base, id: "team", title: "Team memo", visibility: "TEAM", ownerId: "u2", companyId: "c2", sections: [section("t-a", "team", { markdown: "Shared text" })] },
    { ...base, id: "arch", title: "Old own memo", visibility: "PRIVATE", ownerId: "u1", archivedAt: new Date(), sections: [section("a-a", "team")] },
    { ...base, id: "arch2", title: `Archived private ${CANARY}`, visibility: "PRIVATE", ownerId: "u2", archivedAt: new Date(), sections: [section("a2-a", "team")] },
  ];
}

const saved = { ...process.env };
beforeAll(async () => {
  const k = await jose.generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  priv = k.privateKey;
  process.env.__JWKS = JSON.stringify({ keys: [{ ...(await jose.exportJWK(k.publicKey)), kid: KID, alg: "EdDSA", use: "sig" }] });
});
beforeEach(() => {
  vi.clearAllMocks();
  seed();
  limiter.checkRateLimit.mockResolvedValue(true);
  process.env.MARGE_ASSERTION_JWKS = process.env.__JWKS;
  process.env.MARGE_MCP_MODE = "write";
  process.env.MARGE_MEMO_TOOLS = "on";
});
afterEach(() => {
  for (const k of ["MARGE_ASSERTION_JWKS", "MARGE_MCP_MODE", "MARGE_MEMO_TOOLS"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const createArgs = (over: Record<string, unknown> = {}) => ({
  title: "Acme: seed round",
  companyNamePending: "Acme",
  sections: [
    { key: "team", title: "Team", markdown: "Jane Founder (CEO), previously at a payments firm.", citations: [{ label: "Intro call", kind: "call", date: "2026-10-01" }] },
    { key: "open-questions", title: "Open Questions", markdown: "What is the churn?" },
  ],
  idempotencyKey: "memo-key-0001",
  ...over,
});

describe("the contract: six tools, tiers, flags", () => {
  it("MARGE_MEMO_TOOLS names exactly the six, with the contract tiers; MARGE_TOOLS is still the 13", () => {
    expect(MARGE_MEMO_TOOLS).toEqual({
      memo_template_get: "team", memo_list: "dm", memo_get: "dm", memo_create: "dm_write", memo_update_section: "dm_write", memo_link_company: "dm_write",
    });
    expect(Object.keys(MARGE_TOOLS)).toHaveLength(13);
    expect(Object.keys(MARGE_TOOLS)).not.toContain("memo_get");
  });

  it("flag off (unset): tools/list is exactly today's 13, and a memo call is 'tool not found'", async () => {
    delete process.env.MARGE_MEMO_TOOLS;
    const list = await json(await post(rpc("tools/list", {})));
    expect((list.result.tools as { name: string }[]).map((t) => t.name).sort()).toEqual(Object.keys(MARGE_TOOLS).sort());
    for (const flag of [undefined, "", "off", "true", "1", "ON"]) {
      if (flag === undefined) delete process.env.MARGE_MEMO_TOOLS;
      else process.env.MARGE_MEMO_TOOLS = flag;
      const res = await json(await post(callBody("memo_list")));
      const text = res.result?.content?.[0]?.text ?? res.error?.message ?? "";
      expect(text, String(flag)).toMatch(/not found|unknown tool|Tool .* not/i);
      expect(state.memos.length).toBe(5);
    }
  });

  it("flag on: tools/list is the 13 plus the six", async () => {
    const list = await json(await post(rpc("tools/list", {})));
    const names = (list.result.tools as { name: string }[]).map((t) => t.name).sort();
    expect(names).toEqual([...Object.keys(MARGE_TOOLS), ...Object.keys(MARGE_MEMO_TOOLS)].sort());
    const create = (list.result.tools as { name: string; description: string }[]).find((t) => t.name === "memo_create")!;
    expect(create.description).toMatch(/dryRun defaults to true/);
  });

  it("MARGE_MCP_MODE is still the master switch: off is a 404; read mode refuses memo applies", async () => {
    process.env.MARGE_MCP_MODE = "read";
    const res = await applyCall("memo_create", createArgs());
    expect(await sentence(res)).toBe("Molly is in read-only mode for Marge.");
    expect(state.memos).toHaveLength(5);
    delete process.env.MARGE_MCP_MODE;
    expect((await post(callBody("memo_list"))).status).toBe(404);
  });
});

describe("request size (JC-MM-F)", () => {
  const pad = (len: number) => {
    const head = JSON.stringify(callBody("memo_template_get"));
    return head + " ".repeat(len - head.length);
  };
  it("with memo tools on: 400,000 characters pass the size check, 400,001 is a 413 before verification", async () => {
    expect((await post(pad(400_000))).status).toBe(200);
    const over = await POST(new Request(URL_, { method: "POST", body: "x".repeat(400_001) })); // no token at all: still 413, not 401
    expect(over.status).toBe(413);
  });
  it("with memo tools off the cap stays 64,000 (nothing that needs more exists)", async () => {
    delete process.env.MARGE_MEMO_TOOLS;
    expect((await post(pad(64_000))).status).toBe(200);
    expect((await POST(new Request(URL_, { method: "POST", body: "x".repeat(64_001) }))).status).toBe(413);
  });
});

describe("DM-only (Q115-A)", () => {
  it("every memo tool except memo_template_get is refused in a team channel, dry run or apply", async () => {
    const team = await token({ ctx: "team" });
    for (const [name, args] of [
      ["memo_list", {}], ["memo_get", { memoId: "own" }],
      ["memo_create", createArgs()], ["memo_update_section", { memoId: "own", sectionKey: "team", expectedVersion: 3, markdown: "x" }],
      ["memo_link_company", { memoId: "own", expectedVersion: 1, company: "Acme" }],
    ] as [string, Record<string, unknown>][]) {
      expect(await sentence(await post(callBody(name, args), team)), name).toBe("That's DM-only. Ask me in a DM.");
    }
    const writeTeam = await token({ ctx: "team", scope: "write", act: { tool: "memo_create", h: argsHash(createArgs()), aid: "a" } });
    expect(await sentence(await post(callBody("memo_create", { ...createArgs(), dryRun: false }), writeTeam))).toBe("That's DM-only. Ask me in a DM.");
    expect(state.memos).toHaveLength(5);
    expect(await sentence(await post(callBody("memo_template_get"), team))).toMatch(/Memo template, version 1/);
    const denied = audit.logAdminAction.mock.calls.filter((c) => c[1] === "MARGE_DENIED");
    expect(denied.length).toBe(6);
    expect(denied[0][2].metadata).toEqual({ via: "marge", tool: "memo_list", reason: "tier", ctx: "team" });
  });
});

describe("memo_template_get", () => {
  it("returns the house sections in order with guidance, required and share defaults", async () => {
    const out = await tools.memoTemplateGet({}, P);
    expect(out.count).toBe(12);
    const s = out.structured.sections as Row[];
    expect(s[0]).toMatchObject({ key: "open-questions", title: "Open Questions", required: true, shareByDefault: false });
    expect(out.structured.version).toBe(1);
    expect(out.text).toContain("1. open-questions · Open Questions · required · not shared by default");
    expect(out.text).toMatch(/Guidance: .*underwrit/i);
  });
});

describe("visibility through Marge (Q116, Q117)", () => {
  it("memo_get: another admin's private memo is 'No memo with that id.' and never leaks", async () => {
    await expect(tools.memoGet({ memoId: "priv" }, P)).rejects.toThrow("No memo with that id.");
    await expect(tools.memoGet({ memoId: "nope" }, P)).rejects.toThrow("No memo with that id.");
    await expect(tools.memoGet({ memoId: "arch2" }, P)).rejects.toThrow("No memo with that id."); // archived AND not theirs: no hint it exists
    await expect(tools.memoGet({ memoId: "arch" }, P)).rejects.toThrow("That memo is archived."); // their own
    const res = await sentence(await post(callBody("memo_get", { memoId: "priv" })));
    expect(res).toBe("No memo with that id.");
    expect(res).not.toContain(CANARY);
  });

  it("memo_list: own and team memos only, newest first, never the other admin's private ones, no email", async () => {
    const out = await tools.memoList({}, P);
    expect((out.structured.memos as Row[]).map((m) => m.id)).toEqual(["own", "team"]);
    expect(out.text).not.toContain(CANARY);
    expect(JSON.stringify(out)).not.toMatch(/@/);
    expect(out.text).toContain("Not in Molly yet: Acme");
    expect(out.text).toContain("owner Jane Partner");
    const mine = await tools.memoList({ scope: "mine" }, P);
    expect((mine.structured.memos as Row[]).map((m) => m.id)).toEqual(["own"]);
    const shared = await tools.memoList({ scope: "team" }, P);
    expect((shared.structured.memos as Row[]).map((m) => m.id)).toEqual(["team"]);
    const unlinked = await tools.memoList({ unlinked: true, query: "acme" }, P);
    expect((unlinked.structured.memos as Row[]).map((m) => m.id)).toEqual(["own"]);
    const byCompany = await tools.memoList({ company: "beta co" }, P);
    expect((byCompany.structured.memos as Row[]).map((m) => m.id)).toEqual(["team"]);
    const url = (out.structured.memos as Row[])[0].url as string;
    expect(url).toBe("https://molly.dfs.vc/admin/memos/own");
    await expect(tools.memoList({ company: "Nowhere" }, P)).rejects.toThrow("No company called “Nowhere”.");
    await expect(tools.memoList({ company: "Gamma" }, P)).rejects.toThrow("“Gamma” matches 2 companies: Gamma, Gamma. Use the id.");
  });

  it("non-owners cannot change a memo from Slack, even a team memo they may read and edit in Molly", async () => {
    const upd = tools.memoUpdateSectionInput.parse({ memoId: "team", sectionKey: "team", expectedVersion: 3, markdown: "hijack" });
    await expect(tools.memoUpdateSection(upd, P, DRY)).rejects.toThrow("Only the memo's owner can change it from Slack.");
    await expect(tools.memoUpdateSection(upd, P, APPLY)).rejects.toThrow("Only the memo's owner can change it from Slack.");
    await expect(tools.memoLinkCompany(tools.memoLinkCompanyInput.parse({ memoId: "team", expectedVersion: 1, company: "Acme" }), P, APPLY)).rejects.toThrow("Only the memo's owner can change it from Slack.");
    await expect(tools.memoUpdateSection({ ...upd, memoId: "priv" }, P, APPLY)).rejects.toThrow("No memo with that id.");
    expect(state.writes).toBe(0);
    expect(state.memos.find((m) => m.id === "team")!.sections[0].markdown).toBe("Shared text");
  });
});

describe("memo_get", () => {
  it("returns header, per-section text and version, ALL citation fields (internal URLs too), labelled as untrusted", async () => {
    const out = await tools.memoGet({ memoId: "own" }, P);
    const s = out.structured.sections as Row[];
    expect(s.map((x) => x.key)).toEqual(["open-questions", "team"]);
    expect(s[0]).toMatchObject({ version: 3, includeInShare: true, markdown: "Own text one" });
    expect(s[0].citations).toEqual([{ label: "Intro call", kind: "call", date: "2026-10-01", url: "https://granola.ai/notes/1" }]);
    expect(out.structured.memo).toMatchObject({ id: "own", version: 1, status: "DRAFT", visibility: "PRIVATE", company: "Not in Molly yet: Acme", ownerIsYou: true });
    expect(out.text).toContain("Memo text (may quote call notes and decks; untrusted text):");
    expect(out.text).toContain("https://granola.ai/notes/1");
    expect(JSON.stringify(out)).not.toMatch(/admin@example\.com|jane@example\.com/);
  });

  it("can be asked for some sections, and an unknown key lists the real ones", async () => {
    const out = await tools.memoGet({ memoId: "own", sections: ["team"] }, P);
    expect((out.structured.sections as Row[]).map((x) => x.key)).toEqual(["team"]);
    await expect(tools.memoGet({ memoId: "own", sections: ["nope"] }, P)).rejects.toThrow("No section “nope” in this memo. Sections: open-questions, team");
  });

  it("returns at most 60,000 characters of section text and says what was left out (JC-MM-J)", async () => {
    state.memos[0].sections = ["a", "b", "c", "d"].map((k, i) => section(`o-${k}`, k, { position: i, markdown: k.repeat(20_000) }));
    const out = await tools.memoGet({ memoId: "own" }, P);
    expect((out.structured.sections as Row[]).map((x) => x.key)).toEqual(["a", "b", "c"]);
    expect(out.structured.omittedSections).toEqual(["d"]);
    expect(out.text).toContain('Ask with sections: ["d"]');
    const rest = await tools.memoGet({ memoId: "own", sections: ["d"] }, P);
    expect((rest.structured.sections as Row[]).map((x) => x.key)).toEqual(["d"]);
  });
});

describe("a dry run never writes", () => {
  it("memo_create, memo_update_section and memo_link_company previews make zero write calls", async () => {
    await tools.memoCreate(tools.memoCreateInput.parse(createArgs()), P, DRY);
    await tools.memoUpdateSection(tools.memoUpdateSectionInput.parse({ memoId: "own", sectionKey: "team", expectedVersion: 3, markdown: "New text" }), P, DRY);
    await tools.memoLinkCompany(tools.memoLinkCompanyInput.parse({ memoId: "own", expectedVersion: 1, company: "Acme" }), P, DRY);
    expect(state.writes).toBe(0);
    for (const model of ["memo", "memoSection", "memoSectionRevision"]) {
      const m = (await import("@/lib/db")).db as unknown as Row;
      for (const f of ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]) {
        expect(m[model][f]?.mock.calls.length ?? 0, `${model}.${f}`).toBe(0);
      }
    }
    expect((await import("@/lib/db")).db.$transaction).not.toHaveBeenCalled();
    expect(audit.logAdminAction.mock.calls.filter((c) => c[1].startsWith("MEMO_"))).toHaveLength(0);
  });
  it("through the route: a dry run is a read token, audited as MARGE_READ with dryRun true", async () => {
    const res = await post(callBody("memo_create", createArgs()));
    const r = await result(res);
    expect(r.structuredContent?.preview).toMatchObject({ action: "Create memo" });
    expect(state.memos).toHaveLength(5);
    const rows = audit.logAdminAction.mock.calls.map((c) => [c[1], c[2].metadata]);
    expect(rows).toEqual([["MARGE_READ", { via: "marge", ctx: "private", count: 1, dryRun: true }]]);
  });
});

describe("memo_create", () => {
  it("preview: title, company, owner, numbered sections, citations, draft, private, with the contract warnings", async () => {
    const out = await tools.memoCreate(tools.memoCreateInput.parse(createArgs()), P, DRY);
    const pv = out.structured.preview as { action: string; fields: { label: string; after: string }[]; warnings: string[] };
    expect(pv.action).toBe("Create memo");
    const f = Object.fromEntries(pv.fields.map((x) => [x.label, x.after]));
    expect(f.Title).toBe("Acme: seed round");
    expect(f.Company).toBe("Not in Molly yet: Acme");
    expect(f.Owner).toBe("you");
    expect(f.Sections).toBe("1. Team · 50 characters · 1 citation\n2. Open Questions · 18 characters · 0 citations");
    expect(f.Citations).toBe("1");
    expect(f.Status).toBe("Draft");
    expect(f.Visibility).toBe("Private to you");
    expect(pv.warnings).toContain("Private to you until you share it in Molly.");
    expect(pv.warnings.find((x) => x.startsWith("Missing required sections:"))).toBe(
      "Missing required sections: Company Overview, Product, Market Opportunity, Traction, Business Model, Go-to-Market / Hook, Competition / Status Quo, Round / Investment Terms, Key Risks."
    );
    // Acme exists in Molly (c1): the pending name is flagged, with the id in structured
    expect(pv.warnings).toContain("Acme looks like it is already in Molly. Link it to keep things together.");
    expect(out.structured.suggestedCompany).toEqual({ id: "c1", name: "Acme" });
    expect(out.text).toContain("Preview (nothing has been changed): Create memo");
  });

  it("with a companyId the preview shows the company name; the pending-name suggestion is not made", async () => {
    const out = await tools.memoCreate(tools.memoCreateInput.parse(createArgs({ companyNamePending: undefined, companyId: "c1" })), P, DRY);
    const pv = out.structured.preview as { fields: { label: string; after: string }[]; warnings: string[] };
    expect(pv.fields.find((x) => x.label === "Company")!.after).toBe("Acme");
    expect(pv.warnings.some((x) => x.includes("already in Molly"))).toBe(false);
  });

  it("a dry run with a used key says 'Already created as “…”.'", async () => {
    await tools.memoCreate(tools.memoCreateInput.parse(createArgs()), P, APPLY);
    const out = await tools.memoCreate(tools.memoCreateInput.parse(createArgs()), P, DRY);
    expect((out.structured.preview as { warnings: string[] }).warnings).toContain("Already created as “Acme: seed round”.");
  });

  it("an apply creates a private DRAFT owned by the asker, drafted by Marge, with a v1 revision per section", async () => {
    const out = await tools.memoCreate(tools.memoCreateInput.parse(createArgs()), P, APPLY);
    expect(out.structured).toEqual({ memoId: expect.any(String), url: expect.stringMatching(/^https:\/\/molly\.dfs\.vc\/admin\/memos\/.+/), version: 1, duplicate: false });
    const created = state.memos.at(-1)!;
    expect(created).toMatchObject({ ownerId: "u1", draftedByMarge: true, title: "Acme: seed round", companyNamePending: "Acme" });
    expect(created.visibility).toBe("PRIVATE");
    expect(created.status).toBe("DRAFT");
    expect(created.sections.map((s: Row) => s.key)).toEqual(["team", "open-questions"]); // the given order
    expect(created.sections.map((s: Row) => s.includeInShare)).toEqual([true, false]); // template share defaults
    expect(state.revisions.filter((r) => r.sectionId.startsWith(created.id)).every((r) => r.via === "marge" && r.version === 1)).toBe(true);
    expect(audit.logAdminAction).toHaveBeenCalledWith(P, "MEMO_CREATED", expect.objectContaining({ metadata: { memoId: created.id, sectionCount: 2, draftedByMarge: true, via: "marge", margeActionId: "act1" } }));
    expect(JSON.stringify(audit.logAdminAction.mock.calls)).not.toContain("Acme");
  });

  it("is idempotent: the second apply with the same key returns the same memo, duplicate: true, one row", async () => {
    const input = tools.memoCreateInput.parse(createArgs());
    const a = await tools.memoCreate(input, P, APPLY);
    const b = await tools.memoCreate(input, P, APPLY);
    expect(b.structured.memoId).toBe(a.structured.memoId);
    expect(a.structured.duplicate).toBe(false);
    expect(b.structured.duplicate).toBe(true);
    expect(state.memos.filter((m) => m.title === "Acme: seed round")).toHaveLength(1);
    expect(audit.logAdminAction.mock.calls.filter((c) => c[1] === "MEMO_CREATED")).toHaveLength(1);
    // a different key is a different memo
    const c = await tools.memoCreate(tools.memoCreateInput.parse(createArgs({ idempotencyKey: "memo-key-0002" })), P, APPLY);
    expect(c.structured.memoId).not.toBe(a.structured.memoId);
  });

  it("the contract's error sentences", async () => {
    const t = (over: Record<string, unknown>) => tools.memoCreate(tools.memoCreateInput.parse(createArgs(over)), P, DRY);
    await expect(t({ title: "  " })).rejects.toThrow("A title of 1-200 characters is required.");
    await expect(t({ companyId: "c1" })).rejects.toThrow("Give either a company or a pending company name, not both.");
    await expect(t({ companyNamePending: undefined, companyId: "nope" })).rejects.toThrow("No company with that id in Molly. Use companyNamePending for a company that isn't in Molly yet.");
    await expect(t({ sections: [{ key: "a", title: "A", markdown: "" }, { key: "a", title: "B", markdown: "" }] })).rejects.toThrow("Each section needs a different key.");
    await expect(t({ sections: [{ key: "a", title: "A", markdown: "x".repeat(20_001) }] })).rejects.toThrow("A section is limited to 20,000 characters.");
    const big = Array.from({ length: 8 }, (_, i) => ({ key: `k${i}`, title: "K", markdown: "x".repeat(19_000) })); // 152,000
    await expect(t({ sections: big })).rejects.toThrow("A memo is limited to 150,000 characters in total.");
    await expect(t({ sections: Array.from({ length: 31 }, (_, i) => ({ key: `k${i}`, title: "K", markdown: "" })) })).rejects.toThrow("A memo can have at most 30 sections.");
    await expect(t({ sections: [{ key: "a", title: "A", markdown: "", citations: Array(21).fill({ label: "c", kind: "call" }) }] })).rejects.toThrow("A section can have at most 20 citations.");
    await expect(t({ sections: [{ key: "a", title: "A", markdown: "", citations: [{ label: "c", kind: "web", url: "javascript:alert(1)" }] }] })).rejects.toThrow("Links must start with http:// or https://.");
    await expect(t({ websiteUrl: "acme.example" })).rejects.toThrow("Links must start with http:// or https://.");
    await expect(t({ idempotencyKey: "short" })).rejects.toThrow("idempotencyKey must be 8-100 letters, digits, - or _.");
    await expect(t({ sections: [] })).rejects.toThrow(MEMO_ERRORS.noSections);
    expect(state.writes).toBe(0);
  });

  it("an exactly-at-limit memo is accepted: 150,000 characters in total", async () => {
    const sections = Array.from({ length: 8 }, (_, i) => ({ key: `k${i}`, title: "K", markdown: "x".repeat(i < 7 ? 20_000 : 10_000) }));
    const out = await tools.memoCreate(tools.memoCreateInput.parse(createArgs({ sections })), P, DRY);
    expect(out.count).toBe(1);
  });
});

describe("memo_update_section", () => {
  const upd = (over: Record<string, unknown> = {}) => tools.memoUpdateSectionInput.parse({ memoId: "own", sectionKey: "team", expectedVersion: 3, markdown: "Jane Founder leads, and Sam Partner joined.", ...over });

  it("preview: target, text before and after, echoes expectedVersion, warns it replaces the whole section", async () => {
    const out = await tools.memoUpdateSection(upd({ title: "The Team", citations: [{ label: "Call", kind: "call" }] }), P, DRY);
    const pv = out.structured.preview as Row;
    expect(pv).toMatchObject({ action: "Edit memo section", target: "Acme: seed — team", expectedVersion: 3 });
    const f = Object.fromEntries((pv.fields as Row[]).map((x) => [x.label, x]));
    expect(f["Section title"]).toMatchObject({ before: "team", after: "The Team" });
    expect(f.Text).toMatchObject({ before: "19 characters", after: "Jane Founder leads, and Sam Partner joined. (43 characters)" });
    expect(f.Citations).toMatchObject({ before: "0", after: "1" });
    expect(pv.warnings).toEqual(["Replaces the whole section text (19 characters)."]);
  });

  it("clips the previewed text at 1,500 characters but states the full length", async () => {
    const out = await tools.memoUpdateSection(upd({ markdown: "y".repeat(5000) }), P, DRY);
    const text = ((out.structured.preview as Row).fields as Row[]).find((x) => x.label === "Text")!;
    expect(text.after.length).toBeLessThan(1600);
    expect(text.after).toContain("(5,000 characters)");
  });

  it("a stale expectedVersion is the conflict sentence for a dry run AND an apply, and writes nothing", async () => {
    for (const opts of [DRY, APPLY]) {
      await expect(tools.memoUpdateSection(upd({ expectedVersion: 2 }), P, opts)).rejects.toThrow("This section changed since I showed it to you. Ask me again.");
    }
    expect(state.writes).toBe(0);
    expect(state.revisions).toHaveLength(0);
  });

  it("a race between the preview and the apply (version moved) is the same sentence and no write", async () => {
    const db = (await import("@/lib/db")).db as unknown as Row;
    const orig = db.memoSection.updateMany.getMockImplementation() as (a: unknown) => Promise<unknown>;
    db.memoSection.updateMany.mockImplementationOnce(async (a: unknown) => {
      state.memos[0].sections[1].version = 4; // a person saved in Molly first
      return orig(a);
    });
    await expect(tools.memoUpdateSection(upd(), P, APPLY)).rejects.toThrow("This section changed since I showed it to you. Ask me again.");
    expect(state.revisions).toHaveLength(0);
    expect(state.memos[0].sections[1].markdown).toBe("Jane Founder leads.");
  });

  it("an apply goes through saveSection with via marge, writes a revision marked 'marge', and audits ids only", async () => {
    const out = await tools.memoUpdateSection(upd(), P, APPLY);
    expect(out.structured).toEqual({ memoId: "own", sectionKey: "team", version: 4, url: "https://molly.dfs.vc/admin/memos/own" });
    expect(state.memos[0].sections[1]).toMatchObject({ markdown: "Jane Founder leads, and Sam Partner joined.", version: 4, updatedVia: "marge" });
    expect(state.revisions.at(-1)).toMatchObject({ sectionId: "o-b", version: 4, via: "marge", editedById: "u1" });
    expect(audit.logAdminAction).toHaveBeenCalledWith(P, "MEMO_SECTION_UPDATED", expect.objectContaining({ metadata: { memoId: "own", sectionKey: "team", version: 4, via: "marge", margeActionId: "act1" } }));
    expect(JSON.stringify(audit.logAdminAction.mock.calls)).not.toContain("Sam Partner joined");
  });

  it("sentences: unknown section key, nothing to change, limits, bad citation URL", async () => {
    await expect(tools.memoUpdateSection(upd({ sectionKey: "nope" }), P, DRY)).rejects.toThrow("No section “nope” in this memo. Sections: open-questions, team");
    await expect(tools.memoUpdateSection(tools.memoUpdateSectionInput.parse({ memoId: "own", sectionKey: "team", expectedVersion: 3 }), P, DRY)).rejects.toThrow("Nothing to change: say what to edit.");
    await expect(tools.memoUpdateSection(upd({ markdown: "Jane Founder leads." }), P, DRY)).rejects.toThrow("Nothing to change: say what to edit.");
    await expect(tools.memoUpdateSection(upd({ markdown: "x".repeat(20_001) }), P, DRY)).rejects.toThrow("A section is limited to 20,000 characters.");
    await expect(tools.memoUpdateSection(upd({ title: "" }), P, DRY)).rejects.toThrow(MEMO_ERRORS.sectionTitle);
    await expect(tools.memoUpdateSection(upd({ citations: [{ label: "c", kind: "web", url: "ftp://x" }] }), P, DRY)).rejects.toThrow("Links must start with http:// or https://.");
    await expect(tools.memoUpdateSection(upd({ memoId: "arch" }), P, DRY)).rejects.toThrow("That memo is archived.");
    // 7 other sections of 20,000 plus this one over 10,000: the whole memo would exceed 150,000
    state.memos[0].sections = Array.from({ length: 8 }, (_, i) => section(`o-${i}`, i === 0 ? "team" : `k${i}`, { position: i, markdown: i === 0 ? "z" : "y".repeat(20_000) }));
    await expect(tools.memoUpdateSection(upd({ markdown: "x".repeat(10_001) }), P, DRY)).rejects.toThrow("A memo is limited to 150,000 characters in total.");
  });
});

describe("memo_link_company", () => {
  const link = (over: Record<string, unknown> = {}) => tools.memoLinkCompanyInput.parse({ memoId: "own", expectedVersion: 1, company: "Acme", ...over });

  it("preview: 'Not in Molly yet: Acme' becomes 'Acme', echoes the memo version", async () => {
    const out = await tools.memoLinkCompany(link(), P, DRY);
    expect(out.structured.preview).toMatchObject({
      action: "Link memo to company", target: "Acme: seed", expectedVersion: 1,
      fields: [{ label: "Company", before: "Not in Molly yet: Acme", after: "Acme" }], warnings: [],
    });
  });
  it("accepts an id or an exact name (either stage); apply links, clears the pending name, bumps the version, audits ids", async () => {
    const out = await tools.memoLinkCompany(link({ company: "c1" }), P, APPLY);
    expect(out.structured).toEqual({ memoId: "own", companyId: "c1", version: 2, url: "https://molly.dfs.vc/admin/memos/own" });
    expect(state.memos[0]).toMatchObject({ companyId: "c1", companyNamePending: null, version: 2 });
    expect(audit.logAdminAction).toHaveBeenCalledWith(P, "MEMO_COMPANY_LINKED", expect.objectContaining({ metadata: { memoId: "own", companyId: "c1", via: "marge", margeActionId: "act1" } }));
    await expect(tools.memoLinkCompany(link({ expectedVersion: 2, company: "Beta Co" }), P, DRY)).rejects.toThrow("This memo is already linked to Acme.");
  });
  it("sentences: stale memo, unknown or ambiguous company", async () => {
    await expect(tools.memoLinkCompany(link({ expectedVersion: 9 }), P, DRY)).rejects.toThrow("This memo changed since I showed it to you. Ask me again.");
    await expect(tools.memoLinkCompany(link({ company: "Acm" }), P, DRY)).rejects.toThrow("No company called “Acm”. Closest: Acme.");
    await expect(tools.memoLinkCompany(link({ company: "Gamma" }), P, DRY)).rejects.toThrow("“Gamma” matches 2 companies: Gamma, Gamma. Use the id.");
    expect(state.writes).toBe(0);
  });
  it("a stale apply (version moved after the preview) writes nothing", async () => {
    state.memos[0].version = 2;
    await expect(tools.memoLinkCompany(link(), P, APPLY)).rejects.toThrow("This memo changed since I showed it to you. Ask me again.");
    expect(state.memos[0].companyId).toBeNull();
  });
});

describe("deal-ledger companies (Part 42, WS138)", () => {
  const link = (over: Record<string, unknown> = {}) => tools.memoLinkCompanyInput.parse({ memoId: "own", expectedVersion: 1, company: "Globex", ...over });
  beforeEach(() => {
    state.ledger = [
      { id: "l1", name: "Globex", companyId: null },
      { id: "l2", name: "Beta Holdings", companyId: "c2" }, // the ledger row of a Company, under an older name
      { id: "l3", name: "Gamma", companyId: null }, // same name as two Companies
    ];
  });

  it("link by ledger exact name: preview says '(deal ledger)'; apply stores the ledger id and returns portfolioCompanyId instead of companyId", async () => {
    const pv = await tools.memoLinkCompany(link({ company: "globex" }), P, DRY);
    expect(pv.structured.preview).toMatchObject({ fields: [{ label: "Company", before: "Not in Molly yet: Acme", after: "Globex (deal ledger)" }] });
    const out = await tools.memoLinkCompany(link(), P, APPLY);
    expect(out.structured).toEqual({ memoId: "own", portfolioCompanyId: "l1", version: 2, url: "https://molly.dfs.vc/admin/memos/own" });
    expect(state.memos[0]).toMatchObject({ companyId: null, portfolioCompanyId: "l1", companyNamePending: null, version: 2 });
    expect(audit.logAdminAction).toHaveBeenCalledWith(P, "MEMO_COMPANY_LINKED", expect.objectContaining({ metadata: { memoId: "own", portfolioCompanyId: "l1", via: "marge", margeActionId: "act1" } }));
    await expect(tools.memoLinkCompany(link({ expectedVersion: 2, company: "Acme" }), P, DRY)).rejects.toThrow("This memo is already linked to Globex.");
  });

  it("link by ledger id", async () => {
    const out = await tools.memoLinkCompany(link({ company: "l1" }), P, APPLY);
    expect(out.structured).toMatchObject({ portfolioCompanyId: "l1" });
    expect(state.memos[0].portfolioCompanyId).toBe("l1");
  });

  it("a ledger row that has a Company links the Company, by id or by the ledger's own name, and returns companyId", async () => {
    const byName = await tools.memoLinkCompany(link({ company: "Beta Holdings" }), P, DRY);
    expect(byName.structured.preview).toMatchObject({ fields: [{ after: "Beta Co" }] });
    const out = await tools.memoLinkCompany(link({ company: "l2" }), P, APPLY);
    expect(out.structured).toEqual({ memoId: "own", companyId: "c2", version: 2, url: "https://molly.dfs.vc/admin/memos/own" });
    expect(state.memos[0]).toMatchObject({ companyId: "c2", portfolioCompanyId: null });
  });

  it("ambiguous across the two tables, and closest names come from both", async () => {
    await expect(tools.memoLinkCompany(link({ company: "Gamma" }), P, DRY)).rejects.toThrow("“Gamma” matches 3 companies: Gamma, Gamma, Gamma. Use the id.");
    await expect(tools.memoLinkCompany(link({ company: "Glob" }), P, DRY)).rejects.toThrow("No company called “Glob”. Closest: Globex.");
    expect(state.writes).toBe(0);
  });

  it("memo_list: filter by a ledger name, by a Company that owns a ledger row, and unlinked excludes ledger-linked memos", async () => {
    state.memos[0].portfolioCompanyId = "l1";
    state.memos[0].companyNamePending = null;
    state.memos[2].companyId = null; // team memo: linked to nothing but the ledger row of Beta Co
    state.memos[2].portfolioCompanyId = "l2";
    const ids = async (input: Row) => ((await tools.memoList(input, P)).structured.memos as Row[]).map((m) => m.id);
    expect(await ids({ company: "Globex" })).toEqual(["own"]);
    expect(await ids({ company: "Beta Co" })).toEqual(["team"]);
    expect(await ids({ unlinked: true })).toEqual([]);
    expect(await ids({ query: "globex" })).toEqual(["own"]);
  });

  it("memo_list and memo_get label a ledger link '(deal ledger)' and add portfolioCompanyId and companyKind; pending text is unchanged", async () => {
    const before = await tools.memoList({}, P);
    expect((before.structured.memos as Row[])[0]).toMatchObject({ company: "Not in Molly yet: Acme", companyKind: "pending", portfolioCompanyId: null, companyNamePending: "Acme" });
    state.memos[0].portfolioCompanyId = "l1";
    state.memos[0].companyNamePending = null;
    const out = await tools.memoList({}, P);
    expect(out.text).toContain("Globex (deal ledger)");
    expect((out.structured.memos as Row[])[0]).toMatchObject({ company: "Globex (deal ledger)", companyId: null, portfolioCompanyId: "l1", companyKind: "ledger", companyNamePending: null });
    const got = await tools.memoGet({ memoId: "own" }, P);
    expect(got.text).toContain("Company: Globex (deal ledger)");
    expect(got.structured.memo).toMatchObject({ company: "Globex (deal ledger)", portfolioCompanyId: "l1", companyKind: "ledger" });
    const linked = await tools.memoList({ company: "Beta Co" }, P);
    expect((linked.structured.memos as Row[])[0]).toMatchObject({ companyKind: "company", companyId: "c2", portfolioCompanyId: null });
  });

  it("memo_create preview: suggestedCompany carries kind 'ledger' for a ledger match; a Company match is unchanged", async () => {
    const out = await tools.memoCreate(tools.memoCreateInput.parse(createArgs({ companyNamePending: "Globex" })), P, DRY);
    expect(out.structured.suggestedCompany).toEqual({ id: "l1", name: "Globex", kind: "ledger" });
    expect((out.structured.preview as { warnings: string[] }).warnings).toContain("Globex looks like it is already in Molly. Link it to keep things together.");
    const acme = await tools.memoCreate(tools.memoCreateInput.parse(createArgs()), P, DRY);
    expect(acme.structured.suggestedCompany).toEqual({ id: "c1", name: "Acme" });
  });

  it("memo_create has no way to set a ledger id: the input has no such field and a smuggled one is stripped", () => {
    const parsed = tools.memoCreateInput.parse(createArgs({ portfolioCompanyId: "l1" })) as Row;
    expect(parsed.portfolioCompanyId).toBeUndefined();
    expect(tools.memoLinkCompanyInput.shape.company.description).toBe("company id, deal-ledger id, or exact name");
  });
});

describe("no tool or argument can change visibility, status, share links, archive or ownership", () => {
  const smuggled = { visibility: "TEAM", status: "FINAL", shareLinks: [{ label: "x" }], archivedAt: "2020-01-01", ownerId: "u2", draftedByMarge: false, includeInShare: false, version: 99, createKey: "x", position: 7 };

  it("zod strips every such key from every memo tool input", () => {
    const create = tools.memoCreateInput.parse(createArgs({ ...smuggled, sections: [{ key: "a", title: "A", markdown: "m", ...smuggled }] }));
    const update = tools.memoUpdateSectionInput.parse({ memoId: "own", sectionKey: "team", expectedVersion: 3, markdown: "x", ...smuggled });
    const link = tools.memoLinkCompanyInput.parse({ memoId: "own", expectedVersion: 1, company: "Acme", ...smuggled });
    for (const parsed of [create, update, link, tools.memoGetInput.parse({ memoId: "own", ...smuggled })] as Row[]) {
      for (const k of Object.keys(smuggled)) expect(parsed, k).not.toHaveProperty(k);
    }
    // memo_list takes `status` as a read-only FILTER (never a change); everything else is stripped
    const list = tools.memoListInput.parse({ ...smuggled }) as Row;
    expect(list.status).toBe("FINAL");
    for (const k of Object.keys(smuggled).filter((x) => x !== "status")) expect(list, k).not.toHaveProperty(k);
    expect(Object.keys((create.sections as Row[])[0]).sort()).toEqual(["key", "markdown", "title"]);
  });

  it("an apply with smuggled keys reaches Prisma without them", async () => {
    await tools.memoCreate(tools.memoCreateInput.parse(createArgs(smuggled)), P, APPLY);
    const db = (await import("@/lib/db")).db as unknown as Row;
    const data = db.memo.create.mock.calls[0][0].data as Row;
    expect(data.visibility).toBeUndefined();
    expect(data.status).toBeUndefined();
    expect(data.archivedAt).toBeUndefined();
    expect(data.ownerId).toBe("u1");
    expect(data.draftedByMarge).toBe(true);
    expect(data).not.toHaveProperty("shareLinks");
    await tools.memoUpdateSection(tools.memoUpdateSectionInput.parse({ memoId: "own", sectionKey: "team", expectedVersion: 3, markdown: "new", ...smuggled }), P, APPLY);
    const secUpdate = db.memoSection.updateMany.mock.calls[0][0].data as Row;
    for (const k of ["visibility", "status", "archivedAt", "ownerId", "position"]) expect(secUpdate, k).not.toHaveProperty(k);
    expect(secUpdate.includeInShare).toBe(true); // unchanged: Marge cannot flip the share toggle
    await tools.memoLinkCompany(tools.memoLinkCompanyInput.parse({ memoId: "own", expectedVersion: 1, company: "Acme", ...smuggled }), P, APPLY);
    const memoUpdates = [...db.memo.updateMany.mock.calls, ...db.memo.update.mock.calls].map((c) => JSON.stringify((c[0] as Row).data));
    for (const d of memoUpdates) expect(d).not.toMatch(/visibility|status|archivedAt|ownerId|shareLinks/);
    expect(Object.keys(state.memos.find((m) => m.id === "own")!)).not.toContain("shareLinks");
  });

  it("the tools module offers no way to create, list or revoke share links, archive, restore, or change the template", async () => {
    const exported = Object.keys(tools).filter((k) => typeof (tools as Row)[k] === "function").sort();
    expect(exported).toEqual(["memoCreate", "memoGet", "memoLinkCompany", "memoList", "memoTemplateGet", "memoUpdateSection"]);
    expect(Object.keys(MARGE_MEMO_TOOLS)).toHaveLength(6);
    const src = (await import("node:fs")).readFileSync("src/lib/marge-tools/memos.ts", "utf8");
    for (const banned of ["createShareLink", "revokeShareLink", "listShareLinks", "archiveMemo", "setMemoVisibility", "setMemoStatus", "restoreSection", "saveTemplate", "removeSection", "addSection", "reorderSections", "updateMemoMeta", "setMemoDecision"]) {
      expect(src, banned).not.toMatch(new RegExp(`\\b${banned}\\b`));
    }
  });
});

describe("the write contract through the route", () => {
  it("a correct write token applies memo_create; the write audits itself under the asker with via marge", async () => {
    const args = createArgs();
    const res = await applyCall("memo_create", args);
    const r = await result(res);
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toMatchObject({ duplicate: false, version: 1 });
    expect(state.memos.at(-1)).toMatchObject({ ownerId: "u1", draftedByMarge: true });
    expect(limiter.checkRateLimit).toHaveBeenCalledWith("marge-write", "u1", 30);
    const rows = audit.logAdminAction.mock.calls.map((c) => c[1]);
    expect(rows).toEqual(["MEMO_CREATED"]);
    expect(audit.logAdminAction.mock.calls[0][2].metadata).toMatchObject({ via: "marge", margeActionId: "act-77" });
  });

  it("the token is bound to the exact arguments: one changed character in one section is 'not confirmed'", async () => {
    const args = createArgs();
    const changed = createArgs({ sections: [{ ...args.sections[0], markdown: args.sections[0].markdown.replace("Jane", "Janet") }, args.sections[1]] });
    const res = await applyCall("memo_create", changed, { hashOf: args }); // the token was minted for the previewed args
    expect(await sentence(res)).toBe("That change wasn't confirmed, so nothing was changed.");
    expect(state.memos).toHaveLength(5);
    const denied = audit.logAdminAction.mock.calls.find((c) => c[1] === "MARGE_DENIED")!;
    expect(denied[2].metadata).toMatchObject({ tool: "memo_create", reason: "not_confirmed" });
    // and the same for the other two writes
    const upd = { memoId: "own", sectionKey: "team", expectedVersion: 3, markdown: "New text" };
    expect(await sentence(await applyCall("memo_update_section", { ...upd, markdown: "New texu" }, { hashOf: upd }))).toBe("That change wasn't confirmed, so nothing was changed.");
    const lnk = { memoId: "own", expectedVersion: 1, company: "Acme" };
    expect(await sentence(await applyCall("memo_link_company", { ...lnk, company: "Beta Co" }, { hashOf: lnk }))).toBe("That change wasn't confirmed, so nothing was changed.");
    expect(state.revisions).toHaveLength(0);
    expect(state.memos[0].companyId).toBeNull();
  });

  it("refused: a read-scope token, and a token minted for a different tool", async () => {
    const args = createArgs();
    expect(await sentence(await post(callBody("memo_create", { ...args, dryRun: false })))).toBe("That change wasn't confirmed, so nothing was changed.");
    const wrongTool = await token({ scope: "write", act: { tool: "board_card_create", h: argsHash(args), aid: "a" } });
    expect(await sentence(await post(callBody("memo_create", { ...args, dryRun: false }), wrongTool))).toBe("That change wasn't confirmed, so nothing was changed.");
    expect(state.memos).toHaveLength(5);
  });

  it("a replayed idempotent apply with a fresh token returns duplicate: true and one row", async () => {
    const args = createArgs();
    await applyCall("memo_create", args);
    const again = await result(await applyCall("memo_create", args));
    expect(again.structuredContent?.duplicate).toBe(true);
    expect(state.memos.filter((m) => m.title === args.title)).toHaveLength(1);
  });

  it("an apply that fails after the token check is one MARGE_DENIED row with the conflict reason", async () => {
    const upd = { memoId: "own", sectionKey: "team", expectedVersion: 1, markdown: "late" };
    expect(await sentence(await applyCall("memo_update_section", upd))).toBe("This section changed since I showed it to you. Ask me again.");
    const row = audit.logAdminAction.mock.calls.find((c) => c[1] === "MARGE_DENIED")!;
    expect(row[2].metadata).toMatchObject({ tool: "memo_update_section", reason: "conflict" });
  });

  it("a person who is no longer an approved admin gets the sentence and nothing runs", async () => {
    state.users = [{ ...SAM, status: "REJECTED" }, JANE];
    expect(await sentence(await post(callBody("memo_list")))).toBe("You don't have admin access in Molly.");
  });

  it("a memo read is one MARGE_READ row with a count, never content", async () => {
    const res = await post(callBody("memo_get", { memoId: "own" }));
    expect((await sentence(res))).toContain("Own text one");
    expect(audit.logAdminAction.mock.calls.map((c) => c[1])).toEqual(["MARGE_READ"]);
    expect(JSON.stringify(audit.logAdminAction.mock.calls)).not.toContain("Own text one");
  });

  it("an unexpected error is generic; a ToolError is its own sentence", async () => {
    const db = (await import("@/lib/db")).db as unknown as Row;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.memo.findMany.mockRejectedValueOnce(new Error(`boom ${CANARY}`));
    expect(await sentence(await post(callBody("memo_list")))).toBe("Molly had a problem; nothing was changed.");
    expect(JSON.stringify(spy.mock.calls)).not.toContain(CANARY);
    spy.mockRestore();
    expect(ToolError).toBeDefined();
  });
});

describe("the shared create action is the same one the web uses", () => {
  it("createMemo with via marks the memo drafted by Marge; without it the memo is not", async () => {
    const web = await createMemo({ id: "u1" }, { title: "Web memo" });
    expect(web.ok && state.memos.find((m) => m.id === web.value.id)!.draftedByMarge).toBe(false);
  });
});

describe("decision and sources (Part 41, WS132)", () => {
  it("memo_get and memo_list return the decision as its label (null when not set); output only", async () => {
    state.memos.find((m) => m.id === "team")!.decision = "INVESTED";
    const own = await tools.memoGet({ memoId: "own" }, P);
    expect(own.structured.memo).toMatchObject({ decision: null });
    expect(own.text).toContain("Stage: not set");
    const team = await tools.memoGet({ memoId: "team" }, P);
    expect(team.structured.memo).toMatchObject({ decision: "Invested" });
    expect(team.text).toMatch(/Source: not set · Stage: Invested · Tags: none/);
    const list = await tools.memoList({}, P);
    const rows = list.structured.memos as Row[];
    expect(rows.find((m) => m.id === "team")).toMatchObject({ decision: "Invested" });
    expect(rows.find((m) => m.id === "own")).toMatchObject({ decision: null });
    expect(list.text).toContain("· Invested · owner Jane Partner");
  });

  it("Part 44: the stored IN_PROGRESS value reads as its new label in Marge's output", async () => {
    state.memos.find((m) => m.id === "team")!.decision = "IN_PROGRESS";
    const team = await tools.memoGet({ memoId: "team" }, P);
    expect(team.structured.memo).toMatchObject({ decision: "Evaluating" });
  });

  it("memo_create has no decision input: zod strips it and Prisma never receives it", async () => {
    expect(tools.memoCreateInput.parse(createArgs({ decision: "INVESTED" }))).not.toHaveProperty("decision");
    await tools.memoCreate(tools.memoCreateInput.parse(createArgs({ decision: "INVESTED" })), P, APPLY);
    const db = (await import("@/lib/db")).db as unknown as Row;
    expect(db.memo.create.mock.calls[0][0].data).not.toHaveProperty("decision");
  });

  it("memo_create's source describes the allowed values, and an old value now fails with the sentence", async () => {
    const shape = (tools.memoCreateInput as unknown as { shape: Row }).shape;
    expect(shape.source.description).toBe("one of: Cold Outreach, Founder Intro, VC Intro, Conference, Operator Intro, Warm Outreach, Partner event");
    await expect(tools.memoCreate(tools.memoCreateInput.parse(createArgs({ source: "Referral" })), P, DRY)).rejects.toThrow("That source isn't one of the options.");
  });
});
