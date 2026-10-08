export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { ensureAdminPeople, loadBoardContext } from "@/lib/board-server";
import { resolveEntity } from "@/lib/board-reconcile";
import { POSITION_STEP, MAX_TITLE_LENGTH, splitOwnerSuffix } from "@/lib/board";

// Part 37 (WS107) — one-time import of the latest digest's open todos onto the
// board (Q96 = A). Exactly-once via sourceKey `import:<digestTodoId>`.

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => null);
    const dryRun = body?.dryRun !== false; // anything but an explicit false is a preview

    const digest = await db.weeklyDigest.findFirst({
      orderBy: [{ weekOf: "desc" }, { createdAt: "desc" }],
      include: {
        todos: {
          where: { completed: false, cardId: null },
          orderBy: { createdAt: "asc" },
          include: { assignee: { select: { id: true } } },
        },
      },
    });
    if (!digest) {
      return NextResponse.json({ digest: null, items: [], created: 0, skipped: 0, dryRun });
    }

    await ensureAdminPeople();
    const ctx = await loadBoardContext();
    const adminPeople = await db.boardPerson.findMany({
      where: { userId: { not: null } },
      select: { id: true, userId: true },
    });
    const personByUser = new Map(adminPeople.map((p) => [p.userId as string, p.id]));
    const labelById = new Map(ctx.people.map((p) => [p.id, p.name]));

    const keys = digest.todos.map((t) => `import:${t.id}`);
    const already = new Set(
      (
        await db.boardCard.findMany({
          where: { sourceKey: { in: keys } },
          select: { sourceKey: true },
        })
      ).map((c) => c.sourceKey)
    );

    const items = digest.todos.map((t) => {
      const { title, ownerRaw } = splitOwnerSuffix(t.text);
      let ownerId: string | null = null;
      let rawOwnerName: string | null = null;
      let needsReview = false;
      if (t.assigneeId && personByUser.has(t.assigneeId)) {
        ownerId = personByUser.get(t.assigneeId)!;
      } else if (ownerRaw) {
        const r = resolveEntity(ownerRaw, null, ctx.people);
        ownerId = r.id;
        rawOwnerName = r.raw;
        needsReview = r.needsReview;
      }
      return {
        todoId: t.id,
        title: (title || t.text).slice(0, MAX_TITLE_LENGTH),
        ownerId,
        ownerLabel: ownerId ? (labelById.get(ownerId) ?? null) : null,
        rawOwnerName,
        needsReview,
        alreadyImported: already.has(`import:${t.id}`),
      };
    });

    const digestInfo = { id: digest.id, title: digest.title, weekOf: digest.weekOf };
    const pending = items.filter((i) => !i.alreadyImported);

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        digest: digestInfo,
        items: pending,
        created: 0,
        skipped: items.length - pending.length,
      });
    }

    const last = await db.boardCard.findFirst({
      where: { status: "TODO", archivedAt: null },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    let position = (last?.position ?? 0) + POSITION_STEP;

    let created = 0;
    for (const item of pending) {
      try {
        await db.$transaction(async (tx) => {
          const card = await tx.boardCard.create({
            data: {
              title: item.title,
              status: "TODO",
              position,
              ownerId: item.ownerId,
              rawOwnerName: item.rawOwnerName,
              needsReview: item.needsReview,
              source: "DIGEST_IMPORT",
              sourceRef: digest.id,
              sourceKey: `import:${item.todoId}`,
              createdById: user!.id,
              updatedById: user!.id,
            },
          });
          await tx.digestTodo.update({ where: { id: item.todoId }, data: { cardId: card.id } });
        });
        position += POSITION_STEP;
        created++;
      } catch (e: any) {
        if (e?.code === "P2002") continue; // a concurrent run won: exactly-once holds
        throw e;
      }
    }

    await logAdminAction(user!, "BOARD_DIGEST_IMPORTED", {
      targetType: "WeeklyDigest",
      targetId: digest.id,
      metadata: { created, skipped: items.length - created },
    });
    return NextResponse.json({
      dryRun: false,
      digest: digestInfo,
      items: [],
      created,
      skipped: items.length - created,
    });
  } catch (err) {
    console.error("POST /api/admin/board/import-latest-digest error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
