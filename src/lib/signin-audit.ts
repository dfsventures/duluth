import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/audit";

export type SignInMethod = "google" | "credentials";
export type SignInFailReason =
  | "unknown_email"
  | "no_password"
  | "not_approved"
  | "wrong_password"
  | "admin_password_refused"
  | "google_domain_refused"
  | "rate_limited";

export const MAX_FAILS_PER_EMAIL = 10;
export const MAX_FAILS_PER_IP = 30;
export const FAIL_WINDOW_MS = 15 * 60 * 1000;

export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "unknown";
}

type HeaderSource = { get(name: string): string | null } | null | undefined;

/** IP + truncated user agent only. Never the whole request. */
export function requestInfo(headers: HeaderSource): { ip?: string; userAgent?: string } {
  try {
    if (!headers) return {};
    const fwd = headers.get("x-forwarded-for");
    const ip = fwd ? fwd.split(",")[0].trim() : headers.get("x-real-ip") ?? undefined;
    const ua = headers.get("user-agent");
    return {
      ...(ip ? { ip } : {}),
      ...(ua ? { userAgent: ua.slice(0, 200) } : {}),
    };
  } catch {
    return {};
  }
}

/** Headers of the current request via next/headers; {} when unavailable. */
export async function currentRequestInfo(): Promise<{ ip?: string; userAgent?: string }> {
  try {
    const { headers } = await import("next/headers");
    return requestInfo(await headers());
  } catch {
    return {};
  }
}

export async function logSignInSucceeded(
  user: { id?: string; email?: string | null },
  method: SignInMethod,
  info: { ip?: string; userAgent?: string }
) {
  try {
    await logAdminAction(
      { id: user.id, email: normalizeEmail(user.email) },
      "SIGN_IN_SUCCEEDED",
      { metadata: { method, ...info } }
    );
  } catch {
    /* never break sign-in */
  }
}

export async function logSignInFailed(
  email: unknown,
  userId: string | undefined,
  method: SignInMethod,
  reason: SignInFailReason,
  info: { ip?: string; userAgent?: string }
) {
  try {
    await logAdminAction(
      { id: userId, email: normalizeEmail(email) },
      "SIGN_IN_FAILED",
      { metadata: { method, reason, ...info } }
    );
  } catch {
    /* never break sign-in */
  }
}

/**
 * True when recent failed credentials attempts exceed the caps (sliding
 * 15-minute window, counted from the audit log; "rate_limited" rows are not
 * counted so the block expires on its own). Fails open on DB errors.
 */
export async function isSignInRateLimited(email: string, ip?: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - FAIL_WINDOW_MS);
    const notRateLimited = { NOT: { metadata: { path: ["reason"], equals: "rate_limited" } } };
    const base = { action: "SIGN_IN_FAILED", createdAt: { gte: since } };
    const byEmail = await db.auditLog.count({
      where: { ...base, actorEmail: email, ...notRateLimited },
    });
    if (byEmail >= MAX_FAILS_PER_EMAIL) return true;
    if (ip) {
      const byIp = await db.auditLog.count({
        where: { ...base, AND: [{ metadata: { path: ["ip"], equals: ip } }, notRateLimited] },
      });
      if (byIp >= MAX_FAILS_PER_IP) return true;
    }
    return false;
  } catch (err) {
    console.error("sign-in rate-limit check failed (allowing):", err);
    return false;
  }
}
