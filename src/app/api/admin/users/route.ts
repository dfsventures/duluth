export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const users = await db.user.findMany({
      where: { roles: { has: "ADMIN" } },
      select: { id: true, name: true, email: true, receivesDigest: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(users);
  } catch (err) {
    console.error("GET /api/admin/users error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
