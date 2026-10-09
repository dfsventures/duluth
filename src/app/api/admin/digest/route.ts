export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { buildDigestActionItems, titleKey } from "@/lib/board-server";
import { planCardWrites, type ResolvedItem } from "@/lib/board-reconcile";
import { POSITION_STEP, MAX_TITLE_LENGTH, parseDueDate, positionBetween } from "@/lib/board";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const digests = await db.weeklyDigest.findMany({
      orderBy: { weekOf: "desc" },
      include: {
        todos: {
          include: { assignee: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json(digests);
  } catch (err) {
    console.error("GET /api/admin/digest error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

interface SaveTodo {
  text: string;
  ownerId?: string | null;
  projectId?: string | null;
  ownerRaw?: string | null;
  projectRaw?: string | null;
  needsReview?: boolean;
  existingCardId?: string | null;
  dueDate?: string | null;
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const { weekOf, title, sections, todos = [] } = body as {
      weekOf: string;
      title: string;
      sections: { id: string; heading: string; content: string }[];
      todos: SaveTodo[];
    };

    if (!weekOf || !title || !Array.isArray(sections)) {
      return NextResponse.json({ error: "weekOf, title, and sections are required" }, { status: 400 });
    }
    if (!Array.isArray(todos) || todos.length > 200) {
      return NextResponse.json({ error: "Invalid todos" }, { status: 400 });
    }

    const items: ResolvedItem[] = [];
    for (const t of todos) {
      const text = typeof t?.text === "string" ? t.text.trim() : "";
      if (!text || text.length > MAX_TITLE_LENGTH) {
        return NextResponse.json({ error: "Each todo needs 1-300 characters of text" }, { status: 400 });
      }
      const due = t.dueDate ? parseDueDate(t.dueDate) : null;
      if (due === undefined) {
        return NextResponse.json({ error: "dueDate must be YYYY-MM-DD" }, { status: 400 });
      }
      items.push({
        title: text,
        ownerId: t.ownerId || null,
        rawOwnerName: t.ownerRaw?.trim() || null,
        projectId: t.projectId || null,
        rawProjectName: t.projectRaw?.trim() || null,
        dueDate: due,
        needsReview: Boolean(t.needsReview),
        existingCardId: t.existingCardId || null,
      });
    }

    const ownerIds = Array.from(new Set(items.map((i) => i.ownerId).filter(Boolean) as string[]));
    const projectIds = Array.from(new Set(items.map((i) => i.projectId).filter(Boolean) as string[]));
    if (ownerIds.length) {
      const found = await db.boardPerson.count({ where: { id: { in: ownerIds } } });
      if (found !== ownerIds.length) return NextResponse.json({ error: "Unknown owner" }, { status: 400 });
    }
    if (projectIds.length) {
      const found = await db.boardProject.count({ where: { id: { in: projectIds } } });
      if (found !== projectIds.length) return NextResponse.json({ error: "Unknown project" }, { status: 400 });
    }

    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 25);

    // Q102 = A: digest, board cards and the linked action-item rows in one transaction.
    await db.$transaction(
      async (tx) => {
        await tx.weeklyDigest.create({
          data: { id, weekOf: new Date(weekOf), title, sections },
        });

        const withKeys = items.map((i) => ({ ...i, sourceKey: `paste:${id}:${titleKey(i.title)}` }));
        const existing = await tx.boardCard.findMany({
          where: { archivedAt: null, status: { not: "DONE" } },
          select: { id: true, sourceKey: true, humanEditedAt: true, ownerId: true, projectId: true, dueDate: true },
        });
        const plans = planCardWrites(withKeys, existing);

        const now = new Date();
        const last = await tx.boardCard.findFirst({
          where: { status: "TODO", archivedAt: null },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        let position = positionBetween(last?.position, undefined);
        for (const plan of plans) {
          // link / skip: the card already exists (human edits win), no write.
          if (plan.action !== "create") continue;
          const it = plan.item;
          await tx.boardCard.create({
            data: {
              title: it.title,
              status: "TODO",
              position,
              dueDate: it.dueDate,
              ownerId: it.ownerId,
              rawOwnerName: it.rawOwnerName,
              projectId: it.projectId,
              rawProjectName: it.rawProjectName,
              needsReview: it.needsReview,
              source: "DIGEST_PASTE",
              sourceRef: id,
              sourceKey: it.sourceKey ?? null,
              humanEditedAt: now, // an admin reviewed it in the composer
              createdById: user!.id,
              updatedById: user!.id,
            },
          });
          position += POSITION_STEP;
        }

        await buildDigestActionItems(id, tx);
      },
      { timeout: 20_000 }
    );

    const digest = await db.weeklyDigest.findUnique({
      where: { id },
      include: {
        todos: {
          include: { assignee: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    await logAdminAction(user!, "DIGEST_CREATED", { targetType: "WeeklyDigest", targetId: id, metadata: { title } });
    return NextResponse.json(digest, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/digest error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
