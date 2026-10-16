import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import * as jose from "jose";

// Part 39 (WS123): the endpoint end to end with raw JSON-RPC bodies (no handshake needed).

const m = vi.hoisted(() => {
  const w = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"];
  const mk = (reads: string[]) => Object.fromEntries([...reads, ...w].map((k) => [k, vi.fn()]));
  return {
    rateLimitCounter: mk([]),
    user: mk(["findUnique", "findFirst", "findMany"]),
    boardCard: mk(["findMany", "findUnique"]),
    boardPerson: mk(["findMany", "findUnique"]),
    boardProject: mk(["findMany"]),
    boardAlias: mk(["findMany"]),
    $transaction: vi.fn(),
  };
});
vi.mock("@/lib/db", () => ({ db: m }));
vi.mock("@/lib/org", () => ({ isAdminEmailDomain: (e: string) => e.endsWith("@example.com") }));
const audit = vi.hoisted(() => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/audit", () => audit);
const limiter = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => limiter);
const actions = vi.hoisted(() => ({
  createBoardCard: vi.fn(), updateBoardCard: vi.fn(), moveBoardCard: vi.fn(), addBoardCardLink: vi.fn(),
}));
vi.mock("@/lib/board-actions", () => actions);
vi.mock("@/lib/broadcast-drafts", () => ({ createBroadcastDraft: vi.fn(), updateBroadcastDraft: vi.fn() }));
const readFns = vi.hoisted(() => ({
  companiesFind: vi.fn(), companyOverview: vi.fn(), updatesRecent: vi.fn(), boardCards: vi.fn(),
  broadcastsList: vi.fn(), broadcastGet: vi.fn(), portfolioSummary: vi.fn(), companyDeals: vi.fn(),
}));
vi.mock("@/lib/marge-tools/read", async (orig) => ({ ...(await orig<typeof import("@/lib/marge-tools/read")>()), ...readFns }));

import { POST, GET } from "@/app/api/mcp/marge/route";
import { MARGE_TOOLS } from "@/lib/marge-tools/tiers";
import { argsHash } from "@/lib/marge-hash";

let priv: jose.CryptoKey;
const KID = "marge-test";
const URL_ = "https://molly.dfs.vc/api/mcp/marge";
const CANARY = "CANARY-7f3a9";
const USER = { id: "u1", email: "admin@example.com", name: "Sam Partner", googleId: "g-1", roles: ["ADMIN"], status: "APPROVED" };

async function token(over: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({
    sub: "g-1", email: "admin@example.com", scope: "read", ctx: "private", jti: crypto.randomUUID(),
    iss: "marge", aud: "molly-mcp", iat: now, exp: now + 60, ...over,
  } as jose.JWTPayload)
    .setProtectedHeader({ alg: "EdDSA", kid: KID, typ: "JWT" })
    .sign(priv);
}
const rpc = (method: string, params?: unknown, id: number | null = 1) => ({ jsonrpc: "2.0", id, method, params });
const call = (name: string, args: Record<string, unknown> = {}) => rpc("tools/call", { name, arguments: args });

async function post(body: unknown, tok?: string | null, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...extraHeaders,
  };
  if (tok !== null) headers.authorization = `Bearer ${tok ?? (await token())}`;
  return POST(new Request(URL_, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
}

const dbCalls = () => Object.values(m).flatMap((mod) => (typeof mod === "function" ? [mod] : Object.values(mod))).reduce((n, f) => n + (f as ReturnType<typeof vi.fn>).mock.calls.length, 0);
const auditActions = () => audit.logAdminAction.mock.calls.map((c) => c[1] as string);
// The 2025-era (legacy, stateless) leg answers one SSE-framed message; the 2026 era (what the AI SDK
// client speaks) answers plain JSON in responseMode "json". Read either.
async function body(res: Response) {
  const raw = await res.text();
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const line = raw.split("\n").find((l) => l.startsWith("data: "));
    return JSON.parse(line!.slice(6));
  }
  return JSON.parse(raw);
}
async function text(res: Response) {
  const j = await body(res);
  return j.result?.content?.[0]?.text as string | undefined;
}

const saved = { ...process.env };
beforeAll(async () => {
  const k = await jose.generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  priv = k.privateKey;
  process.env.__JWKS = JSON.stringify({ keys: [{ ...(await jose.exportJWK(k.publicKey)), kid: KID, alg: "EdDSA", use: "sig" }] });
});
beforeEach(() => {
  vi.resetAllMocks();
  process.env.MARGE_ASSERTION_JWKS = process.env.__JWKS;
  process.env.MARGE_MCP_MODE = "read";
  m.rateLimitCounter.create.mockResolvedValue({});
  m.user.findUnique.mockResolvedValue(USER);
  limiter.checkRateLimit.mockResolvedValue(true);
  readFns.companiesFind.mockResolvedValue({ text: "[c1] Acme", structured: { companies: [] }, count: 1 });
  readFns.portfolioSummary.mockResolvedValue({ text: "All funds", structured: {}, count: 2 });
  m.boardPerson.findMany.mockResolvedValue([{ id: "bp1", displayName: "Sam Partner", user: { name: "Sam Partner", email: "admin@example.com" } }]);
  m.boardProject.findMany.mockResolvedValue([]);
  m.boardAlias.findMany.mockResolvedValue([]);
  m.boardCard.findMany.mockResolvedValue([]);
  m.boardPerson.findUnique.mockResolvedValue({ id: "bp1", displayName: "Sam Partner", user: { name: "Sam Partner" } });
  m.user.findMany.mockResolvedValue([]);
  actions.createBoardCard.mockResolvedValue({ ok: true, value: { id: "k9", title: "Send deck" } });
});
afterEach(() => {
  process.env.MARGE_ASSERTION_JWKS = saved.MARGE_ASSERTION_JWKS;
  process.env.MARGE_MCP_MODE = saved.MARGE_MCP_MODE;
});

describe("kill switch", () => {
  it("mode unset: 404, before the body is read, no DB, no audit", async () => {
    delete process.env.MARGE_MCP_MODE;
    const req = new Request(URL_, { method: "POST", body: "{}" });
    const spy = vi.spyOn(req, "text");
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(spy).not.toHaveBeenCalled();
    expect(dbCalls()).toBe(0);
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });
  it("mode set but no JWKS: still off", async () => {
    delete process.env.MARGE_ASSERTION_JWKS;
    expect((await post(call("companies_find"))).status).toBe(404);
  });
  it("GET is 405", async () => {
    expect((await GET()).status).toBe(405);
  });
});

describe("authentication", () => {
  it("no token and a bad token: 401 and no DB access at all", async () => {
    expect((await post(call("companies_find"), null)).status).toBe(401);
    expect((await post(call("companies_find"), "garbage.token.here")).status).toBe(401);
    expect((await post(call("companies_find"), await token({ aud: "other" }))).status).toBe(401);
    expect(dbCalls()).toBe(0);
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });
  it("oversized body: 413 before verification", async () => {
    const res = await post("x".repeat(64_001));
    expect(res.status).toBe(413);
    expect(dbCalls()).toBe(0);
  });
  it("malformed JSON and batches are refused after the signature check", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post([call("companies_find"), call("companies_find")])).status).toBe(400);
  });
  it("a replayed jti is 401; a DB error in claimJti is 401 (fails closed)", async () => {
    m.rateLimitCounter.create.mockRejectedValueOnce(new Error("P2002"));
    expect((await post(call("companies_find"))).status).toBe(401);
    m.rateLimitCounter.create.mockRejectedValueOnce(new Error("down"));
    expect((await post(call("companies_find"))).status).toBe(401);
    expect(readFns.companiesFind).not.toHaveBeenCalled();
  });
});

describe("discover and list touch no database", () => {
  it("tools/list with a valid token lists exactly MARGE_TOOLS", async () => {
    const res = await post(rpc("tools/list", {}));
    expect(res.status).toBe(200);
    const j = await body(res);
    expect((j.result.tools as { name: string }[]).map((t) => t.name).sort()).toEqual(Object.keys(MARGE_TOOLS).sort());
    expect(dbCalls()).toBe(0);
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });
  it("server/discover with a valid token", async () => {
    const res = await post(rpc("server/discover", {}));
    expect(res.status).toBe(200);
    expect(dbCalls()).toBe(0);
  });
});

describe("2026-era envelope (what the AI SDK client sends)", () => {
  const meta = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientCapabilities": {},
    "io.modelcontextprotocol/clientInfo": { name: "marge", version: "1" },
  };
  const modern = (method: string, params: Record<string, unknown> = {}) =>
    post(rpc(method, { ...params, _meta: meta }), undefined, {
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": method,
      ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
    });
  it("answers plain JSON, with the verified person reaching the tool", async () => {
    const res = await modern("tools/call", { name: "companies_find", arguments: {} });
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await text(res)).toBe("[c1] Acme");
    expect(auditActions()).toEqual(["MARGE_READ"]);
  });
  it("server/discover and tools/list work without touching the database", async () => {
    const d = await modern("server/discover");
    expect(d.status).toBe(200);
    const l = await modern("tools/list");
    expect(((await body(l)).result.tools as unknown[]).length).toBe(13);
    expect(dbCalls()).toBe(0);
  });
});

describe("tools/call", () => {
  it("a read: runs as the resolved person, audits exactly one MARGE_READ with ids and counts only", async () => {
    const res = await post(call("companies_find", { query: CANARY }));
    expect(await text(res)).toBe("[c1] Acme");
    expect(readFns.companiesFind).toHaveBeenCalledWith({ query: CANARY, limit: 10 }, expect.objectContaining({ id: "u1" }));
    expect(auditActions()).toEqual(["MARGE_READ"]);
    const [actor, , opts] = audit.logAdminAction.mock.calls[0];
    expect(actor).toMatchObject({ id: "u1", email: "admin@example.com" });
    expect(opts.metadata).toEqual({ via: "marge", ctx: "private", count: 1, dryRun: false });
    expect(JSON.stringify(audit.logAdminAction.mock.calls)).not.toContain(CANARY);
  });

  it("a dm tool with ctx team is refused with the sentence and a MARGE_DENIED row", async () => {
    const res = await post(call("portfolio_summary"), await token({ ctx: "team" }));
    expect(await text(res)).toBe("That's DM-only. Ask me in a DM.");
    expect(readFns.portfolioSummary).not.toHaveBeenCalled();
    expect(auditActions()).toEqual(["MARGE_DENIED"]);
    expect(audit.logAdminAction.mock.calls[0][2].metadata).toEqual({ via: "marge", tool: "portfolio_summary", reason: "tier", ctx: "team" });
    // and in a DM it works
    audit.logAdminAction.mockClear();
    expect(await text(await post(call("portfolio_summary")))).toBe("All funds");
  });

  it("a signed but unauthorised person gets the sentence in JSON-RPC form and a MARGE_DENIED row", async () => {
    m.user.findUnique.mockResolvedValue({ ...USER, roles: ["FOUNDER"] });
    const res = await post(call("companies_find"));
    expect(await text(res)).toBe("You don't have admin access in Molly.");
    m.user.findUnique.mockResolvedValue(null);
    m.user.findFirst.mockResolvedValue(null);
    expect(await text(await post(call("companies_find")))).toMatch(/Sign in to molly\.dfs\.vc with Google once\./);
    expect(readFns.companiesFind).not.toHaveBeenCalled();
    expect(auditActions()).toEqual(["MARGE_DENIED", "MARGE_DENIED"]);
  });

  it("a tool error is a sentence, audited as one MARGE_READ with count 0", async () => {
    const { ToolError } = await import("@/lib/marge-tools/types");
    readFns.companiesFind.mockRejectedValue(new ToolError("No company called “Acm”."));
    const res = await post(call("companies_find", { query: "Acm" }));
    const j = await body(res);
    expect(j.result.isError).toBe(true);
    expect(j.result.content[0].text).toBe("No company called “Acm”.");
    expect(auditActions()).toEqual(["MARGE_READ"]);
  });

  it("an unexpected error is generic, logged by tool name only", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    readFns.companiesFind.mockRejectedValue(new Error(`boom ${CANARY}`));
    expect(await text(await post(call("companies_find")))).toBe("Molly had a problem; nothing was changed.");
    expect(JSON.stringify(spy.mock.calls)).not.toContain(CANARY);
    expect(spy.mock.calls[0][0]).toBe("marge tool companies_find failed");
    spy.mockRestore();
  });

  it("rate limits: the 301st read in an hour is refused; the global bucket too", async () => {
    let n = 0;
    limiter.checkRateLimit.mockImplementation(async (bucket: string, id: string, limit: number) => {
      if (bucket === "marge-read") return ++n <= limit;
      return true;
    });
    for (let i = 0; i < 300; i++) expect(await text(await post(call("companies_find")))).toBe("[c1] Acme");
    expect(await text(await post(call("companies_find")))).toMatch(/more requests than allowed/);
    expect(limiter.checkRateLimit).toHaveBeenCalledWith("marge-read", "u1", 300);
    expect(limiter.checkRateLimit).toHaveBeenCalledWith("marge", "global", 3000);
    limiter.checkRateLimit.mockImplementation(async (bucket: string) => bucket !== "marge");
    expect(await text(await post(call("companies_find")))).toMatch(/more requests than allowed/);
  });
});

describe("write contract", () => {
  const args = { title: "Send deck", owners: ["me"], dueDate: "2026-10-23" };
  const ACT = { tool: "board_card_create", h: argsHash(args), aid: "act-1" };
  const apply = (a: Record<string, unknown> = args) => call("board_card_create", { ...a, dryRun: false });

  it("a dry run uses a read token, returns a preview, and writes nothing", async () => {
    process.env.MARGE_MCP_MODE = "write";
    const res = await post(call("board_card_create", { ...args, [CANARY]: 1 }));
    const j = await body(res);
    expect(j.result.structuredContent.preview.action).toBe("Create card");
    expect(actions.createBoardCard).not.toHaveBeenCalled();
    expect(auditActions()).toEqual(["MARGE_READ"]);
    expect(audit.logAdminAction.mock.calls[0][2].metadata).toMatchObject({ dryRun: true });
  });

  it("mode read: an apply is refused even with a valid write token", async () => {
    const res = await post(apply(), await token({ scope: "write", act: ACT }));
    expect(await text(res)).toBe("Molly is in read-only mode for Marge.");
    expect(actions.createBoardCard).not.toHaveBeenCalled();
    expect(auditActions()).toEqual(["MARGE_DENIED"]);
    expect(audit.logAdminAction.mock.calls[0][2].metadata.reason).toBe("read_only");
  });

  it("refused: read scope, wrong act.tool, wrong hash; no write happens", async () => {
    process.env.MARGE_MCP_MODE = "write";
    const readOnly = await token({});
    const wrongTool = await token({ scope: "write", act: { ...ACT, tool: "board_card_move" } });
    const wrongHash = await token({ scope: "write", act: { ...ACT, h: argsHash({ ...args, title: "Other" }) } });
    for (const t of [readOnly, wrongTool, wrongHash]) {
      expect(await text(await post(apply(), t))).toBe("That change wasn't confirmed, so nothing was changed.");
    }
    expect(actions.createBoardCard).not.toHaveBeenCalled();
    expect(auditActions()).toEqual(["MARGE_DENIED", "MARGE_DENIED", "MARGE_DENIED"]);
  });

  it("a correct write token applies through the WS119 function with via; the write audits itself", async () => {
    process.env.MARGE_MCP_MODE = "write";
    const res = await post(apply(), await token({ scope: "write", act: ACT }));
    expect(await text(res)).toBe("Created card “Send deck”.");
    expect(actions.createBoardCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" }),
      { title: "Send deck", ownerIds: ["bp1"], dueDate: "2026-10-23" },
      { via: "marge", margeActionId: "act-1" }
    );
    expect(limiter.checkRateLimit).toHaveBeenCalledWith("marge-write", "u1", 30);
    expect(audit.logAdminAction).not.toHaveBeenCalled(); // the real WS119 function logs BOARD_CARD_CREATED; it is mocked here
  });

  it("a failed apply leaves one MARGE_DENIED row", async () => {
    process.env.MARGE_MCP_MODE = "write";
    actions.createBoardCard.mockResolvedValue({ ok: false, status: 400, error: "Invalid notes" });
    expect(await text(await post(apply(), await token({ scope: "write", act: ACT })))).toBe("Invalid notes");
    expect(auditActions()).toEqual(["MARGE_DENIED"]);
    expect(audit.logAdminAction.mock.calls[0][2].metadata.reason).toBe("apply_refused");
  });

  it("the same jti cannot apply twice", async () => {
    process.env.MARGE_MCP_MODE = "write";
    const t = await token({ scope: "write", act: ACT });
    expect((await post(apply(), t)).status).toBe(200);
    m.rateLimitCounter.create.mockRejectedValueOnce(new Error("P2002"));
    expect((await post(apply(), t)).status).toBe(401);
    expect(actions.createBoardCard).toHaveBeenCalledTimes(1);
  });
});
