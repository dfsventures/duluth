export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { normalizeName } from "@/lib/board-reconcile";
import { MAX_NAME_LENGTH } from "@/lib/board";

// Resolves a card's unmatched raw owner/project to a canonical one, optionally
// remembering the raw text as an alias, and applies the same resolution to
// every other open card carrying the same normalized raw value.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const ownerIdIn = str(b.ownerId);
    const projectIdIn = str(b.projectId);
    const newPersonName = str(b.newPersonName);
    const newProjectName = str(b.newProjectName);
    const remember = b.rememberAlias === true;

    if ((newPersonName && newPersonName.length > MAX_NAME_LENGTH) || (newProjectName && newProjectName.length > MAX_NAME_LENGTH)) {
      return NextResponse.json({ error: "Name too long" }, { status: 400 });
    }
    if (!ownerIdIn && !projectIdIn && !newPersonName && !newProjectName) {
      return NextResponse.json({ error: "Nothing to resolve" }, { status: 400 });
    }

    const card = await db.boardCard.findUnique({ where: { id } });
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    // Resolve / create the targets.
    let personId: string | null = null;
    let projectId: string | null = null;
    if (ownerIdIn) {
      if (!(await db.boardPerson.findUnique({ where: { id: ownerIdIn }, select: { id: true } }))) {
        return NextResponse.json({ error: "Unknown owner" }, { status: 400 });
      }
      personId = ownerIdIn;
    } else if (newPersonName) {
      personId = (await db.boardPerson.create({ data: { displayName: newPersonName } })).id;
    }
    if (projectIdIn) {
      if (!(await db.boardProject.findUnique({ where: { id: projectIdIn }, select: { id: true } }))) {
        return NextResponse.json({ error: "Unknown project" }, { status: 400 });
      }
      projectId = projectIdIn;
    } else if (newProjectName) {
      const existing = (await db.boardProject.findMany({ select: { id: true, name: true } })).find(
        (p) => normalizeName(p.name) === normalizeName(newProjectName)
      );
      if (existing) {
        return NextResponse.json({ error: "A project with that name already exists" }, { status: 409 });
      }
      projectId = (await db.boardProject.create({ data: { name: newProjectName } })).id;
    }

    const rawOwnerNorm = card.rawOwnerName ? normalizeName(card.rawOwnerName) : "";
    const rawProjectNorm = card.rawProjectName ? normalizeName(card.rawProjectName) : "";

    // Alias creation is 409-safe: an existing (kind, normalized) is left as is.
    async function remember_(kind: "PERSON" | "PROJECT", normalized: string, targetId: string) {
      if (!normalized) return false;
      try {
        await db.boardAlias.create({
          data: {
            kind,
            normalized,
            personId: kind === "PERSON" ? targetId : null,
            projectId: kind === "PROJECT" ? targetId : null,
            createdById: user!.id,
          },
        });
        return true;
      } catch (e: any) {
        if (e?.code === "P2002") return false;
        throw e;
      }
    }
    let aliasesCreated = 0;
    if (remember && personId && rawOwnerNorm && (await remember_("PERSON", rawOwnerNorm, personId))) aliasesCreated++;
    if (remember && projectId && rawProjectNorm && (await remember_("PROJECT", rawProjectNorm, projectId))) aliasesCreated++;

    // Apply to the target card and every other open card with the same raw value.
    const candidates = await db.boardCard.findMany({
      where: { archivedAt: null, OR: [{ rawOwnerName: { not: null } }, { rawProjectName: { not: null } }] },
      select: { id: true, rawOwnerName: true, rawProjectName: true },
    });
    const now = new Date();
    let fixed = 0;
    for (const c of candidates) {
      const isTarget = c.id === id;
      const data: Record<string, unknown> = {};
      let rawO = c.rawOwnerName;
      let rawP = c.rawProjectName;
      if (personId && (isTarget || (rawOwnerNorm && c.rawOwnerName && normalizeName(c.rawOwnerName) === rawOwnerNorm))) {
        data.ownerId = personId;
        data.rawOwnerName = null;
        rawO = null;
      }
      if (projectId && (isTarget || (rawProjectNorm && c.rawProjectName && normalizeName(c.rawProjectName) === rawProjectNorm))) {
        data.projectId = projectId;
        data.rawProjectName = null;
        rawP = null;
      }
      if (Object.keys(data).length === 0) continue;
      data.needsReview = !!(rawO || rawP);
      data.updatedById = user!.id;
      if (isTarget) data.humanEditedAt = now;
      await db.boardCard.update({ where: { id: c.id }, data });
      if (!isTarget) fixed++;
    }
    // The target may not have had raw values (nothing in candidates): still apply.
    if (!candidates.some((c) => c.id === id)) {
      const data: Record<string, unknown> = { humanEditedAt: now, updatedById: user!.id };
      if (personId) { data.ownerId = personId; data.rawOwnerName = null; }
      if (projectId) { data.projectId = projectId; data.rawProjectName = null; }
      data.needsReview = false;
      await db.boardCard.update({ where: { id }, data });
    }

    const updated = await db.boardCard.findUnique({ where: { id } });

    await logAdminAction(user!, "BOARD_CARD_UPDATED", {
      targetType: "BoardCard",
      targetId: id,
      metadata: { resolve: true, ownerId: personId, projectId, otherCardsFixed: fixed },
    });
    if (aliasesCreated > 0) {
      await logAdminAction(user!, "BOARD_ALIAS_CREATED", {
        targetType: "BoardCard",
        targetId: id,
        metadata: { count: aliasesCreated },
      });
    }
    if (newPersonName && personId) {
      await logAdminAction(user!, "BOARD_PERSON_CREATED", { targetType: "BoardPerson", targetId: personId, metadata: { displayName: newPersonName } });
    }
    if (newProjectName && projectId && !projectIdIn) {
      await logAdminAction(user!, "BOARD_PROJECT_CREATED", { targetType: "BoardProject", targetId: projectId, metadata: { name: newProjectName } });
    }

    return NextResponse.json({ card: updated, fixed });
  } catch (err) {
    console.error("POST /api/admin/board/cards/[id]/resolve error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
