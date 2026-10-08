export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { ensureAdminPeople } from "@/lib/board-server";
import { doneCutoff } from "@/lib/board";

export async function GET(request: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const includeArchived = new URL(request.url).searchParams.get("archived") === "1";
    await ensureAdminPeople();

    const cardWhere = includeArchived
      ? {}
      : {
          archivedAt: null,
          NOT: { status: "DONE", completedAt: { lt: doneCutoff() } },
        };

    const [cards, projects, people, needsReviewCount] = await Promise.all([
      db.boardCard.findMany({
        where: cardWhere,
        orderBy: [{ status: "asc" }, { position: "asc" }],
      }),
      db.boardProject.findMany({
        where: includeArchived ? {} : { archivedAt: null },
        orderBy: { name: "asc" },
      }),
      db.boardPerson.findMany({
        where: includeArchived ? {} : { archivedAt: null },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { displayName: "asc" },
      }),
      db.boardCard.count({ where: { needsReview: true, archivedAt: null } }),
    ]);

    return NextResponse.json({
      cards,
      projects,
      people: people.map(({ user, ...p }) => ({
        ...p,
        label: user?.name ?? user?.email ?? p.displayName,
      })),
      needsReviewCount,
    });
  } catch (err) {
    console.error("GET /api/admin/board error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
