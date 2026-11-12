import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import * as jose from "jose";
import { emptyState, makeFakeDb, type FakeState } from "./fake-founder-db";

// Part 45 (WS150): the six founder-update tools, through the real route, the real gate (runTool), the real
// tool functions and the real shared actions, against the in-memory fake db (with rollback). Mocked audit,
// rate limiter, email. Synthetic names only. Existing Marge test files are untouched.

type Row = Record<string, any>;
const h = vi.hoisted(() => ({ holder: { db: null as any }, audit: vi.fn(), emailCalls: vi.fn(), limiter: vi.fn(async () => true), auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: () => h.auth() }));
vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: (_t, k) => h.holder.db[k as string] }) }));
vi.mock("@/lib/org", () => ({ isAdminEmailDomain: (e: string) => e.endsWith("@dfs.example") || e.endsWith("@example.com") }));
vi.mock("@/lib/audit", () => ({ logAdminAction: (...a: unknown[]) => h.audit(...a) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => h.limiter() }));
vi.mock("@/lib/email", () => new Proxy({}, { get: () => h.emailCalls }));
vi.mock("@/lib/publish-update", () => ({ publishUpdate: h.emailCalls }));

import { POST } from "@/app/api/mcp/marge/route";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { MARGE_TOOLS, MARGE_MEMO_TOOLS, MARGE_PORTCO_TOOLS, MARGE_COMPANY_TOOLS } from "@/lib/marge-tools/tiers";
import { argsHash } from "@/lib/marge-hash";
import * as tools from "@/lib/marge-tools/portco";
import * as C from "@/lib/marge-tools/portco-contract";

const KID = "marge-test";
const URL_ = "https://molly.dfs.vc/api/mcp/marge";
let priv: jose.CryptoKey;
let state: FakeState;
let counts: Record<string, number>;
const SAM = { id: "u1", email: "admin@example.com", name: "Sam Partner", googleId: "g-1", roles: ["ADMIN"], status: "APPROVED" };
const FOUNDER = { id: "f1", email: "pat@acme.example", name: "Pat Founder", googleId: "g-f", roles: ["FOUNDER"], status: "APPROVED" };
const P = { id: "u1", email: "admin@example.com", name: "Sam Partner" };
const VIA = { via: "marge" as const, margeActionId: "act1" };
const DRY = { dryRun: true };
const APPLY = { dryRun: false, via: VIA };

async function token(over: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({ sub: "g-1", email: "admin@example.com", scope: "read", ctx: "private", jti: crypto.randomUUID(), iss: "marge", aud: "molly-mcp", iat: now, exp: now + 60, ...over } as jose.JWTPayload)
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
async function applyCall(name: string, args: Record<string, unknown>, over: { hashOf?: Record<string, unknown>; ctx?: string } = {}) {
  const tok = await token({ scope: "write", ctx: over.ctx ?? "private", act: { tool: name, h: argsHash(over.hashOf ?? args), aid: "act-77" } });
  return post(callBody(name, { ...args, dryRun: false }), tok);
}
async function result(res: Response) {
  const j = await json(res);
  return j.result as { isError?: boolean; content: { text: string }[]; structuredContent?: Row };
}
const names = async () => ((await json(await post(rpc("tools/list", {})))).result.tools as { name: string }[]).map((t) => t.name).sort();
const writeCalls = () => Object.entries(counts).filter(([k]) => /\.(create|update|updateMany|delete|deleteMany)$/.test(k));

const source = { kind: "slack_email", channelId: "C123", messageTs: "1700000000.0001", permalink: "https://slack.example/p1", subject: "Q3 update", fromName: "Pat Founder", fromDomain: "zeta.example", forwardedBy: "Sam" };
const updateArgs = (over: Record<string, unknown> = {}) => ({
  companyId: "co1", period: "2025-Q3", title: "Q3 update", bodyText: "We grew.", sentAt: "2025-10-03", source, idempotencyKey: "upd_key_0001", ...over,
});
const newCompany = (over: Record<string, unknown> = {}) => ({ name: "Zeta Labs", ledgerId: "L1", idempotencyKey: "pc_L1_00001", ...over });

const saved = { ...process.env };
beforeAll(async () => {
  const k = await jose.generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  priv = k.privateKey;
  process.env.__JWKS = JSON.stringify({ keys: [{ ...(await jose.exportJWK(k.publicKey)), kid: KID, alg: "EdDSA", use: "sig" }] });
});
beforeEach(() => {
  state = emptyState();
  const fake = makeFakeDb(state);
  counts = fake.counts;
  h.holder.db = {
    ...fake.db,
    user: { findUnique: async ({ where }: Row) => state.users.find((u) => u.googleId === where.googleId) ?? null, findFirst: async () => null },
    rateLimitCounter: { create: async () => ({}) },
  };
  vi.clearAllMocks();
  h.limiter.mockResolvedValue(true);
  state.users.push(SAM, FOUNDER);
  state.company.push(
    { id: "co1", name: "Acme Robotics", aliases: ["Acme"], website: "https://www.acme.example", stage: "ACTIVE", createdById: "u1", createdAt: new Date("2025-01-01") },
    { id: "dd", name: "Diligence Target", aliases: [], website: null, stage: "DILIGENCE", createdById: "u1", createdAt: new Date("2025-01-01") },
    { id: "pend", name: "Pending Signup Co", aliases: [], website: null, stage: "ACTIVE", createdById: "f2", createdAt: new Date("2025-01-01") }
  );
  state.users.push({ id: "f2", roles: ["FOUNDER"], status: "PENDING", approvalToken: null });
  state.membership.push({ userId: "f1", companyId: "co1" });
  state.portfolioCompany.push(
    { id: "L1", name: "Zeta Labs", country: "Kenya", companyId: null },
    { id: "L2", name: "Kappa Works", country: "Ghana", companyId: null },
    { id: "L3", name: "Acme Robotics Ltd", country: "Egypt", companyId: "co1" }
  );
  state.contact.push({ portfolioCompanyId: "L2", email: "ops@kappa.example" }, { portfolioCompanyId: "L2", email: "x@gmail.com" });
  process.env.MARGE_ASSERTION_JWKS = process.env.__JWKS;
  process.env.MARGE_MCP_MODE = "write";
  process.env.MARGE_PORTCO_TOOLS = "on";
  process.env.MARGE_COMPANY_CREATE = "on";
  delete process.env.MARGE_MEMO_TOOLS;
});
afterEach(() => {
  for (const k of ["MARGE_ASSERTION_JWKS", "MARGE_MCP_MODE", "MARGE_PORTCO_TOOLS", "MARGE_COMPANY_CREATE", "MARGE_MEMO_TOOLS", "MARGE_COMPANY_CREATE_PER_DAY"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("the contract: tools, tiers, flags", () => {
  it("names the five and the one, with the contract tiers; MARGE_TOOLS and MARGE_MEMO_TOOLS are as they were", () => {
    expect(MARGE_PORTCO_TOOLS).toEqual({ updates_list: "team", metrics_list: "team", company_match: "dm", update_create: "dm_write", metric_value_set: "dm_write" });
    expect(MARGE_COMPANY_TOOLS).toEqual({ company_create: "dm_write" });
    expect(Object.keys(MARGE_TOOLS)).toHaveLength(13);
    expect(Object.keys(MARGE_MEMO_TOOLS)).toHaveLength(6);
    expect(C.MARGE_PORTCO_FLAG).toBe("MARGE_PORTCO_TOOLS");
    expect(C.MARGE_COMPANY_CREATE_FLAG).toBe("MARGE_COMPANY_CREATE");
  });
  it("tools/list holds exactly the 13 with no flag (checked by names)", async () => {
    delete process.env.MARGE_PORTCO_TOOLS;
    delete process.env.MARGE_COMPANY_CREATE;
    expect(await names()).toEqual(Object.keys(MARGE_TOOLS).sort());
  });
  it("plus the 5 portco names with MARGE_PORTCO_TOOLS; company_create only when both flags are on", async () => {
    delete process.env.MARGE_COMPANY_CREATE;
    expect(await names()).toEqual([...Object.keys(MARGE_TOOLS), ...Object.keys(MARGE_PORTCO_TOOLS)].sort());
    process.env.MARGE_COMPANY_CREATE = "on";
    expect(await names()).toEqual([...Object.keys(MARGE_TOOLS), ...Object.keys(MARGE_PORTCO_TOOLS), "company_create"].sort());
    delete process.env.MARGE_PORTCO_TOOLS; // MARGE_COMPANY_CREATE alone does nothing
    expect(await names()).toEqual(Object.keys(MARGE_TOOLS).sort());
  });
  it("with memo tools too, the three groups sit side by side by name", async () => {
    process.env.MARGE_MEMO_TOOLS = "on";
    expect(await names()).toEqual([...Object.keys(MARGE_TOOLS), ...Object.keys(MARGE_MEMO_TOOLS), ...Object.keys(MARGE_PORTCO_TOOLS), "company_create"].sort());
  });
  it("a flagged-off tool is 'not found' and writes nothing", async () => {
    delete process.env.MARGE_PORTCO_TOOLS;
    const res = await json(await post(callBody("company_match", { names: ["Acme"] })));
    expect(res.result?.content?.[0]?.text ?? res.error?.message ?? "").toMatch(/not found|unknown tool|Tool .* not/i);
    process.env.MARGE_PORTCO_TOOLS = "on";
    delete process.env.MARGE_COMPANY_CREATE;
    const r2 = await json(await post(callBody("company_create", newCompany())));
    expect(r2.result?.content?.[0]?.text ?? r2.error?.message ?? "").toMatch(/not found|unknown tool|Tool .* not/i);
    expect(writeCalls()).toEqual([]);
  });
  it("the body cap is raised when the portco tools are on (F157)", async () => {
    const big = JSON.stringify(rpc("tools/list", { pad: "x".repeat(70_000) }));
    expect((await post(big)).status).not.toBe(413);
    delete process.env.MARGE_PORTCO_TOOLS;
    expect((await post(big)).status).toBe(413);
  });
});

describe("gate: tiers, read-only mode, confirmation", () => {
  it("company_match, update_create, metric_value_set and company_create refuse in a team channel, dry run included", async () => {
    for (const [name, args] of [
      ["company_match", { names: ["Acme"] }],
      ["update_create", updateArgs()],
      ["metric_value_set", { companyId: "co1", name: "MRR", value: 1, date: "2025-09-30" }],
      ["company_create", newCompany()],
    ] as const) {
      const r = await result(await post(callBody(name, args), await token({ ctx: "team" })));
      expect(r.isError, name).toBe(true);
      expect(r.content[0].text, name).toBe("That's DM-only. Ask me in a DM.");
    }
    expect(writeCalls()).toEqual([]);
  });
  it("updates_list and metrics_list answer in a team channel", async () => {
    const r = await result(await post(callBody("updates_list", { company: "Acme Robotics" }), await token({ ctx: "team" })));
    expect(r.isError).toBeFalsy();
  });
  it("MARGE_MCP_MODE=read refuses every apply with Part 39's sentence", async () => {
    process.env.MARGE_MCP_MODE = "read";
    for (const [name, args] of [["update_create", updateArgs()], ["metric_value_set", { companyId: "co1", name: "MRR", value: 1, date: "2025-09-30" }], ["company_create", newCompany()]] as const) {
      const r = await result(await applyCall(name, args));
      expect(r.content[0].text, name).toBe("Molly is in read-only mode for Marge.");
    }
    expect(writeCalls()).toEqual([]);
  });
  it("an apply whose arguments differ from the confirmed hash is refused", async () => {
    const r = await result(await applyCall("update_create", updateArgs(), { hashOf: updateArgs({ title: "Other" }) }));
    expect(r.content[0].text).toBe("That change wasn't confirmed, so nothing was changed.");
    expect(state.update).toHaveLength(0);
  });
  it("Part 39's argsHash test vector still passes", () => {
    expect(argsHash({ title: "Send deck", owners: ["me", "Sam Partner"], dryRun: false, dueDate: "2026-10-23" })).toBe("012e48d7aaede96a103cf2ad1ae256355c672e9a4acdaebeb701482d206cefab");
  });
});

describe("dry runs write nothing", () => {
  it("company_create, update_create (both shapes) and metric_value_set", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["company_create", newCompany()],
      ["update_create", updateArgs()],
      ["update_create", updateArgs({ companyId: undefined, newCompany: newCompany(), idempotencyKey: "upd_key_0002" })],
      ["metric_value_set", { companyId: "co1", name: "MRR", unit: "USD", value: 1, date: "2025-09-30" }],
    ];
    for (const [name, args] of calls) {
      const r = await result(await post(callBody(name, args)));
      expect(r.isError, `${name}: ${r.content[0].text}`).toBeFalsy();
      expect(r.structuredContent?.preview).toBeTruthy();
    }
    expect(writeCalls()).toEqual([]);
    expect(h.audit.mock.calls.every((c) => c[1] === "MARGE_READ")).toBe(true);
  });
});

describe("company_match", () => {
  it("sees active, pending-signup and diligence companies, folds linked ledger rows, ranks STRONG first, returns no '@'", async () => {
    const r = await result(await post(callBody("company_match", { names: ["Acme Robotics", "Pending Signup Co", "Diligence Target", "Kappa Works"], domain: "kappa.example" })));
    const s = r.structuredContent as unknown as C.CompanyMatchStructured;
    expect(s.companies.map((c) => [c.id, c.tier, c.state, c.hasFounder])).toEqual([
      ["co1", "STRONG", "active", true],
      ["dd", "STRONG", "diligence", false],
      ["pend", "STRONG", "pending_signup", false],
    ]);
    expect(s.companies[0].reasons).toEqual(["NAME_EXACT"]);
    expect(s.companies[0].ledgerId).toBe("L3");
    expect(s.ledger.map((l) => l.id)).toEqual(["L2"]); // L3 is linked, so folded into co1
    expect(s.ledger[0]).toMatchObject({ tier: "STRONG", reasons: ["NAME_EXACT", "CONTACT_DOMAIN"], contactCount: 2, contactAtDomain: true, linkedCompanyId: null });
    expect(JSON.stringify(r)).not.toContain("@");
    expect(writeCalls()).toEqual([]);
  });
  it("matches on alias, website domain and weak tokens; ignores free-mail and DFS domains", async () => {
    const m = async (args: Row) => ((await result(await post(callBody("company_match", args)))).structuredContent as unknown as C.CompanyMatchStructured);
    expect((await m({ names: ["Acme"] })).companies[0].reasons).toContain("ALIAS_EXACT");
    expect((await m({ names: ["Zzz"], domain: "acme.example" })).companies[0].reasons).toEqual(["WEBSITE_DOMAIN"]);
    expect((await m({ names: ["Acme Robotics Africa"] })).companies[0]).toMatchObject({ tier: "WEAK", reasons: ["NAME_TOKENS"] });
    expect((await m({ names: ["Zzz"], domain: "gmail.com" })).companies).toEqual([]);
    expect((await m({ names: ["Zzz"], domain: "dfs.example" })).companies).toEqual([]);
    // an address in place of a domain is refused outright
    const k = await result(await post(callBody("company_match", { names: ["Zzz"], domain: "x@kappa.example" })));
    expect(k.content[0].text).toBe(C.PORTCO_SENTENCES.badDomain);
  });
  it("refuses bad input with a sentence", async () => {
    const r = await result(await post(callBody("company_match", { names: [] })));
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe(C.PORTCO_SENTENCES.badNames);
  });
});

describe("updates_list / metrics_list", () => {
  beforeEach(() => {
    state.update.push(
      { id: "u-a", companyId: "co1", createdById: "f1", period: "2025-Q3", title: "From founder", body: "<p>Hi <b>there</b></p>", status: "SENT", sentAt: new Date("2025-10-03T12:00:00Z"), source: "FOUNDER", createdAt: new Date("2025-10-03") },
      { id: "u-b", companyId: "co1", createdById: "u1", period: "2025-Q2", title: "Draft", body: "<p>draft</p>", status: "DRAFT", sentAt: null, source: "FOUNDER", createdAt: new Date("2025-07-01") }
    );
    state.metricDefinition.push({ id: "d1", companyId: "co1", name: "MRR", unit: "USD" });
    state.metricValue.push(
      { id: "v1", metricDefinitionId: "d1", value: 10, date: new Date("2025-07-31"), updateId: null, via: null, enteredById: null },
      { id: "v2", metricDefinitionId: "d1", value: 11, date: new Date("2025-08-31"), updateId: "u-b", via: null, enteredById: null },
      { id: "v3", metricDefinitionId: "d1", value: 12, date: new Date("2025-09-30"), updateId: null, via: "marge", enteredById: "u1" }
    );
  });
  it("lists by period or by sentAt range, marks drafts, previews text under a label, never an email", async () => {
    let r = await result(await post(callBody("updates_list", { company: "acme robotics", period: "2025-Q3" })));
    let s = r.structuredContent as unknown as C.UpdatesListStructured;
    expect(s.updates.map((u) => u.id)).toEqual(["u-a"]);
    expect(s.updates[0]).toMatchObject({ title: "From founder", status: "SENT", sentAt: "2025-10-03", source: "FOUNDER", createdBy: "Pat Founder", bodyPreview: "Hi there", metricCount: 0 });
    expect(r.content[0].text).toContain("Founder-written update (untrusted text):");
    r = await result(await post(callBody("updates_list", { company: "co1", since: "2025-09-01", until: "2025-10-31" })));
    s = r.structuredContent as unknown as C.UpdatesListStructured;
    expect(s.updates.map((u) => u.id)).toEqual(["u-a"]);
    r = await result(await post(callBody("updates_list", { company: "co1" })));
    s = r.structuredContent as unknown as C.UpdatesListStructured;
    expect(s.updates.map((u) => [u.id, u.status])).toEqual([["u-a", "SENT"], ["u-b", "DRAFT"]]);
    expect(JSON.stringify(r)).not.toContain("@");
  });
  it("resolves any company (diligence too) and refuses unknown, ambiguous and out-of-range", async () => {
    expect((await result(await post(callBody("updates_list", { company: "Diligence Target" })))).isError).toBeFalsy();
    expect((await result(await post(callBody("updates_list", { company: "Acme Robot" })))).content[0].text).toBe("No company called “Acme Robot”. Closest: Acme Robotics.");
    state.company.push({ id: "dup", name: "ACME ROBOTICS", aliases: [] });
    expect((await result(await post(callBody("updates_list", { company: "acme robotics" })))).content[0].text).toMatch(/^“acme robotics” matches 2 companies: .*Use the id\.$/);
    expect((await result(await post(callBody("updates_list", { company: "co1", limit: 51 })))).content[0].text).toBe(C.PORTCO_SENTENCES.badLimit(50));
  });
  it("metrics_list returns the newest values with their source", async () => {
    const r = await result(await post(callBody("metrics_list", { company: "co1", values: 2 })));
    const s = r.structuredContent as unknown as C.MetricsListStructured;
    expect(s.metrics[0].values.map((v) => [v.id, v.source])).toEqual([["v3", "marge"], ["v2", "admin"]]); // v2 is on an admin-written update
    expect((await result(await post(callBody("metrics_list", { company: "co1", values: 0 })))).structuredContent!.metrics[0].values).toEqual([]);
    expect((await result(await post(callBody("metrics_list", { company: "co1", values: 25 })))).content[0].text).toBe(C.PORTCO_SENTENCES.badValuesCount);
  });
});

describe("company_create through the route", () => {
  it("dry run previews; apply creates a company with zero memberships, the ledger link, both audits, and sends nothing", async () => {
    const dry = await result(await post(callBody("company_create", newCompany({ website: "https://zeta.example" }))));
    const prev = dry.structuredContent as unknown as C.PortcoDryRunStructured;
    expect(prev.preview).toMatchObject({ action: "Create company", target: "Zeta Labs (new)" });
    expect(prev.preview.fields.map((f) => f.label)).toEqual(["New company", "Deal ledger", "Website", "Geography", "Founders"]);
    expect(prev.preview.fields[1].after).toBe("Zeta Labs, Kenya: will be linked");
    expect(prev.preview.fields[4].after).toBe("none; nobody is emailed");
    expect(prev.preview.warnings).toEqual([C.PORTCO_SENTENCES.createsNoFounder, C.PORTCO_SENTENCES.laterAccess("Zeta Labs")]);
    expect(prev.company).toMatchObject({ willCreate: true, name: "Zeta Labs", geography: "Kenya", website: "https://zeta.example", ledger: { id: "L1", willLink: true } });

    const res = await result(await applyCall("company_create", newCompany({ website: "https://zeta.example" })));
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as unknown as C.CompanyCreateApplied;
    const created = state.company.find((c) => c.name === "Zeta Labs")!;
    expect(out).toMatchObject({ companyId: created.id, duplicate: false, linkedLedgerId: "L1" });
    expect(created).toMatchObject({ createdVia: "marge", createdById: "u1" });
    expect(state.membership.filter((m) => m.companyId === created.id)).toEqual([]);
    expect(state.portfolioCompany.find((l) => l.id === "L1")!.companyId).toBe(created.id);
    const acts = h.audit.mock.calls.map((c) => c[1]);
    expect(acts).toContain("COMPANY_CREATED");
    expect(acts).toContain("PORTCO_LINKED");
    expect(h.emailCalls).not.toHaveBeenCalled();
  });
  it("a dry run on a name that already exists reports blockedBy and the sentence, and an apply refuses", async () => {
    const dry = await result(await post(callBody("company_create", { name: "Diligence Target", idempotencyKey: "pc_dd_00001" })));
    const s = dry.structuredContent as unknown as C.PortcoDryRunStructured;
    expect(s.company).toMatchObject({ willCreate: false });
    expect(s.company!.blockedBy![0]).toMatchObject({ kind: "company", id: "dd", tier: "STRONG", reasons: ["NAME_EXACT"] });
    expect(s.preview.warnings[0]).toBe("Molly already has a company that matches “Diligence Target”: Diligence Target. Nothing was created.");
    const apply = await result(await applyCall("company_create", { name: "Diligence Target", idempotencyKey: "pc_dd_00001" }));
    expect(apply.isError).toBe(true);
    expect(apply.content[0].text).toBe("Molly already has a company that matches “Diligence Target”: Diligence Target. Nothing was created.");
    expect(state.company.filter((c) => c.name === "Diligence Target")).toHaveLength(1);
  });
  it("a linked ledger row reports reason 'linked' on the dry run and refuses at apply without leaving a company", async () => {
    const dry = await result(await post(callBody("company_create", { name: "Brand New Org", ledgerId: "L3", idempotencyKey: "pc_L3_00001" })));
    expect((dry.structuredContent as any).company.ledger).toMatchObject({ id: "L3", willLink: false, reason: "linked" });
    const apply = await result(await applyCall("company_create", { name: "Brand New Org", ledgerId: "L3", idempotencyKey: "pc_L3_00001" }));
    expect(apply.isError).toBe(true);
    expect(apply.content[0].text).toMatch(/^That deal-ledger entry is already linked to .*Nothing was created\.$/);
    expect(state.company.find((c) => c.name === "Brand New Org")).toBeUndefined();
  });
  it("the same idempotency key returns duplicate: true and writes nothing", async () => {
    const first = await result(await applyCall("company_create", newCompany()));
    expect(first.isError).toBeFalsy();
    const n = state.company.length;
    expect(n).toBe(4);
    const again = await result(await applyCall("company_create", newCompany()));
    expect(again.content[0].text).toContain("already created");
    expect((again.structuredContent as any).duplicate).toBe(true);
    expect(state.company.map((c) => c.name)).toEqual(["Acme Robotics", "Diligence Target", "Pending Signup Co", "Zeta Labs"]);
  });
  it("a bad name gets the contract sentence, not zod's", async () => {
    const r = await result(await post(callBody("company_create", { name: "<b>", idempotencyKey: "pc_x_000001" })));
    expect(r.content[0].text).toBe("A company name must be 1 to 200 characters of plain text.");
  });
  it("the daily fuse stops the creation past the limit", async () => {
    process.env.MARGE_COMPANY_CREATE_PER_DAY = "1";
    expect((await result(await applyCall("company_create", newCompany()))).isError).toBeFalsy();
    const r = await result(await applyCall("company_create", { name: "Another Org Ltd", idempotencyKey: "pc_other_001" }));
    expect(r.content[0].text).toBe(C.PORTCO_SENTENCES.fuse);
  });
});

describe("update_create through the route", () => {
  it("with newCompany while MARGE_COMPANY_CREATE is off: refused with the contract sentence (dry run and apply)", async () => {
    delete process.env.MARGE_COMPANY_CREATE;
    const args = updateArgs({ companyId: undefined, newCompany: newCompany() });
    expect((await result(await post(callBody("update_create", args)))).content[0].text).toBe("Molly isn't accepting new companies from Marge right now.");
    expect((await result(await applyCall("update_create", args))).content[0].text).toBe("Molly isn't accepting new companies from Marge right now.");
    expect(writeCalls()).toEqual([]);
  });
  it("exactly one of companyId / newCompany", async () => {
    const r = await result(await post(callBody("update_create", updateArgs({ newCompany: newCompany() }))));
    expect(r.content[0].text).toBe("Give either a company id or a new company, not both.");
  });
  it("dry run shows the contract preview, same-period rows, metric checks and the founder-visibility warning", async () => {
    state.update.push({ id: "u-a", companyId: "co1", createdById: "f1", period: "2025-Q3", title: "From founder", body: "<p>Hi</p>", status: "SENT", sentAt: new Date("2025-10-01T12:00:00Z"), source: "FOUNDER", createdAt: new Date("2025-10-01") });
    state.metricDefinition.push({ id: "d1", companyId: "co1", name: "Churn", unit: "%" });
    state.metricValue.push({ id: "v1", metricDefinitionId: "d1", value: 2.1, date: new Date("2025-09-30"), updateId: "u-a", via: null, enteredById: null });
    const args = updateArgs({ metrics: [{ definitionId: "d1", value: 2.3, date: "2025-09-30", quote: "churn 2.3" }, { name: "Active merchants", unit: "count", value: 1240, date: "2025-09-30", quote: "1,240" }] });
    const r = await result(await post(callBody("update_create", args)));
    const s = r.structuredContent as unknown as C.PortcoDryRunStructured;
    expect(s.preview.action).toBe("Add update");
    expect(s.preview.target).toBe("Acme Robotics");
    expect(s.preview.fields.map((f) => f.label)).toEqual(["Company", "Period", "Title", "Sent", "Body", "Metrics", "Source", "Attachments"]);
    expect(s.preview.fields[5].after.split("\n")).toEqual(["Churn: kept the figure in Molly, 2.1 (the email says 2.3)", "Active merchants: 1,240 (new metric, count)"]);
    expect(s.preview.warnings[0]).toBe(C.PORTCO_SENTENCES.visibleToFounders);
    expect(s.preview.warnings[1]).toBe("Already an update for 2025-Q3: “From founder” (sent 1 Oct 2025, by Pat Founder): Hi");
    expect(s.metricChecks).toEqual([
      { name: "Churn", action: "kept_founder", existing: { valueId: "v1", value: 2.1, date: "2025-09-30", source: "founder" } },
      { name: "Active merchants", action: "new_metric" },
    ]);
    expect(s.samePeriod).toHaveLength(1);
    expect(s.duplicate).toBe(false);
  });
  it("apply files the update, writes nothing for a kept figure, and returns the contract result", async () => {
    state.metricDefinition.push({ id: "d1", companyId: "co1", name: "Churn", unit: "%" });
    state.metricValue.push({ id: "v1", metricDefinitionId: "d1", value: 2.1, date: new Date("2025-09-30"), updateId: null, via: null, enteredById: null });
    const args = updateArgs({ metrics: [{ definitionId: "d1", value: 2.3, date: "2025-09-30", quote: "q" }, { name: "GMV", value: 5, date: "2025-09-30", quote: "q" }] });
    const r = await result(await applyCall("update_create", args));
    expect(r.structuredContent).toMatchObject({ duplicate: false, metricsWritten: 1, definitionsCreated: 1, companyId: "co1", companyCreated: false, linkedLedgerId: null });
    expect(state.update[0]).toMatchObject({ status: "SENT", source: "EMAIL_VIA_MARGE" });
    expect(state.metricValue.find((v) => v.id === "v1")!.value).toBe(2.1);
    expect(h.emailCalls).not.toHaveBeenCalled();
  });
  it("newCompany: one confirm creates the company, the link and the update; a repeated sourceKey creates no second company", async () => {
    const args = updateArgs({ companyId: undefined, newCompany: newCompany(), metrics: [{ name: "MRR", unit: "USD", value: 5, date: "2025-09-30", quote: "q" }] });
    const dry = await result(await post(callBody("update_create", args)));
    expect((dry.structuredContent as any).preview.action).toBe("Create company and add update");
    expect((dry.structuredContent as any).preview.target).toBe("Zeta Labs (new)");
    expect((dry.structuredContent as any).company).toMatchObject({ willCreate: true, ledger: { id: "L1", willLink: true } });
    expect(writeCalls()).toEqual([]);

    const r = await result(await applyCall("update_create", args));
    expect(r.structuredContent).toMatchObject({ companyCreated: true, linkedLedgerId: "L1", metricsWritten: 1, definitionsCreated: 1, duplicate: false });
    const created = state.company.find((c) => c.name === "Zeta Labs")!;
    expect(state.update[0].companyId).toBe(created.id);
    expect(state.membership.filter((m) => m.companyId === created.id)).toEqual([]);
    expect(h.emailCalls).not.toHaveBeenCalled();

    const again = await result(await applyCall("update_create", updateArgs({ companyId: undefined, newCompany: newCompany({ name: "Other Name", ledgerId: undefined, idempotencyKey: "pc_other_001" }), idempotencyKey: "upd_key_0009" })));
    expect(again.structuredContent).toMatchObject({ duplicate: true, companyCreated: false });
    expect(state.company.map((c) => c.name)).not.toContain("Other Name");
  });
  it("a body of 40,000 characters passes and 40,001 gets the sentence", async () => {
    expect((await result(await post(callBody("update_create", updateArgs({ bodyText: "x".repeat(40_000) }))))).isError).toBeFalsy();
    expect((await result(await post(callBody("update_create", updateArgs({ bodyText: "x".repeat(40_001) }))))).content[0].text).toBe("An update is limited to 40,000 characters.");
  });
  it("refuses an address in the source details", async () => {
    const r = await result(await post(callBody("update_create", updateArgs({ source: { ...source, fromName: "pat@zeta.example" } }))));
    expect(r.content[0].text).toBe(C.PORTCO_SENTENCES.sourceHasAddress);
  });
});

describe("metric_value_set through the route", () => {
  it("records a figure; replaces only a Marge figure; keeps a figure entered in Molly", async () => {
    const set = (over: Row = {}) => ({ companyId: "co1", name: "MRR", unit: "USD", value: 10, date: "2025-09-30", quote: "q", ...over });
    const first = await result(await applyCall("metric_value_set", set()));
    const out = first.structuredContent as unknown as C.MetricValueSetApplied;
    expect(out).toMatchObject({ url: expect.stringContaining("co1") });
    expect(state.metricValue[0]).toMatchObject({ via: "marge", enteredById: "u1" });

    const rep = await result(await applyCall("metric_value_set", set({ name: undefined, definitionId: out.definitionId, value: 12, replaceValueId: out.valueId })));
    expect((rep.structuredContent as any).replaced).toBe(out.valueId);
    expect(state.metricValue[0].value).toBe(12);

    state.metricValue.splice(0);
    state.metricValue.push({ id: "vf", metricDefinitionId: out.definitionId, value: 7, date: new Date("2025-09-10"), updateId: null, via: null, enteredById: null });
    const dry = await result(await post(callBody("metric_value_set", set({ value: 99 }))));
    expect((dry.structuredContent as any).metricChecks[0]).toMatchObject({ action: "kept_founder" });
    expect((dry.structuredContent as any).preview.warnings).toContain(C.PORTCO_SENTENCES.keptFigure);
    const kept = await result(await applyCall("metric_value_set", set({ value: 99 })));
    expect(kept.structuredContent).toMatchObject({ keptFounder: true, valueId: "vf" });
    expect(state.metricValue).toHaveLength(1);

    const refuse = await result(await applyCall("metric_value_set", set({ name: undefined, definitionId: out.definitionId, replaceValueId: "vf" })));
    expect(refuse.content[0].text).toBe(C.PORTCO_SENTENCES.keptFigure);
  });
});

describe("a founder with no membership gets 403 on a Marge-created company and its updates", () => {
  it("requireCompanyAccess refuses a founder who is not a member", async () => {
    const made = await result(await applyCall("company_create", newCompany()));
    expect(made.isError).toBeFalsy();
    const created = state.company.find((c) => c.name === "Zeta Labs")!;
    h.holder.db.userCompanyMembership = { findUnique: async ({ where }: Row) => state.membership.find((m) => m.userId === where.userId_companyId.userId && m.companyId === where.userId_companyId.companyId) ?? null };
    h.auth.mockResolvedValue({ user: { id: "f1", status: "APPROVED", roles: ["FOUNDER"] } });
    const mine = await requireCompanyAccess("co1"); // a member of co1 passes
    expect(mine.error).toBeNull();
    const r = await requireCompanyAccess(created.id); // no membership on the Marge-created company
    expect(r.error?.status).toBe(403);
  });
});
