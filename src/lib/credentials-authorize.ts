import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

/**
 * Email/password sign-in decision, extracted from auth.ts so it is unit-testable.
 * Admins are Google-only: a password on an ADMIN account is never honoured.
 */
export async function authorizeCredentials(credentials: Partial<Record<string, unknown>> | undefined) {
  if (!credentials?.email || !credentials?.password) return null;

  const email = credentials.email as string;
  const password = credentials.password as string;

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return null;
  if (user.status !== "APPROVED") return null;

  if (user.roles.includes("ADMIN")) {
    // Fixed string on purpose: no email or user data in logs.
    console.warn("Credentials sign-in refused for an admin account; admins must use Google");
    return null;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    roles: user.roles,
    status: user.status,
  };
}
