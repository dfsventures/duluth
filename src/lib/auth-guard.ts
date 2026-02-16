import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";

/**
 * Get the current session user, or return a 401 response.
 * Optionally require a specific role.
 */
export async function requireAuth(requiredRole?: UserRole) {
  const session = await auth();

  if (!session?.user) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (session.user.status !== "APPROVED") {
    return { user: null, error: NextResponse.json({ error: "Account not approved" }, { status: 403 }) };
  }

  if (requiredRole && session.user.role !== requiredRole) {
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user: session.user, error: null };
}

/**
 * Check if the current user is an admin.
 */
export async function requireAdmin() {
  return requireAuth("ADMIN");
}

/**
 * Check if the current user has access to a specific company.
 */
export async function requireCompanyAccess(companyId: string) {
  const { user, error } = await requireAuth();
  if (error) return { user: null, error };

  // Admins can access any company
  if (user!.role === "ADMIN") return { user: user!, error: null };

  // Founders must be a member of the company
  const { db } = await import("@/lib/db");
  const membership = await db.userCompanyMembership.findUnique({
    where: {
      userId_companyId: { userId: user!.id, companyId },
    },
  });

  if (!membership) {
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user: user!, error: null };
}
