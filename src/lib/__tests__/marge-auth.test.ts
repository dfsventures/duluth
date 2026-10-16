import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import * as jose from "jose";

// Part 39 (WS120): assertion verification, replay protection, identity mapping, kill switch, hash.

const m = vi.hoisted(() => ({
  rateLimitCounter: { create: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: m }));
vi.mock("@/lib/org", () => ({
  isAdminEmailDomain: (e: string) => e.toLowerCase().endsWith("@example.com"),
}));

import {
  verifyAssertion,
  claimJti,
  resolvePrincipal,
  margeMcpMode,
  argsHash,
  type MargeClaims,
} from "@/lib/marge-auth";

let priv: jose.CryptoKey;
let other: jose.CryptoKey;
let pubJwk: jose.JWK;
const KID = "marge-test";
const HASH = "a".repeat(64);

async function sign(
  over: Record<string, unknown> = {},
  opts: { key?: jose.CryptoKey; kid?: string; alg?: string } = {}
) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: "g-123",
    email: "admin@example.com",
    scope: "read",
    ctx: "private",
    jti: crypto.randomUUID(),
    iss: "marge",
    aud: "molly-mcp",
    iat: now,
    exp: now + 60,
    ...over,
  };
  const payload = Object.fromEntries(Object.entries(claims).filter(([, v]) => v !== undefined));
  return new jose.SignJWT(payload as jose.JWTPayload)
    .setProtectedHeader({ alg: opts.alg ?? "EdDSA", kid: opts.kid ?? KID, typ: "JWT" })
    .sign(opts.key ?? priv);
}
const bearer = (t: string) => `Bearer ${t}`;

beforeAll(async () => {
  const a = await jose.generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const b = await jose.generateKeyPair("EdDSA", { crv: "Ed25519" });
  priv = a.privateKey;
  other = b.privateKey;
  pubJwk = { ...(await jose.exportJWK(a.publicKey)), kid: KID, alg: "EdDSA", use: "sig" };
});

const saved = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env.MARGE_ASSERTION_JWKS = JSON.stringify({ keys: [pubJwk] });
});
afterEach(() => {
  process.env.MARGE_ASSERTION_JWKS = saved.MARGE_ASSERTION_JWKS;
  process.env.MARGE_MCP_MODE = saved.MARGE_MCP_MODE;
});

describe("verifyAssertion", () => {
  it("accepts a valid read token", async () => {
    const r = await verifyAssertion(bearer(await sign()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.claims).toMatchObject({ sub: "g-123", scope: "read", ctx: "private" });
  });

  it("accepts a valid write token with act", async () => {
    const act = { tool: "board_card_create", h: HASH, aid: "act1" };
    const r = await verifyAssertion(bearer(await sign({ scope: "write", act })));
    expect(r.ok && r.claims.act).toEqual(act);
  });

  const now = () => Math.floor(Date.now() / 1000);
  it.each([
    ["no header", async () => null],
    ["not a bearer", async () => "Basic abc"],
    ["expired", async () => bearer(await sign({ iat: now() - 200, exp: now() - 100 }))],
    ["exp - iat = 61", async () => bearer(await sign({ exp: now() + 61 }))],
    ["wrong iss", async () => bearer(await sign({ iss: "evil" }))],
    ["wrong aud", async () => bearer(await sign({ aud: "other" }))],
    ["unknown kid", async () => bearer(await sign({}, { kid: "nope" }))],
    ["signed by another key", async () => bearer(await sign({}, { key: other }))],
    ["write scope without act", async () => bearer(await sign({ scope: "write" }))],
    ["ctx outside the enum", async () => bearer(await sign({ ctx: "public" }))],
    ["malformed jti", async () => bearer(await sign({ jti: "not-a-uuid" }))],
    ["oversized token", async () => `Bearer ${"a".repeat(4001)}`],
    ["too old (iat 120 s ago)", async () => bearer(await sign({ iat: now() - 120, exp: now() - 70 + 100 }))],
  ])("refuses: %s", async (_n, make) => {
    expect((await verifyAssertion(await make())).ok).toBe(false);
  });

  it("refuses alg none", async () => {
    const h = Buffer.from(JSON.stringify({ alg: "none", kid: KID })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const p = Buffer.from(
      JSON.stringify({ iss: "marge", aud: "molly-mcp", sub: "g", email: "a@example.com", iat: now, exp: now + 60, jti: crypto.randomUUID(), scope: "read", ctx: "private" })
    ).toString("base64url");
    expect((await verifyAssertion(bearer(`${h}.${p}.`))).ok).toBe(false);
  });

  it("refuses HS256 signed with the public key as the secret", async () => {
    const secret = new TextEncoder().encode(JSON.stringify(pubJwk));
    const now = Math.floor(Date.now() / 1000);
    const t = await new jose.SignJWT({ sub: "g", email: "a@example.com", jti: crypto.randomUUID(), scope: "read", ctx: "private" })
      .setProtectedHeader({ alg: "HS256", kid: KID })
      .setIssuer("marge").setAudience("molly-mcp").setIssuedAt(now).setExpirationTime(now + 60)
      .sign(secret);
    expect((await verifyAssertion(bearer(t))).ok).toBe(false);
  });

  it("refuses when no JWKS is configured, and never touches the database", async () => {
    delete process.env.MARGE_ASSERTION_JWKS;
    expect((await verifyAssertion(bearer(await sign()))).ok).toBe(false);
    expect(m.rateLimitCounter.create).not.toHaveBeenCalled();
    expect(m.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("claimJti", () => {
  const claims = { jti: "11111111-1111-4111-8111-111111111111", iat: 1_800_000_000 } as MargeClaims;

  it("first call true; the unique-violation replay false", async () => {
    m.rateLimitCounter.create.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("P2002"));
    expect(await claimJti(claims)).toBe(true);
    expect(await claimJti(claims)).toBe(false);
    expect(m.rateLimitCounter.create).toHaveBeenCalledWith({
      data: { key: `marge-jti:${claims.jti}`, windowStart: new Date(1_800_000_000 * 1000) },
    });
  });

  it("fails closed on a database error", async () => {
    m.rateLimitCounter.create.mockRejectedValue(new Error("connection lost"));
    expect(await claimJti(claims)).toBe(false);
  });
});

describe("resolvePrincipal", () => {
  const claims = { sub: "g-123", email: "Admin@Example.com" } as MargeClaims;
  const user = (over: Record<string, unknown> = {}) => ({
    id: "u1", email: "admin@example.com", name: "Sam Partner", googleId: "g-123",
    roles: ["ADMIN"], status: "APPROVED", ...over,
  });

  it("matches by Google id", async () => {
    m.user.findUnique.mockResolvedValue(user());
    expect(await resolvePrincipal(claims)).toEqual({ ok: true, user: { id: "u1", email: "admin@example.com", name: "Sam Partner" } });
    expect(m.user.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to email when that user has no googleId", async () => {
    m.user.findUnique.mockResolvedValue(null);
    m.user.findFirst.mockResolvedValue(user({ googleId: null }));
    expect((await resolvePrincipal(claims)).ok).toBe(true);
    expect(m.user.findFirst).toHaveBeenCalledWith({ where: { email: { equals: "Admin@Example.com", mode: "insensitive" } } });
  });

  it("email match linked to a different Google account is identity_conflict", async () => {
    m.user.findUnique.mockResolvedValue(null);
    m.user.findFirst.mockResolvedValue(user({ googleId: "g-other" }));
    expect(await resolvePrincipal(claims)).toEqual({ ok: false, reason: "identity_conflict" });
  });

  it("unknown user", async () => {
    m.user.findUnique.mockResolvedValue(null);
    m.user.findFirst.mockResolvedValue(null);
    expect(await resolvePrincipal(claims)).toEqual({ ok: false, reason: "unknown_user" });
  });

  it("founder only is not_admin", async () => {
    m.user.findUnique.mockResolvedValue(user({ roles: ["FOUNDER"] }));
    expect(await resolvePrincipal(claims)).toEqual({ ok: false, reason: "not_admin" });
  });

  it.each(["PENDING", "REJECTED"])("%s is not_approved", async (status) => {
    m.user.findUnique.mockResolvedValue(user({ status }));
    expect(await resolvePrincipal(claims)).toEqual({ ok: false, reason: "not_approved" });
  });

  it("a non-admin domain is refused before any lookup", async () => {
    expect(await resolvePrincipal({ ...claims, email: "x@gmail.com" })).toEqual({ ok: false, reason: "domain" });
    expect(m.user.findUnique).not.toHaveBeenCalled();
  });

  it("no caching: REJECTED between two calls is refused on the second", async () => {
    m.user.findUnique.mockResolvedValueOnce(user()).mockResolvedValueOnce(user({ status: "REJECTED" }));
    expect((await resolvePrincipal(claims)).ok).toBe(true);
    expect(await resolvePrincipal(claims)).toEqual({ ok: false, reason: "not_approved" });
  });
});

describe("argsHash", () => {
  // Shared test vector: the same literal is pasted into Marge's test suite (MWS-21).
  const VECTOR = "012e48d7aaede96a103cf2ad1ae256355c672e9a4acdaebeb701482d206cefab";

  it("matches the shared vector", () => {
    expect(argsHash({ title: "Send deck", owners: ["me", "Sam Partner"], dryRun: false, dueDate: "2026-10-23" })).toBe(VECTOR);
  });
  it("ignores dryRun, key order and undefined keys", () => {
    expect(argsHash({ dueDate: "2026-10-23", owners: ["me", "Sam Partner"], title: "Send deck", notes: undefined })).toBe(VECTOR);
    expect(argsHash({ title: "Send deck", owners: ["me", "Sam Partner"], dueDate: "2026-10-23", dryRun: true })).toBe(VECTOR);
  });
  it("array order matters", () => {
    expect(argsHash({ title: "Send deck", owners: ["Sam Partner", "me"], dueDate: "2026-10-23" })).not.toBe(VECTOR);
  });
});

describe("margeMcpMode", () => {
  it("is off when unset, when not read/write, and when read/write has no keys", () => {
    delete process.env.MARGE_MCP_MODE;
    expect(margeMcpMode()).toBe("off");
    process.env.MARGE_MCP_MODE = "true";
    expect(margeMcpMode()).toBe("off");
    process.env.MARGE_MCP_MODE = "read";
    delete process.env.MARGE_ASSERTION_JWKS;
    expect(margeMcpMode()).toBe("off");
  });
  it("is read / write with keys", () => {
    process.env.MARGE_MCP_MODE = "read";
    expect(margeMcpMode()).toBe("read");
    process.env.MARGE_MCP_MODE = "write";
    expect(margeMcpMode()).toBe("write");
  });
});
