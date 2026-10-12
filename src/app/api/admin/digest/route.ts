export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { buildDigestActionItems, titleKey } from "@/lib/board-server";
import { planCardWrites, fromSingleOwner, legacyOwnerFields, computeNeedsReview, type ResolvedItem } from "@/lib/board-reconcile";
import { POSITION_STEP, MAX_TITLE_LENGTH, MAX_NAME_LENGTH, MAX_OWNERS_PER_CARD, parseDueDate, positionBetween } from "@/lib/board";

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
  // Part 38: owner arrays. Legacy ownerId/ownerRaw still accepted (JC-MO-M).
  ownerIds?: string[];
  ownerRawNames?: Record<string, string | null>;
  unmatchedOwnerNames?: string[];
  ownerId?: string | null;
  ownerRaw?: string | null;
  projectId?: string | null;
  projectRaw?: string | null;
  needsReview?: boolean;
  existingCardId?: string | null;
  dueDate?: string | null;
}

type SaveOwners = Pick<ResolvedItem, "ownerIds" | "ownerRawNames" | "unmatchedOwnerNames">;

/** Validates one todo's owner fields (array form, or the legacy single-owner pair). */
function parseSaveOwners(t: SaveTodo): { ok: true; value: SaveOwners } | { ok: false; error: string } {
  const hasArrays = t.ownerIds !== undefined || t.unmatchedOwnerNames !== undefined || t.ownerRawNames !== undefined;
  if (!hasArrays) {
    return { ok: true, value: fromSingleOwner({ id: t.ownerId || null, raw: t.ownerRaw?.trim() || null }) };
  }
  const ids = t.ownerIds ?? [];
  const names = t.unmatchedOwnerNames ?? [];
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string" || !x)) {
    return { ok: false, error: "ownerIds must be an array of ids" };
  }
  if (!Array.isArray(names) || names.some((n) => typeof n !== "string" || !n.trim() || n.trim().length > MAX_NAME_LENGTH)) {
    return { ok: false, error: "Each unmatched owner name needs 1-120 characters" };
  }
  const rawNames = t.ownerRawNames ?? {};
  if (typeof rawNames !== "object" || rawNames === null || Array.isArray(rawNames)) {
    return { ok: false, error: "ownerRawNames must be an object" };
  }
  const uniqueIds = Array.from(new Set(ids));
  const trimmed = names.map((n) => n.trim());
  if (uniqueIds.length + trimmed.length > MAX_OWNERS_PER_CARD) {
    return { ok: false, error: `A card can have at most ${MAX_OWNERS_PER_CARD} owners` };
  }
  const raw: Record<string, string | null> = {};
  for (const id of uniqueIds) {
    const r = (rawNames as Record<string, unknown>)[id];
    if (r !== undefined && r !== null && (typeof r !== "string" || r.length > MAX_NAME_LENGTH)) {
      return { ok: false, error: "Invalid ownerRawNames" };
    }
    raw[id] = typeof r === "string" && r.trim() ? r.trim() : null;
  }
  return { ok: true, value: { ownerIds: uniqueIds, ownerRawNames: raw, unmatchedOwnerNames: trimmed } };
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
      const owners = parseSaveOwners(t);
      if (!owners.ok) return NextResponse.json({ error: owners.error }, { status: 400 });
      const projectId = t.projectId || null;
      const rawProjectName = t.projectRaw?.trim() || null;
      items.push({
        title: text,
        ...owners.value,
        projectId,
        rawProjectName,
        dueDate: due,
        // JC-MO-H: computed here, the client's flag is ignored.
        needsReview: computeNeedsReview({ unmatchedOwnerNames: owners.value.unmatchedOwnerNames, rawProjectName, projectId }),
        existingCardId: t.existingCardId || null,
      });
    }

    const ownerIds = Array.from(new Set(items.flatMap((i) => i.ownerIds)));
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
          select: { id: true, sourceKey: true, humanEditedAt: true, projectId: true, dueDate: true, owners: { select: { personId: true } } },
        });
        const plans = planCardWrites(
          withKeys,
          existing.map(({ owners, ...c }) => ({ ...c, ownerIds: owners.map((o) => o.personId) }))
        );

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
              ...legacyOwnerFields(it.ownerIds, it.ownerRawNames, it.unmatchedOwnerNames),
              owners: {
                create: it.ownerIds.map((personId) => ({ personId, rawName: it.ownerRawNames[personId] ?? null })),
              },
              unmatchedOwnerNames: it.unmatchedOwnerNames,
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
