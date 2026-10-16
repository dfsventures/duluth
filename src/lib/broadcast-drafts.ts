// Part 39 (WS119) — broadcast DRAFT writes shared by /api/admin/broadcasts/** and the Marge tools.
// Only create and edit-a-draft live here: publish, test-send, retry, duplicate and delete are
// separate routes and are deliberately not shared (L4). Messages and status codes are the
// routes' own. F121 and F122 are fixed here.
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/audit";
import type { Actor, Via, ActionResult } from "@/lib/board-actions";

const viaMeta = (v?: Via) => (v ? { via: v.via, margeActionId: v.margeActionId } : {});
const fail = (status: 400 | 404 | 409, error: string): { ok: false; status: 400 | 404 | 409; error: string } => ({
  ok: false,
  status,
  error,
});

const PUBLISHED_MSG = "Published broadcasts can't be edited. Duplicate it as a draft instead.";
const COMPANIES_MISSING_MSG = "One or more selected companies could not be found.";

class PublishedDuringEdit extends Error {}

type Broadcast = NonNullable<Awaited<ReturnType<typeof db.companyBroadcast.findUnique>>>;

/** F122: the PATCH route's check, now shared by create. Returns an error message or null. */
async function checkCompanyIds(ids: unknown): Promise<string | null> {
  if (!Array.isArray(ids)) return "portfolioCompanyIds must be an array.";
  if (!ids.every((x) => typeof x === "string")) return COMPANIES_MISSING_MSG;
  const found = await db.portfolioCompany.findMany({
    where: { id: { in: ids as string[] } },
    select: { id: true },
  });
  if (found.length !== new Set(ids as string[]).size) return COMPANIES_MISSING_MSG;
  return null;
}

export async function createBroadcastDraft(
  actor: Actor,
  input: { subject?: unknown; body?: unknown; portfolioCompanyIds?: unknown },
  via?: Via
): Promise<ActionResult<Broadcast>> {
  const subject = typeof input.subject === "string" ? input.subject.trim() : undefined;
  if (!subject || subject.length > 200) {
    return fail(400, "Subject is required and must be 200 characters or fewer.");
  }
  let portfolioCompanyIds: string[] = [];
  if (input.portfolioCompanyIds !== undefined && input.portfolioCompanyIds !== null) {
    const bad = await checkCompanyIds(input.portfolioCompanyIds);
    if (bad) return fail(400, bad);
    portfolioCompanyIds = input.portfolioCompanyIds as string[];
  }
  const body = typeof input.body === "string" ? input.body : "";

  const broadcast = await db.$transaction(async (tx) => {
    const created = await tx.companyBroadcast.create({
      data: { subject, body, status: "DRAFT", createdById: actor.id },
    });
    if (portfolioCompanyIds.length > 0) {
      await tx.companyBroadcastTarget.createMany({
        data: portfolioCompanyIds.map((portfolioCompanyId) => ({ broadcastId: created.id, portfolioCompanyId })),
      });
    }
    return created;
  });

  await logAdminAction(actor, "BROADCAST_CREATED", {
    targetType: "CompanyBroadcast",
    targetId: broadcast.id,
    metadata: { subject, companyCount: portfolioCompanyIds.length, ...viaMeta(via) },
  });
  return { ok: true, value: broadcast };
}

export async function updateBroadcastDraft(
  actor: Actor,
  id: string,
  input: { subject?: unknown; body?: unknown; portfolioCompanyIds?: unknown },
  via?: Via
): Promise<ActionResult<Broadcast | null>> {
  const existing = await db.companyBroadcast.findUnique({ where: { id } });
  if (!existing) return fail(404, "Broadcast not found");

  // JC-BC-D: no unpublish route exists — a published broadcast can't be
  // edited, only duplicated as a new draft.
  if (existing.status === "PUBLISHED") return fail(400, PUBLISHED_MSG);

  const data: { subject?: string; body?: string } = {};

  if (input.subject !== undefined) {
    const subject = typeof input.subject === "string" ? input.subject.trim() : undefined;
    if (!subject || subject.length > 200) {
      return fail(400, "Subject is required and must be 200 characters or fewer.");
    }
    data.subject = subject;
  }
  // F123: the editor path stores the body as given; the Marge tools only pass converted plain text.
  if (input.body !== undefined) data.body = input.body as string;

  let portfolioCompanyIds: string[] | undefined;
  if (input.portfolioCompanyIds !== undefined) {
    const bad = await checkCompanyIds(input.portfolioCompanyIds);
    if (bad) return fail(400, bad);
    portfolioCompanyIds = input.portfolioCompanyIds as string[];
  }

  try {
    const broadcast = await db.$transaction(async (tx) => {
      if (Object.keys(data).length > 0 || portfolioCompanyIds !== undefined) {
        // F121: the write itself is conditional on DRAFT, so a publish landing after the
        // pre-check above loses cleanly instead of editing a sent broadcast.
        const n = await tx.companyBroadcast.updateMany({
          where: { id, status: "DRAFT" },
          data: { ...data, updatedAt: new Date() },
        });
        if (n.count === 0) throw new PublishedDuringEdit();
      }
      if (portfolioCompanyIds !== undefined) {
        await tx.companyBroadcastTarget.deleteMany({ where: { broadcastId: id } });
        if (portfolioCompanyIds.length > 0) {
          await tx.companyBroadcastTarget.createMany({
            data: portfolioCompanyIds.map((portfolioCompanyId) => ({ broadcastId: id, portfolioCompanyId })),
          });
        }
      }
      return tx.companyBroadcast.findUnique({ where: { id } });
    });

    await logAdminAction(actor, "BROADCAST_UPDATED", {
      targetType: "CompanyBroadcast",
      targetId: id,
      ...(via ? { metadata: viaMeta(via) } : {}),
    });
    return { ok: true, value: broadcast };
  } catch (err) {
    if (err instanceof PublishedDuringEdit) return fail(400, PUBLISHED_MSG);
    throw err;
  }
}
