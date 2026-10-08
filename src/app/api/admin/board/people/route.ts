export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { ensureAdminPeople } from "@/lib/board-server";
import { MAX_NAME_LENGTH } from "@/lib/board";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    await ensureAdminPeople();
    const people = await db.boardPerson.findMany({
      include: {
        user: { select: { name: true, email: true } },
        aliases: { select: { id: true, normalized: true } }, // additive (WS107): alias chips
      },
      orderBy: { displayName: "asc" },
    });
    return NextResponse.json(
      people.map(({ user, ...p }) => ({ ...p, label: user?.name ?? user?.email ?? p.displayName }))
    );
  } catch (err) {
    console.error("GET /api/admin/board/people error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Plain-name people only (no login). Linked admins are created by ensureAdminPeople().
export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => null);
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName || displayName.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: "A name of 1-120 characters is required" }, { status: 400 });
    }
    const person = await db.boardPerson.create({ data: { displayName } });
    await logAdminAction(user!, "BOARD_PERSON_CREATED", {
      targetType: "BoardPerson",
      targetId: person.id,
      metadata: { displayName },
    });
    return NextResponse.json(person, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/board/people error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
