// Part 37 (WS109.2) — exactly-once Granola intake. Server only.
// Layers: GranolaIntake.noteId @unique (enqueue once) -> conditional-claim
// updateMany (one worker) -> BoardCard.sourceKey / WeeklyDigest.granolaNoteId
// @unique (a crash after partial writes cannot duplicate on retry).
// Confidentiality: note titles/content are never logged; errors stored are
// class/status only.
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/audit";
import {
  getGranolaNote,
  listFolderNotes,
  noteInFolder,
  granolaIntakeEnabled,
  GranolaApiError,
  type GranolaNote,
} from "@/lib/granola";
import { extractDigest, DigestExtractionError } from "@/lib/digest-extraction";
import { loadBoardContext, buildDigestActionItems, titleKey } from "@/lib/board-server";
import { planCardWrites, resolveEntity, normalizeName, type ResolvedItem } from "@/lib/board-reconcile";
import { plainToDigestHtml } from "@/lib/digest-html";
import { POSITION_STEP, MAX_TITLE_LENGTH, parseDueDate, positionBetween } from "@/lib/board";
import { sendDigestDraftReadyEmail, BASE_URL } from "@/lib/email";

export type IntakeTrigger = "WEBHOOK" | "SWEEP" | "MANUAL";

const SYSTEM_ACTOR = { email: "granola-intake@system" };
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 100;

export interface PreviewItem {
  title: string;
  owner: string | null;
  project: string | null;
  needsReview: boolean;
  action: "create" | "link" | "fill" | "skip";
}

export interface IntakeResult {
  outcome: "done" | "skipped" | "failed" | "retry-later" | "busy" | "dry-run";
  reason?: string;
  digestId?: string;
  cardsCreated: number;
  cardsLinked: number;
  needsReview: number;
  /** Only for dry runs. Shown to the admin who asked; never logged. */
  preview?: { digestTitle: string; items: PreviewItem[] };
}

const empty = (outcome: IntakeResult["outcome"], reason?: string): IntakeResult => ({
  outcome,
  reason,
  cardsCreated: 0,
  cardsLinked: 0,
  needsReview: 0,
});

export async function enqueueGranolaNote(noteId: string, trigger: IntakeTrigger, eventId?: string) {
  try {
    return await db.granolaIntake.create({
      data: { noteId, trigger, status: "PENDING", lastEventId: eventId ?? null },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      if (eventId) {
        await db.granolaIntake.update({ where: { noteId }, data: { lastEventId: eventId } }).catch(() => {});
      }
      return null; // already known
    }
    throw err;
  }
}

export async function claim(id: string): Promise<boolean> {
  const stale = new Date(Date.now() - 15 * 60_000);
  const { count } = await db.granolaIntake.updateMany({
    where: {
      id,
      OR: [
        { status: "PENDING" },
        { status: "FAILED", attempts: { lt: 3 } },
        { status: "PROCESSING", lockedAt: { lt: stale } },
      ],
    },
    data: { status: "PROCESSING", lockedAt: new Date(), attempts: { increment: 1 } },
  });
  return count === 1;
}

/** Error text safe to store: our own messages, or just class/status/code. Never provider/Prisma messages (they can echo content). */
export function safeErrorText(err: unknown): string {
  if (err instanceof GranolaApiError || err instanceof DigestExtractionError) return err.message.slice(0, 500);
  const e = err as { name?: string; status?: number; code?: string };
  const parts = [e?.name ?? "Error"];
  if (e?.status) parts.push(String(e.status));
  if (e?.code) parts.push(String(e.code));
  return parts.join(" ").slice(0, 500);
}

function attendeeEmailFor(raw: string | null, attendees: GranolaNote["attendees"]): string | null {
  if (!raw) return null;
  const n = normalizeName(raw);
  if (!n) return null;
  const full = attendees.filter((a) => a.name && normalizeName(a.name) === n);
  if (full.length === 1) return full[0].email;
  const first = attendees.filter((a) => a.name && normalizeName(a.name).split(" ")[0] === n);
  return first.length === 1 ? first[0].email : null;
}

async function finish(id: string, data: Prisma.GranolaIntakeUpdateInput) {
  await db.granolaIntake.update({ where: { id }, data: { lockedAt: null, ...data } });
}

export async function processGranolaIntake(
  id: string,
  opts: { dryRun?: boolean; manual?: boolean } = {}
): Promise<IntakeResult> {
  const dry = Boolean(opts.dryRun);
  // Dry runs never claim or touch the intake row: "DB unchanged".
  let row: { id: string; noteId: string } | null;
  if (dry) {
    row = await db.granolaIntake.findUnique({ where: { id }, select: { id: true, noteId: true } });
  } else {
    if (!(await claim(id))) return empty("busy", "busy-or-done");
    row = await db.granolaIntake.findUnique({ where: { id }, select: { id: true, noteId: true } });
  }
  if (!row) return empty("skipped", "unknown intake");
  return processNote(row.id, row.noteId, opts);
}

/** Preview by note id with no intake row at all (WS109.4). */
export async function previewGranolaNote(noteId: string): Promise<IntakeResult> {
  return processNote(null, noteId, { dryRun: true, manual: true });
}

async function processNote(
  intakeId: string | null,
  noteId: string,
  opts: { dryRun?: boolean; manual?: boolean }
): Promise<IntakeResult> {
  const dry = Boolean(opts.dryRun);
  const skip = async (reason: string): Promise<IntakeResult> => {
    if (intakeId && !dry) await finish(intakeId, { status: "SKIPPED", skipReason: reason, finishedAt: new Date() });
    return empty("skipped", reason);
  };

  try {
    const note = await getGranolaNote(noteId);
    if (!note || note.deleted_at) return skip("not accessible");

    // Confidentiality guard (Q93): holds even if a webhook was registered without folder_ids.
    const folderId = process.env.GRANOLA_FOLDER_ID ?? "";
    if (!folderId || !noteInFolder(note, folderId)) return skip("outside folder");

    if (intakeId && !dry) {
      await db.granolaIntake.update({ where: { id: intakeId }, data: { noteTitle: note.title?.slice(0, 300) ?? null } });
    }

    // Guards a bulk access-granted flood from re-sharing an old folder. Manual actions bypass it.
    if (!opts.manual && Date.now() - new Date(note.created_at).getTime() > MAX_AGE_MS) {
      return skip("older than 7 days");
    }

    const notesText = note.summary_markdown ?? note.summary_text ?? "";
    if (!notesText.trim()) {
      // Summary not ready yet: back to PENDING without spending an attempt.
      if (intakeId && !dry) {
        await finish(intakeId, { status: "PENDING", attempts: { decrement: 1 }, skipReason: "waiting for summary" });
      }
      return empty("retry-later", "no summary yet");
    }

    const ctx = await loadBoardContext();
    const meetingDate = new Date(note.calendar_event?.scheduled_start_time ?? note.created_at);
    // JC-TB-E: summary only, never the transcript.
    const extracted = await extractDigest({
      notesText,
      meetingTitle: note.title ?? undefined,
      meetingDate,
      attendees: note.attendees,
      ctx,
    });

    const items: ResolvedItem[] = [];
    for (const it of extracted.items.slice(0, MAX_ITEMS)) {
      const title = it.title.slice(0, MAX_TITLE_LENGTH);
      const owner = resolveEntity(it.ownerRaw, it.ownerId, ctx.people, attendeeEmailFor(it.ownerRaw, note.attendees));
      const project = resolveEntity(it.projectRaw, it.projectId, ctx.projects);
      const due = it.dueDate ? parseDueDate(it.dueDate) : null;
      items.push({
        title,
        sourceKey: `granola:${noteId}:${titleKey(title)}`,
        existingCardId: it.existingCardId,
        ownerId: owner.id,
        rawOwnerName: owner.raw,
        projectId: project.id,
        rawProjectName: project.raw,
        dueDate: due ?? null,
        needsReview: owner.needsReview || project.needsReview,
      });
    }

    const existing = await db.boardCard.findMany({
      where: { archivedAt: null, status: { not: "DONE" } },
      select: { id: true, sourceKey: true, humanEditedAt: true, ownerId: true, projectId: true, dueDate: true },
    });
    const plans = planCardWrites(items, existing);

    if (dry) {
      const pName = new Map(ctx.people.map((p) => [p.id, p.name]));
      const prName = new Map(ctx.projects.map((p) => [p.id, p.name]));
      return {
        outcome: "dry-run",
        cardsCreated: plans.filter((p) => p.action === "create").length,
        cardsLinked: plans.filter((p) => p.action === "link").length,
        needsReview: items.filter((i) => i.needsReview).length,
        preview: {
          digestTitle: extracted.title,
          items: plans.map((p) => ({
            title: p.item.title,
            owner: (p.item.ownerId && pName.get(p.item.ownerId)) || (p.item.rawOwnerName ? `heard as "${p.item.rawOwnerName}"` : null),
            project: (p.item.projectId && prName.get(p.item.projectId)) || (p.item.rawProjectName ? `heard as "${p.item.rawProjectName}"` : null),
            needsReview: p.item.needsReview,
            action: p.action,
          })),
        },
      };
    }

    let digestId = "";
    let createdDigest = false;
    let cardsCreated = 0;
    const cardsLinked = plans.filter((p) => p.action === "link").length;

    await db.$transaction(
      async (tx) => {
        const creates = plans.filter((p) => p.action === "create");
        if (creates.length) {
          const last = await tx.boardCard.findFirst({
            where: { status: "TODO", archivedAt: null },
            orderBy: { position: "desc" },
            select: { position: true },
          });
          let position = positionBetween(last?.position, undefined);
          const data = creates.map((p) => {
            const it = p.item;
            const d = {
              title: it.title,
              status: "TODO",
              position,
              dueDate: it.dueDate,
              ownerId: it.ownerId,
              rawOwnerName: it.rawOwnerName,
              projectId: it.projectId,
              rawProjectName: it.rawProjectName,
              needsReview: it.needsReview,
              source: "GRANOLA",
              sourceRef: noteId,
              sourceKey: it.sourceKey ?? null,
              humanEditedAt: null,
              createdById: null,
              updatedById: null,
            };
            position += POSITION_STEP;
            return d;
          });
          const res = await tx.boardCard.createMany({ data, skipDuplicates: true });
          cardsCreated = res.count;
        }
        for (const p of plans) {
          if (p.action !== "fill" || Object.keys(p.fill).length === 0) continue;
          await tx.boardCard.update({ where: { id: p.cardId }, data: p.fill });
        }

        const found = await tx.weeklyDigest.findUnique({ where: { granolaNoteId: noteId }, select: { id: true } });
        if (found) {
          digestId = found.id;
        } else {
          digestId = crypto.randomUUID().replace(/-/g, "").slice(0, 25);
          createdDigest = true;
          await tx.weeklyDigest.create({
            data: {
              id: digestId,
              weekOf: meetingDate,
              title: extracted.title,
              sections: extracted.sections.map((s) => ({
                id: s.id,
                heading: s.heading,
                content: plainToDigestHtml(s.content),
              })),
              source: "GRANOLA",
              granolaNoteId: noteId,
            },
          });
        }
        await buildDigestActionItems(digestId, tx);
        if (intakeId) {
          await tx.granolaIntake.update({
            where: { id: intakeId },
            data: {
              status: "DONE",
              digestId,
              cardsCreated,
              cardsLinked,
              skipReason: null,
              error: null,
              lockedAt: null,
              finishedAt: new Date(),
            },
          });
        }
      },
      { timeout: 20_000 }
    );

    const needsReview = items.filter((i) => i.needsReview).length;
    await logAdminAction(SYSTEM_ACTOR, "GRANOLA_INTAKE_PROCESSED", {
      targetType: "WeeklyDigest",
      targetId: digestId,
      metadata: { cardsCreated, cardsLinked, needsReview },
    });

    if (createdDigest) await notifyRecorder(note, extracted.title, needsReview, digestId);

    return { outcome: "done", digestId, cardsCreated, cardsLinked, needsReview };
  } catch (err) {
    if (dry) throw err; // the caller (preview route) turns this into a message
    console.error(`[granola-intake] ${intakeId} failed: ${safeErrorText(err)}`);
    if (intakeId) {
      await finish(intakeId, { status: "FAILED", error: safeErrorText(err), finishedAt: new Date() }).catch(() => {});
    }
    return empty("failed", safeErrorText(err));
  }
}

/** Q101 = B. Best-effort: a failure here never fails the intake. */
async function notifyRecorder(note: GranolaNote, digestTitle: string, needsReview: number, digestId: string) {
  try {
    const email = note.owner?.email;
    if (!email) return;
    const admin = await db.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, roles: { has: "ADMIN" } },
      select: { email: true },
    });
    if (!admin) return;
    await sendDigestDraftReadyEmail({
      toEmail: admin.email,
      meetingTitle: note.title?.trim() || digestTitle,
      needsReviewCount: needsReview,
      digestUrl: `${BASE_URL}/admin/digest/${digestId}`,
    });
  } catch {
    console.error("[granola-intake] draft-ready email failed");
  }
}

export interface SweepSummary {
  enqueued: number;
  processed: number;
  skipped: number;
  failed: number;
  found: number;
}

const MAX_PER_RUN = 3;
const MAX_TRIES_PER_RUN = 10;
const START_BUDGET_MS = 40_000;

/** Shared by the daily cron and the manual "Check Granola now" button. */
export async function runGranolaSweep(trigger: "SWEEP" | "MANUAL"): Promise<SweepSummary> {
  const summary: SweepSummary = { enqueued: 0, processed: 0, skipped: 0, failed: 0, found: 0 };
  const started = Date.now();

  const notes = await listFolderNotes({ updatedAfter: new Date(Date.now() - 72 * 3600_000), maxPages: 3 });
  summary.found = notes.length;
  for (const n of notes) {
    if (await enqueueGranolaNote(n.id, trigger)) summary.enqueued++;
  }

  const stale = new Date(Date.now() - 15 * 60_000);
  const rows = await db.granolaIntake.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        { status: "FAILED", attempts: { lt: 3 } },
        { status: "PROCESSING", lockedAt: { lt: stale } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: MAX_TRIES_PER_RUN,
    select: { id: true },
  });

  let tries = 0;
  for (const r of rows) {
    if (summary.processed + summary.failed >= MAX_PER_RUN) break;
    if (tries >= MAX_TRIES_PER_RUN || Date.now() - started > START_BUDGET_MS) break;
    tries++;
    const res = await processGranolaIntake(r.id);
    if (res.outcome === "done") summary.processed++;
    else if (res.outcome === "failed") summary.failed++;
    else if (res.outcome === "skipped") summary.skipped++;
  }
  return summary;
}

export { granolaIntakeEnabled };
