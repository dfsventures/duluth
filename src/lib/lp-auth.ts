import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "@/lib/db";

// LP portal auth (Part 7, WS18, JC4): a separate opaque-token cookie, NOT a
// NextAuth audience. NextAuth's JWT carries roles/status that route-access.ts
// and auth-guard.ts interpret for founder/admin gating; grafting a fourth
// audience onto it risks the exact security surface WS2 exists to protect,
// and NextAuth's middleware runs on the edge where Prisma can't go anyway.
// This is Postgres-backed, zero new deps — same philosophy as the
// ShareableLink token and the Postgres rate limiter.

export const LP_COOKIE = "lp_session";
export const LP_SESSION_DAYS = 30;
// Q21/JC14 (2026-07-15): the 30-day cookie/expiresAt hard cap stays, but a
// session idle for more than this many days is treated as logged-out even
// before expiresAt — cuts the shared-device exposure window. Reversal: this
// one constant.
export const LP_IDLE_DAYS = 7;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

/** WS1.3's email shape, reused verbatim for the LP surface. */
export const LP_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function newSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function newOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Pure: is this session row still valid right now? (hard expiry + Q21 idle timeout) */
export function isSessionValid(
  session: { expiresAt: Date; lastUsedAt?: Date } | null | undefined,
  now: Date = new Date()
): boolean {
  if (!session || session.expiresAt.getTime() <= now.getTime()) return false;
  if (session.lastUsedAt && now.getTime() - session.lastUsedAt.getTime() > LP_IDLE_DAYS * 24 * 60 * 60 * 1000) {
    return false; // idle-expired (Q21/JC14); callers already treat invalid as logged-out
  }
  return true;
}

/**
 * Pure: can this OTP row still be attempted/consumed right now?
 * Fail-closed cap on the row itself — independent of the rate limiter
 * (rate-limit.ts fails OPEN on DB errors, which is fine for its buckets but
 * not acceptable as the only guard on brute-forcing a 6-digit code).
 */
export function isOtpUsable(
  otp: { expiresAt: Date; consumedAt: Date | null; attempts: number } | null | undefined,
  now: Date = new Date()
): boolean {
  if (!otp) return false;
  if (otp.consumedAt) return false;
  if (otp.expiresAt.getTime() <= now.getTime()) return false;
  if (otp.attempts > OTP_MAX_ATTEMPTS) return false;
  return true;
}

export interface LpContext {
  session: { id: string; expiresAt: Date; lastUsedAt: Date };
  lp: { id: string; email: string; name: string | null };
  fundIds: string[];
}

/** Server-component/route helper: the logged-in LP (with fund memberships) or null. */
export async function getLp(): Promise<LpContext | null> {
  const token = cookies().get(LP_COOKIE)?.value;
  if (!token) return null;

  const session = await db.lpSession.findUnique({
    where: { token },
    include: { lp: { include: { funds: { select: { fundId: true } } } } },
  });

  if (!session || !isSessionValid(session)) return null;

  // Touch lastUsedAt at most hourly, best-effort — never blocks the page.
  if (Date.now() - session.lastUsedAt.getTime() > 60 * 60 * 1000) {
    db.lpSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }

  return {
    session: { id: session.id, expiresAt: session.expiresAt, lastUsedAt: session.lastUsedAt },
    lp: { id: session.lp.id, email: session.lp.email, name: session.lp.name },
    fundIds: session.lp.funds.map((f) => f.fundId),
  };
}
