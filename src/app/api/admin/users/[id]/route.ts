export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const { receivesDigest } = body as { receivesDigest: boolean };

    const user = await db.user.update({
      where: { id },
      data: { receivesDigest },
      select: { id: true, name: true, email: true, receivesDigest: true },
    });

    return NextResponse.json(user);
  } catch (err) {
    console.error("PATCH /api/admin/users/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
