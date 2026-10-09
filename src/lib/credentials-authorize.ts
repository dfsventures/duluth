import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  isSignInRateLimited,
  logSignInFailed,
  logSignInSucceeded,
  normalizeEmail,
  requestInfo,
  type SignInFailReason,
} from "@/lib/signin-audit";

/**
 * Email/password sign-in decision, extracted from auth.ts so it is unit-testable.
 * Admins are Google-only: a password on an ADMIN account is never honoured.
 */
export async function authorizeCredentials(
  credentials: Partial<Record<string, unknown>> | undefined,
  request?: Request
) {
  if (!credentials?.email || !credentials?.password) return null;

  const rawEmail = credentials.email as string;
  const password = credentials.password as string;
  const info = requestInfo(request?.headers);
  const email = normalizeEmail(rawEmail);

  const fail = async (reason: SignInFailReason, userId?: string) => {
    await logSignInFailed(email, userId, "credentials", reason, info);
    return null;
  };

  if (await isSignInRateLimited(email, info.ip)) return fail("rate_limited");

  const user = await db.user.findUnique({ where: { email: rawEmail } });
  if (!user) return fail("unknown_email");
  if (!user.passwordHash) return fail("no_password", user.id);
  if (user.status !== "APPROVED") return fail("not_approved", user.id);

  if (user.roles.includes("ADMIN")) {
    // Fixed string on purpose: no email or user data in logs.
    console.warn("Credentials sign-in refused for an admin account; admins must use Google");
    return fail("admin_password_refused", user.id);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return fail("wrong_password", user.id);

  await logSignInSucceeded(user, "credentials", info);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    roles: user.roles,
    status: user.status,
  };
}
