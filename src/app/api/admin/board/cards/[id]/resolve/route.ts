export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { normalizeName, computeNeedsReview } from "@/lib/board-reconcile";
import { setCardOwnersIn, CARD_OWNER_INCLUDE, toCardData } from "@/lib/board-server";
import { MAX_NAME_LENGTH, MAX_OWNERS_PER_CARD } from "@/lib/board";

// POST …/cards/[id]/resolve
// { owners?: { raw: string; personId?: string; newPerson?: true; ignore?: true }[],   // exactly one of the three per entry
//   projectId?: string; newProjectName?: string; rememberAlias?: boolean }
// Legacy (JC-MO-M): { ownerId } / { newPersonName } resolve card.unmatchedOwnerNames[0].
// -> { card, fixed }   (unchanged response shape; `card` now also carries ownerIds)
//
// Resolves the card's unmatched heard owner names (each on its own) and/or its
// unmatched project, optionally remembering the heard text as an alias, and
// applies the same resolution to every other open card carrying the same
// normalized heard value. An ignored name is dropped from the card, never
// propagates and never becomes an alias (Q106-A). Only the target card gets
// humanEditedAt (Part 37 contract).

interface OwnerEntry {
  raw: string | null; // null only for a legacy body on a card with nothing unmatched
  personId?: string;
  newPerson?: boolean;
  ignore?: boolean;
  displayName?: string; // legacy newPersonName; defaults to raw
}

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
    const projectIdIn = str(b.projectId);
    const newProjectName = str(b.newProjectName);
    const remember = b.rememberAlias === true;

    if (newProjectName && newProjectName.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: "Name too long" }, { status: 400 });
    }

    const card = await db.boardCard.findUnique({
      where: { id },
      include: { owners: { select: { personId: true, rawName: true } } },
    });
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    // Parse the owner entries (new array form, or the legacy single-owner form).
    let entries: OwnerEntry[] = [];
    const legacyOwnerId = str(b.ownerId);
    const legacyNewPerson = str(b.newPersonName);
    if (Array.isArray(b.owners)) {
      if (legacyOwnerId || legacyNewPerson) {
        return NextResponse.json({ error: "Send owners or ownerId, not both" }, { status: 400 });
      }
      for (const raw of b.owners as unknown[]) {
        const e = raw as Record<string, unknown> | null;
        const name = e && typeof e === "object" ? str(e.raw) : null;
        if (!e || typeof e !== "object" || !name || name.length > MAX_NAME_LENGTH) {
          return NextResponse.json({ error: "Each owner entry needs the name it was heard as" }, { status: 400 });
        }
        const chosen = [str(e.personId) ? 1 : 0, e.newPerson === true ? 1 : 0, e.ignore === true ? 1 : 0].reduce((a, c) => a + c, 0);
        if (chosen !== 1) {
          return NextResponse.json({ error: "Each owner entry needs exactly one of personId, newPerson, ignore" }, { status: 400 });
        }
        entries.push({
          raw: name,
          personId: str(e.personId) ?? undefined,
          newPerson: e.newPerson === true,
          ignore: e.ignore === true,
        });
      }
    } else if (legacyOwnerId || legacyNewPerson) {
      if (legacyNewPerson && legacyNewPerson.length > MAX_NAME_LENGTH) {
        return NextResponse.json({ error: "Name too long" }, { status: 400 });
      }
      const heard = card.unmatchedOwnerNames[0] ?? null;
      entries.push(
        legacyOwnerId
          ? { raw: heard, personId: legacyOwnerId }
          : { raw: heard, newPerson: true, displayName: legacyNewPerson as string }
      );
    }
    if (entries.length === 0 && !projectIdIn && !newProjectName) {
      return NextResponse.json({ error: "Nothing to resolve" }, { status: 400 });
    }

    // Two entries for the same heard name collapse to the first.
    const seenRaw = new Set<string>();
    entries = entries.filter((e) => {
      if (!e.raw) return true;
      const n = normalizeName(e.raw);
      if (seenRaw.has(n)) return false;
      seenRaw.add(n);
      return true;
    });

    // Every heard name must actually be waiting on this card.
    const waiting = new Map(card.unmatchedOwnerNames.map((n) => [normalizeName(n), n]));
    for (const e of entries) {
      if (e.raw && !waiting.has(normalizeName(e.raw))) {
        return NextResponse.json({ error: "That name isn't waiting to be resolved" }, { status: 400 });
      }
    }

    // Validate every target before any write.
    const personIds = entries.map((e) => e.personId).filter((x): x is string => !!x);
    if (personIds.length && (await db.boardPerson.count({ where: { id: { in: [...new Set(personIds)] } } })) !== new Set(personIds).size) {
      return NextResponse.json({ error: "Unknown owner" }, { status: 400 });
    }
    if (projectIdIn) {
      if (!(await db.boardProject.findUnique({ where: { id: projectIdIn }, select: { id: true } }))) {
        return NextResponse.json({ error: "Unknown project" }, { status: 400 });
      }
    } else if (newProjectName) {
      const existing = (await db.boardProject.findMany({ select: { id: true, name: true } })).find(
        (p) => normalizeName(p.name) === normalizeName(newProjectName)
      );
      if (existing) {
        return NextResponse.json({ error: "A project with that name already exists" }, { status: 409 });
      }
    }

    // Cap (JC-MO-C): owners after + names still waiting. New people always add one.
    const resolvedRaw = new Set(entries.filter((e) => e.raw).map((e) => normalizeName(e.raw as string)));
    const remainingUnmatched = card.unmatchedOwnerNames.filter((n) => !resolvedRaw.has(normalizeName(n)));
    const currentIds = card.owners.map((o) => o.personId);
    const addedExisting = new Set(personIds.filter((p) => !currentIds.includes(p)));
    const newPeopleCount = entries.filter((e) => e.newPerson).length;
    if (currentIds.length + addedExisting.size + newPeopleCount + remainingUnmatched.length > MAX_OWNERS_PER_CARD) {
      return NextResponse.json(
        { error: `A card can have at most ${MAX_OWNERS_PER_CARD} owners` },
        { status: 400 }
      );
    }

    const rawProjectNorm = card.rawProjectName ? normalizeName(card.rawProjectName) : "";
    const now = new Date();
    let fixed = 0;
    let aliasesCreated = 0;
    const createdPeople: { id: string; name: string }[] = [];
    let createdProject: { id: string; name: string } | null = null;
    let projectId: string | null = null;
    const targetOwnerIds: string[] = [];

    await db.$transaction(async (tx) => {
      // 1. Targets. Two entries resolving to the same person collapse into one owner (JC-MO-L).
      const resolvedByRaw = new Map<string, string>(); // normalized raw -> personId (non-ignored)
      const addIds: string[] = [];
      const addRaw: Record<string, string | null> = {};
      for (const e of entries) {
        if (e.ignore) continue;
        let pid = e.personId ?? null;
        if (!pid) {
          const p = await tx.boardPerson.create({ data: { displayName: (e.displayName ?? e.raw) as string } });
          pid = p.id;
          createdPeople.push({ id: p.id, name: (e.displayName ?? e.raw) as string });
        }
        if (e.raw) resolvedByRaw.set(normalizeName(e.raw), pid);
        if (!addIds.includes(pid)) {
          addIds.push(pid);
          addRaw[pid] = e.raw;
        }
      }
      if (projectIdIn) {
        projectId = projectIdIn;
      } else if (newProjectName) {
        const p = await tx.boardProject.create({ data: { name: newProjectName } });
        projectId = p.id;
        createdProject = { id: p.id, name: newProjectName };
      }

      // 2. Aliases (409-safe via skipDuplicates). Only human resolutions, never an ignored name.
      if (remember) {
        const rows: { kind: "PERSON" | "PROJECT"; normalized: string; personId: string | null; projectId: string | null }[] = [];
        for (const e of entries) {
          if (e.ignore || !e.raw) continue;
          const n = normalizeName(e.raw);
          const pid = resolvedByRaw.get(n);
          if (n && pid) rows.push({ kind: "PERSON", normalized: n, personId: pid, projectId: null });
        }
        if (projectId && rawProjectNorm) {
          rows.push({ kind: "PROJECT", normalized: rawProjectNorm, personId: null, projectId });
        }
        if (rows.length) {
          const res = await tx.boardAlias.createMany({
            data: rows.map((r) => ({ ...r, createdById: user!.id })),
            skipDuplicates: true,
          });
          aliasesCreated = res.count;
        }
      }

      // 3. The target card.
      if (entries.length) {
        const nextOwners = [...currentIds, ...addIds.filter((p) => !currentIds.includes(p))];
        const raw: Record<string, string | null> = {};
        for (const o of card.owners) raw[o.personId] = o.rawName;
        for (const p of addIds) if (!currentIds.includes(p)) raw[p] = addRaw[p];
        await setCardOwnersIn(tx, id, nextOwners, raw, remainingUnmatched);
        targetOwnerIds.push(...addIds);
      }
      const rawProjectAfter = projectId ? null : card.rawProjectName;
      const projectIdAfter = projectId ?? card.projectId;
      await tx.boardCard.update({
        where: { id },
        data: {
          ...(projectId ? { projectId, rawProjectName: null } : {}),
          needsReview: computeNeedsReview({
            unmatchedOwnerNames: entries.length ? remainingUnmatched : card.unmatchedOwnerNames,
            rawProjectName: rawProjectAfter,
            projectId: projectIdAfter,
          }),
          humanEditedAt: now,
          updatedById: user!.id,
        },
      });

      // 4. Propagation to other open cards carrying the same heard values.
      if (resolvedByRaw.size > 0 || (projectId && rawProjectNorm)) {
        const candidates = await tx.boardCard.findMany({
          where: {
            archivedAt: null,
            id: { not: id },
            OR: [
              { unmatchedOwnerNames: { isEmpty: false } },
              { rawProjectName: { not: null }, projectId: null },
            ],
          },
          select: {
            id: true,
            unmatchedOwnerNames: true,
            rawProjectName: true,
            projectId: true,
            owners: { select: { personId: true, rawName: true } },
          },
        });
        for (const c of candidates) {
          let changed = false;
          const owners = c.owners.map((o) => o.personId);
          const raw: Record<string, string | null> = {};
          for (const o of c.owners) raw[o.personId] = o.rawName;
          const stillUnmatched: string[] = [];
          const adding: string[] = [];
          for (const name of c.unmatchedOwnerNames) {
            const pid = resolvedByRaw.get(normalizeName(name));
            if (pid) {
              if (!owners.includes(pid) && !adding.includes(pid)) {
                adding.push(pid);
                raw[pid] = name;
              }
            } else {
              stillUnmatched.push(name);
            }
          }
          let ownersChanged = adding.length > 0 || stillUnmatched.length !== c.unmatchedOwnerNames.length;
          // A card that would end up over the cap keeps its name and stays flagged.
          if (ownersChanged && owners.length + adding.length + stillUnmatched.length > MAX_OWNERS_PER_CARD) {
            adding.length = 0;
            ownersChanged = false;
          }
          const projectHit =
            !!projectId &&
            !!rawProjectNorm &&
            c.projectId == null &&
            !!c.rawProjectName &&
            normalizeName(c.rawProjectName) === rawProjectNorm;
          if (ownersChanged) {
            await setCardOwnersIn(tx, c.id, [...owners, ...adding], raw, stillUnmatched);
            changed = true;
          }
          if (projectHit || ownersChanged) {
            await tx.boardCard.update({
              where: { id: c.id },
              data: {
                ...(projectHit ? { projectId, rawProjectName: null } : {}),
                needsReview: computeNeedsReview({
                  unmatchedOwnerNames: ownersChanged ? stillUnmatched : c.unmatchedOwnerNames,
                  rawProjectName: projectHit ? null : c.rawProjectName,
                  projectId: projectHit ? projectId : c.projectId,
                }),
                updatedById: user!.id,
              },
            });
            changed = true;
          }
          if (changed) fixed++;
        }
      }
    });

    const updated = await db.boardCard.findUnique({ where: { id }, include: CARD_OWNER_INCLUDE });

    await logAdminAction(user!, "BOARD_CARD_UPDATED", {
      targetType: "BoardCard",
      targetId: id,
      metadata: {
        resolve: true,
        ownerIds: targetOwnerIds,
        ignored: entries.filter((e) => e.ignore).length,
        projectId,
        otherCardsFixed: fixed,
      },
    });
    if (aliasesCreated > 0) {
      await logAdminAction(user!, "BOARD_ALIAS_CREATED", {
        targetType: "BoardCard",
        targetId: id,
        metadata: { count: aliasesCreated },
      });
    }
    for (const p of createdPeople) {
      await logAdminAction(user!, "BOARD_PERSON_CREATED", { targetType: "BoardPerson", targetId: p.id, metadata: { displayName: p.name } });
    }
    const cp = createdProject as { id: string; name: string } | null;
    if (cp) {
      await logAdminAction(user!, "BOARD_PROJECT_CREATED", { targetType: "BoardProject", targetId: cp.id, metadata: { name: cp.name } });
    }

    return NextResponse.json({ card: updated ? toCardData(updated) : updated, fixed });
  } catch (err) {
    console.error("POST /api/admin/board/cards/[id]/resolve error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
