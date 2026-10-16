// Part 39 (WS120). Marge acts as one person per call. Nothing here reads the database until the
// signature, issuer, audience and expiry have verified (no DB load from unsigned traffic).
import { createLocalJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAdminEmailDomain } from "@/lib/org";

export type MargeMode = "off" | "read" | "write";
/** The kill switch. Anything but "read"/"write", or no keys, is off. */
export function margeMcpMode(): MargeMode {
  const m = process.env.MARGE_MCP_MODE;
  return (m === "read" || m === "write") && process.env.MARGE_ASSERTION_JWKS ? m : "off";
}

const Claims = z.object({
  iss: z.literal("marge"),
  aud: z.literal("molly-mcp"),
  sub: z.string().min(1).max(64),
  email: z.string().email().max(320),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().uuid(),
  scope: z.enum(["read", "write"]),
  ctx: z.enum(["private", "team"]),
  act: z
    .object({ tool: z.string().max(64), h: z.string().regex(/^[0-9a-f]{64}$/), aid: z.string().max(64) })
    .optional(),
});
export type MargeClaims = z.infer<typeof Claims>;

let keys: ReturnType<typeof createLocalJWKSet> | null = null;
let keysSource: string | null = null;

export async function verifyAssertion(
  authorization: string | null
): Promise<{ ok: true; claims: MargeClaims } | { ok: false }> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || token.length > 4000) return { ok: false };
  try {
    const source = process.env.MARGE_ASSERTION_JWKS!;
    if (!keys || keysSource !== source) {
      keys = createLocalJWKSet(JSON.parse(source));
      keysSource = source;
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer: "marge",
      audience: "molly-mcp",
      algorithms: ["EdDSA"],
      clockTolerance: 30,
      maxTokenAge: "90s",
    });
    const c = Claims.safeParse(payload);
    if (!c.success || c.data.exp - c.data.iat > 60) return { ok: false };
    if (c.data.scope === "write" && !c.data.act) return { ok: false };
    return { ok: true, claims: c.data };
  } catch {
    return { ok: false }; // never log the token or the error text (it can echo claims)
  }
}

/** Single use. FAILS CLOSED (JC-MG-C): any error, including a unique violation, means "already used". */
export async function claimJti(c: MargeClaims): Promise<boolean> {
  try {
    await db.rateLimitCounter.create({
      data: { key: `marge-jti:${c.jti}`, windowStart: new Date(c.iat * 1000) },
    });
    return true;
  } catch {
    return false;
  }
}

export type Principal = { id: string; email: string; name: string | null };
export type PrincipalResult =
  | { ok: true; user: Principal }
  | { ok: false; reason: "unknown_user" | "identity_conflict" | "not_admin" | "not_approved" | "domain" };

/** JC-MG-E. Read-only: never links a Google id. Runs on every call, so status/role changes apply at once (F119). */
export async function resolvePrincipal(c: MargeClaims): Promise<PrincipalResult> {
  if (!isAdminEmailDomain(c.email)) return { ok: false, reason: "domain" };
  let u = await db.user.findUnique({ where: { googleId: c.sub } });
  if (!u) {
    const byEmail = await db.user.findFirst({ where: { email: { equals: c.email, mode: "insensitive" } } });
    if (byEmail?.googleId) return { ok: false, reason: "identity_conflict" };
    u = byEmail;
  }
  if (!u) return { ok: false, reason: "unknown_user" };
  if (!u.roles.includes("ADMIN")) return { ok: false, reason: "not_admin" };
  if (u.status !== "APPROVED") return { ok: false, reason: "not_approved" };
  return { ok: true, user: { id: u.id, email: u.email, name: u.name } };
}

export const MARGE_LIMITS = { readPerHour: 300, writePerHour: 30, globalPerHour: 3000 } as const; // JC-MG-H
export { argsHash, canonicalJson } from "@/lib/marge-hash";
