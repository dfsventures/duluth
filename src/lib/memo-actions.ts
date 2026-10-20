// Part 40 (WS126). Every memo write, shared by /api/admin/memos/** and (WS129) the Marge tools.
// Order inside every function: the memo must be visible (memoVisibleWhere, else 404), then the
// right to change it (canEditMemo / canManageMemo, else 403), then limits, then the write, then
// the audit. Hand-written allowlists everywhere (F95): a request body is never spread into Prisma.
// Audit metadata carries ids, keys and counts; NEVER a title, text, citation or company name.
import crypto from "crypto";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/audit";
import type { Actor, Via } from "@/lib/board-actions";
import { currentTemplate } from "@/lib/memo-template";
import { normalizeCompanyName } from "@/lib/portco-match";
import { mollyOrigin } from "@/lib/marge-tools/types";
import type { NotionMemoDraft } from "@/lib/notion-memo-import";
import {
  MEMO_ERRORS,
  MEMO_DECISIONS,
  MEMO_LIMITS,
  MEMO_SOURCES,
  MEMO_STATUSES,
  MEMO_VISIBILITIES,
  canEditMemo,
  canManageMemo,
  isValidKey,
  memoCompanyFilter,
  memoVisibleWhere,
  parseDateOnly,
  readCitations,
  slugifyKey,
  validateCitations,
  validateIdempotencyKey,
  validateIntroCalls,
  validateMemoMeta,
  validateSections,
  validateTags,
  validateTitle,
  validateWebUrl,
  type MemoCitation,
  type MemoSectionInput,
  type MemoStatus,
  type MemoTemplateSection,
  type MemoVisibility,
} from "@/lib/memos";

export type MemoResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 403 | 404 | 409; error: string };
const fail = (status: 400 | 403 | 404 | 409, error: string): { ok: false; status: 400 | 403 | 404 | 409; error: string } => ({
  ok: false,
  status,
  error,
});
const viaMeta = (v?: Via) => (v ? { via: v.via, margeActionId: v.margeActionId } : {});
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export const MEMO_MESSAGES = {
  notFound: "Memo not found",
  sectionNotFound: "Section not found",
  ownerOnly: "Only the memo's owner can do that.",
  staleSection: "This section changed since you loaded it. Reload and try again.",
  staleMemo: "This memo changed since you loaded it. Reload and try again.",
  expectedVersion: "expectedVersion is required.",
  nothing: "Nothing to change.",
  noCompany: "No company with that id in Molly. Use companyNamePending for a company that isn't in Molly yet.",
} as const;

class Conflict extends Error {}

const isVersion = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;

/** The memo as `actor` may see it, or null (not found, archived, or someone else's private memo). */
async function loadVisible<S extends object>(actorId: string, id: string, select: S) {
  return db.memo.findFirst({ where: { id, ...memoVisibleWhere(actorId) }, select: select as never }) as unknown as Promise<
    | ({ id: string; ownerId: string; visibility: string } & Record<string, any>)
    | null
  >;
}
const HEAD = { id: true, ownerId: true, visibility: true } as const;

export async function loadCompany(id: string) {
  return db.company.findFirst({ where: { id, ...memoCompanyFilter }, select: { id: true, name: true, aliases: true } });
}

// ── create ────────────────────────────────────────────────────────────────────────────────

export interface CreatedMemo {
  id: string;
  version: number;
  duplicate: boolean;
}

/**
 * Creates a private DRAFT owned by `actor`. Without `body.sections` the sections come from the
 * current template (empty text). With them (Marge) each is validated, keys unique, in the given
 * order. `idempotencyKey` (required for Marge) makes a repeat return the existing memo (JC-MM-H).
 */
export async function createMemo(actor: Actor, body: Record<string, unknown>, via?: Via): Promise<MemoResult<CreatedMemo>> {
  const meta = validateMemoMeta(body);
  if (!meta.ok) return fail(400, meta.error);

  let createKey: string | null = null;
  if (body.idempotencyKey !== undefined || via) {
    const k = validateIdempotencyKey(body.idempotencyKey);
    if (!k.ok) return fail(400, k.error);
    createKey = crypto.createHash("sha256").update(`${actor.id}:${k.value}`).digest("hex");
    const existing = await db.memo.findUnique({ where: { createKey }, select: { id: true, version: true, ownerId: true } });
    if (existing && existing.ownerId === actor.id) return { ok: true, value: { id: existing.id, version: existing.version, duplicate: true } };
  }

  const template = await currentTemplate();
  const shareDefault = new Map(template.sections.map((s) => [s.key, s.shareByDefault]));
  let sections: MemoSectionInput[];
  if (body.sections !== undefined) {
    const v = validateSections(body.sections);
    if (!v.ok) return fail(400, v.error);
    sections = v.value;
  } else {
    sections = template.sections.map((s) => ({ key: s.key, title: s.title, markdown: "", citations: [] }));
  }

  if (meta.value.companyId && !(await loadCompany(meta.value.companyId))) return fail(400, MEMO_MESSAGES.noCompany);

  const m = meta.value;
  const data = {
    title: m.title,
    companyId: m.companyId ?? null,
    companyNamePending: m.companyNamePending ?? null,
    ownerId: actor.id,
    draftedByMarge: !!via,
    source: m.source,
    tags: m.tags,
    introDate: m.introDate,
    websiteUrl: m.websiteUrl,
    introCalls: m.introCalls as object[],
    templateVersion: template.version,
    createKey,
    sections: {
      create: sections.map((s, i) => ({
        key: s.key,
        title: s.title,
        markdown: s.markdown,
        citations: s.citations as object[],
        position: i,
        includeInShare: shareDefault.get(s.key) ?? true,
        updatedById: actor.id,
        updatedVia: via ? "marge" : null,
        revisions: {
          create: [
            {
              version: 1,
              title: s.title,
              markdown: s.markdown,
              citations: s.citations as object[],
              includeInShare: shareDefault.get(s.key) ?? true,
              editedById: actor.id,
              via: via ? "marge" : null,
            },
          ],
        },
      })),
    },
  };

  let memo: { id: string; version: number };
  try {
    memo = await db.memo.create({ data, select: { id: true, version: true } });
  } catch (err) {
    // Two identical creates raced past the check above: the unique createKey decides, the loser returns the winner.
    if (createKey && (err as { code?: string })?.code === "P2002") {
      const winner = await db.memo.findUnique({ where: { createKey }, select: { id: true, version: true, ownerId: true } });
      if (winner && winner.ownerId === actor.id) return { ok: true, value: { id: winner.id, version: winner.version, duplicate: true } };
    }
    throw err;
  }

  await logAdminAction(actor, "MEMO_CREATED", {
    targetType: "Memo",
    targetId: memo.id,
    metadata: { memoId: memo.id, sectionCount: sections.length, draftedByMarge: !!via, ...viaMeta(via) },
  });
  return { ok: true, value: { id: memo.id, version: memo.version, duplicate: false } };
}

// ── import (Part 41) ──────────────────────────────────────────────────────────────────────

export interface ImportedMemo {
  id: string | null;
  duplicate: boolean;
  linkedCompany: boolean;
}

/**
 * Part 41. One Notion page -> one TEAM memo owned by `actor`, written by the one-off importer
 * (scripts/import-notion-memos.ts). A page already imported (same notionId, archived or not) is skipped.
 * Same rules as the other writes: validate with the shared validators, allowlist, write, audit ids only.
 * `createMemo` cannot set status, visibility, decision, an external id or dates, hence this function.
 */
export async function importMemo(actor: Actor, draft: NotionMemoDraft, opts: { status: MemoStatus }): Promise<MemoResult<ImportedMemo>> {
  const meta = validateMemoMeta({
    title: draft.title,
    source: draft.source,
    tags: draft.tags,
    introDate: draft.introDate,
    websiteUrl: draft.websiteUrl,
    introCalls: draft.introCalls,
  });
  if (!meta.ok) return fail(400, meta.error);
  const sections = validateSections(draft.sections);
  if (!sections.ok) return fail(400, sections.error);
  if (draft.decision !== null && !(MEMO_DECISIONS as readonly unknown[]).includes(draft.decision)) return fail(400, MEMO_ERRORS.badDecision);
  if (!(MEMO_STATUSES as readonly unknown[]).includes(opts.status)) return fail(400, "Invalid status");
  if (!/^[0-9a-f]{32}$/.test(draft.notionId)) return fail(400, "A Notion id is required.");

  const existing = await db.memo.findUnique({ where: { notionId: draft.notionId }, select: { id: true } });
  if (existing) return { ok: true, value: { id: existing.id, duplicate: true, linkedCompany: false } };

  const company = await suggestCompany(draft.title);
  const m = meta.value;
  const share = draft.sections.map((s) => s.includeInShare !== false);
  const data = {
    title: m.title,
    companyId: company?.id ?? null,
    companyNamePending: company ? null : m.title,
    ownerId: actor.id,
    status: opts.status,
    visibility: "TEAM",
    decision: draft.decision,
    notionId: draft.notionId,
    draftedByMarge: false,
    source: m.source,
    tags: m.tags,
    introDate: m.introDate,
    websiteUrl: m.websiteUrl,
    introCalls: m.introCalls as object[],
    templateVersion: null,
    ...(draft.lastEdited ? { createdAt: draft.lastEdited, updatedAt: draft.lastEdited } : {}),
    sections: {
      create: sections.value.map((s, i) => ({
        key: s.key,
        title: s.title,
        markdown: s.markdown,
        citations: s.citations as object[],
        position: i,
        includeInShare: share[i],
        updatedById: actor.id,
        updatedVia: "notion",
        revisions: {
          create: [
            {
              version: 1,
              title: s.title,
              markdown: s.markdown,
              citations: s.citations as object[],
              includeInShare: share[i],
              editedById: actor.id,
              via: "notion",
            },
          ],
        },
      })),
    },
  };

  let memo: { id: string };
  try {
    memo = await db.memo.create({ data, select: { id: true } });
  } catch (err) {
    // A parallel run imported the same page between the check and the write: the unique notionId decides.
    if ((err as { code?: string })?.code === "P2002") {
      const winner = await db.memo.findUnique({ where: { notionId: draft.notionId }, select: { id: true } });
      if (winner) return { ok: true, value: { id: winner.id, duplicate: true, linkedCompany: false } };
    }
    throw err;
  }

  await logAdminAction(actor, "MEMO_IMPORTED", {
    targetType: "Memo",
    targetId: memo.id,
    metadata: { memoId: memo.id, sectionCount: sections.value.length, linkedCompany: !!company, source: "notion" },
  });
  return { ok: true, value: { id: memo.id, duplicate: false, linkedCompany: !!company } };
}

// ── metadata, status, visibility, archive ─────────────────────────────────────────────────

const META_KEYS = ["title", "source", "decision", "tags", "introDate", "websiteUrl", "introCalls", "companyNamePending"] as const;
export const isMetaBody = (b: Record<string, unknown>) => META_KEYS.some((k) => k in b);

export async function updateMemoMeta(actor: Actor, id: string, body: Record<string, unknown>): Promise<MemoResult<{ id: string; version: number }>> {
  const memo = await loadVisible(actor.id, id, { ...HEAD, companyId: true, source: true, version: true });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  if (!canEditMemo(memo as never, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);
  if (!isVersion(body.version)) return fail(400, "version is required.");

  const data: Record<string, unknown> = {};
  if ("title" in body) {
    const t = validateTitle(body.title);
    if (!t.ok) return fail(400, t.error);
    data.title = t.value;
  }
  if ("source" in body) {
    if (body.source === null || body.source === "") data.source = null;
    // F133: a value no longer in the list is accepted while it is the memo's stored value (unchanged).
    else if ((MEMO_SOURCES as readonly unknown[]).includes(body.source) || (memo.source != null && body.source === memo.source)) data.source = body.source;
    else return fail(400, MEMO_ERRORS.badSource);
  }
  if ("decision" in body) {
    if (body.decision === null || body.decision === "") data.decision = null;
    else if ((MEMO_DECISIONS as readonly unknown[]).includes(body.decision)) data.decision = body.decision;
    else return fail(400, MEMO_ERRORS.badDecision);
  }
  if ("tags" in body) {
    const t = validateTags(body.tags);
    if (!t.ok) return fail(400, t.error);
    data.tags = t.value;
  }
  if ("introDate" in body) {
    if (body.introDate === null || body.introDate === "") data.introDate = null;
    else {
      const d = parseDateOnly(body.introDate);
      if (!d) return fail(400, MEMO_ERRORS.badDate);
      data.introDate = d;
    }
  }
  if ("websiteUrl" in body) {
    if (body.websiteUrl === null || body.websiteUrl === "") data.websiteUrl = null;
    else {
      const u = validateWebUrl(body.websiteUrl);
      if (!u.ok) return fail(400, u.error);
      data.websiteUrl = u.value;
    }
  }
  if ("introCalls" in body) {
    const c = validateIntroCalls(body.introCalls);
    if (!c.ok) return fail(400, c.error);
    data.introCalls = c.value as object[];
  }
  if ("companyNamePending" in body) {
    if (memo.companyId) return fail(400, "This memo is linked to a company already.");
    const n = typeof body.companyNamePending === "string" ? body.companyNamePending.trim() : "";
    if (n.length > MEMO_LIMITS.title) return fail(400, MEMO_ERRORS.title);
    data.companyNamePending = n || null;
  }
  const fields = Object.keys(data);
  if (!fields.length) return fail(400, MEMO_MESSAGES.nothing);

  const r = await db.memo.updateMany({ where: { id, version: body.version }, data: { ...data, version: { increment: 1 } } });
  if (r.count === 0) return fail(409, MEMO_MESSAGES.staleMemo);
  await logAdminAction(actor, "MEMO_UPDATED", {
    targetType: "Memo",
    targetId: id,
    metadata: { memoId: id, version: body.version + 1, fields },
  });
  return { ok: true, value: { id, version: body.version + 1 } };
}

export async function setMemoStatus(actor: Actor, id: string, status: unknown): Promise<MemoResult<{ id: string; status: MemoStatus; version: number }>> {
  const memo = await loadVisible(actor.id, id, { ...HEAD, status: true, version: true });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  if (!canEditMemo(memo as never, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);
  if (!(MEMO_STATUSES as readonly unknown[]).includes(status)) return fail(400, "Invalid status");
  const to = status as MemoStatus;
  if (memo.status === to) return { ok: true, value: { id, status: to, version: memo.version } };
  await db.memo.update({ where: { id }, data: { status: to, version: { increment: 1 } } });
  await logAdminAction(actor, "MEMO_STATUS_CHANGED", {
    targetType: "Memo",
    targetId: id,
    metadata: { memoId: id, from: memo.status, to },
  });
  return { ok: true, value: { id, status: to, version: memo.version + 1 } };
}

export async function setMemoVisibility(actor: Actor, id: string, visibility: unknown): Promise<MemoResult<{ id: string; visibility: MemoVisibility; version: number }>> {
  const memo = await loadVisible(actor.id, id, { ...HEAD, version: true });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  if (!canManageMemo(memo, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);
  if (!(MEMO_VISIBILITIES as readonly unknown[]).includes(visibility)) return fail(400, "Invalid visibility");
  const to = visibility as MemoVisibility;
  if (memo.visibility === to) return { ok: true, value: { id, visibility: to, version: memo.version } };
  await db.memo.update({ where: { id }, data: { visibility: to, version: { increment: 1 } } });
  await logAdminAction(actor, "MEMO_VISIBILITY_CHANGED", {
    targetType: "Memo",
    targetId: id,
    metadata: { memoId: id, to },
  });
  return { ok: true, value: { id, visibility: to, version: memo.version + 1 } };
}

export async function archiveMemo(actor: Actor, id: string): Promise<MemoResult<{ id: string }>> {
  const memo = await loadVisible(actor.id, id, { ...HEAD });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  if (!canManageMemo(memo, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);
  // Archived memos stop answering their share links too (the public page checks archivedAt).
  await db.memo.update({ where: { id }, data: { archivedAt: new Date() } });
  await logAdminAction(actor, "MEMO_ARCHIVED", { targetType: "Memo", targetId: id, metadata: { memoId: id } });
  return { ok: true, value: { id } };
}

// ── sections ──────────────────────────────────────────────────────────────────────────────

interface SectionWrite {
  title: string;
  markdown: string;
  citations: MemoCitation[];
  includeInShare: boolean;
}

/** The one conditional write: bumps `version` only if it still equals `expected`, then the revision, in one transaction. */
async function writeSection(
  actor: Actor,
  memoId: string,
  section: { id: string; key: string },
  expected: number,
  next: SectionWrite,
  via: Via | undefined,
  restoredFrom: number | null
): Promise<MemoResult<{ version: number }>> {
  try {
    await db.$transaction(async (tx) => {
      const r = await tx.memoSection.updateMany({
        where: { id: section.id, version: expected },
        data: {
          title: next.title,
          markdown: next.markdown,
          citations: next.citations as object[],
          includeInShare: next.includeInShare,
          updatedById: actor.id,
          updatedVia: via ? "marge" : null,
          version: { increment: 1 },
        },
      });
      if (r.count === 0) throw new Conflict();
      await tx.memoSectionRevision.create({
        data: {
          sectionId: section.id,
          version: expected + 1,
          title: next.title,
          markdown: next.markdown,
          citations: next.citations as object[],
          includeInShare: next.includeInShare,
          editedById: actor.id,
          via: via ? "marge" : null,
          restoredFrom,
        },
      });
      await tx.memo.update({ where: { id: memoId }, data: { updatedAt: new Date() } });
    });
  } catch (err) {
    if (err instanceof Conflict) return fail(409, MEMO_MESSAGES.staleSection);
    throw err;
  }
  await logAdminAction(actor, restoredFrom !== null ? "MEMO_SECTION_RESTORED" : "MEMO_SECTION_UPDATED", {
    targetType: "Memo",
    targetId: memoId,
    metadata:
      restoredFrom !== null
        ? { memoId, sectionKey: section.key, fromVersion: restoredFrom, version: expected + 1 }
        : { memoId, sectionKey: section.key, version: expected + 1, ...viaMeta(via) },
  });
  return { ok: true, value: { version: expected + 1 } };
}

interface SectionRow {
  id: string;
  key: string;
  title: string;
  markdown: string;
  citations: unknown;
  includeInShare: boolean;
  version: number;
}
const SECTION_SELECT = { id: true, key: true, title: true, markdown: true, citations: true, includeInShare: true, version: true } as const;

/** Total characters of every section except `exceptKey`. */
const otherChars = (sections: { key: string; markdown: string }[], exceptKey: string) =>
  sections.reduce((n, s) => (s.key === exceptKey ? n : n + s.markdown.length), 0);

export async function saveSection(
  actor: Actor,
  memoId: string,
  key: string,
  body: Record<string, unknown>,
  via?: Via
): Promise<MemoResult<{ key: string; version: number }>> {
  const memo = await loadVisible(actor.id, memoId, { ...HEAD, sections: { select: SECTION_SELECT } });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  if (!canEditMemo(memo as never, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);
  const sections = memo.sections as SectionRow[];
  const section = sections.find((s) => s.key === key);
  if (!section) return fail(404, MEMO_MESSAGES.sectionNotFound);
  if (!isVersion(body.expectedVersion)) return fail(400, MEMO_MESSAGES.expectedVersion);
  if (section.version !== body.expectedVersion) return fail(409, MEMO_MESSAGES.staleSection);

  const next: SectionWrite = {
    title: section.title,
    markdown: section.markdown,
    citations: readCitations(section.citations),
    includeInShare: section.includeInShare,
  };
  let changed = false;
  if ("title" in body) {
    const t = typeof body.title === "string" ? body.title.trim() : "";
    if (!t || t.length > MEMO_LIMITS.sectionTitle) return fail(400, MEMO_ERRORS.sectionTitle);
    changed ||= t !== next.title;
    next.title = t;
  }
  if ("markdown" in body) {
    if (typeof body.markdown !== "string") return fail(400, MEMO_ERRORS.badMarkdown);
    if (body.markdown.length > MEMO_LIMITS.sectionChars) return fail(400, MEMO_ERRORS.sectionTooLong);
    if (otherChars(sections, key) + body.markdown.length > MEMO_LIMITS.memoChars) return fail(400, MEMO_ERRORS.memoTooLong);
    changed ||= body.markdown !== next.markdown;
    next.markdown = body.markdown;
  }
  if ("citations" in body) {
    const c = validateCitations(body.citations);
    if (!c.ok) return fail(400, c.error);
    changed ||= JSON.stringify(c.value) !== JSON.stringify(next.citations);
    next.citations = c.value;
  }
  if ("includeInShare" in body) {
    if (typeof body.includeInShare !== "boolean") return fail(400, "includeInShare must be true or false.");
    if (body.includeInShare !== next.includeInShare) {
      // What outside readers see is a sharing decision: it stays with the owner (Q117-A).
      if (!canManageMemo(memo, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);
      changed = true;
      next.includeInShare = body.includeInShare;
    }
  }
  if (!changed) return fail(400, MEMO_MESSAGES.nothing);

  const r = await writeSection(actor, memoId, section, body.expectedVersion, next, via, null);
  return r.ok ? { ok: true, value: { key, version: r.value.version } } : r;
}

export async function listRevisions(actor: Actor, memoId: string, key: string): Promise<MemoResult<unknown[]>> {
  const memo = await loadVisible(actor.id, memoId, { ...HEAD, sections: { where: { key }, select: { id: true } } });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  const section = (memo.sections as { id: string }[])[0];
  if (!section) return fail(404, MEMO_MESSAGES.sectionNotFound);
  const rows = await db.memoSectionRevision.findMany({
    where: { sectionId: section.id },
    orderBy: { version: "desc" },
    take: 100,
    select: {
      version: true,
      title: true,
      markdown: true,
      citations: true,
      includeInShare: true,
      via: true,
      restoredFrom: true,
      createdAt: true,
      editedBy: { select: { id: true, name: true, email: true } },
    },
  });
  return { ok: true, value: rows };
}

/** Restore = a new save (version n+1) of an old copy. Title, text and citations come back; the share toggle stays as it is now. */
export async function restoreSection(
  actor: Actor,
  memoId: string,
  key: string,
  fromVersion: unknown,
  expectedVersion: unknown
): Promise<MemoResult<{ key: string; version: number }>> {
  const memo = await loadVisible(actor.id, memoId, { ...HEAD, sections: { select: SECTION_SELECT } });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  if (!canEditMemo(memo as never, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);
  const sections = memo.sections as SectionRow[];
  const section = sections.find((s) => s.key === key);
  if (!section) return fail(404, MEMO_MESSAGES.sectionNotFound);
  if (!isVersion(expectedVersion)) return fail(400, MEMO_MESSAGES.expectedVersion);
  if (!isVersion(fromVersion)) return fail(400, "fromVersion is required.");
  if (section.version !== expectedVersion) return fail(409, MEMO_MESSAGES.staleSection);
  const rev = await db.memoSectionRevision.findUnique({
    where: { sectionId_version: { sectionId: section.id, version: fromVersion } },
    select: { title: true, markdown: true, citations: true },
  });
  if (!rev) return fail(404, "That version doesn't exist.");
  if (otherChars(sections, key) + rev.markdown.length > MEMO_LIMITS.memoChars) return fail(400, MEMO_ERRORS.memoTooLong);
  const r = await writeSection(
    actor,
    memoId,
    section,
    expectedVersion,
    { title: rev.title, markdown: rev.markdown, citations: readCitations(rev.citations), includeInShare: section.includeInShare },
    undefined,
    fromVersion
  );
  return r.ok ? { ok: true, value: { key, version: r.value.version } } : r;
}

export async function addSection(actor: Actor, memoId: string, body: Record<string, unknown>): Promise<MemoResult<{ key: string; version: number }>> {
  const memo = await loadVisible(actor.id, memoId, { ...HEAD, sections: { select: { key: true, position: true } } });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  if (!canEditMemo(memo as never, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);
  const sections = memo.sections as { key: string; position: number }[];
  if (sections.length >= MEMO_LIMITS.sections) return fail(400, MEMO_ERRORS.tooManySections);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > MEMO_LIMITS.sectionTitle) return fail(400, MEMO_ERRORS.sectionTitle);
  let key: string;
  if (body.key !== undefined) {
    if (!isValidKey(body.key)) return fail(400, MEMO_ERRORS.badKey);
    if (sections.some((s) => s.key === body.key)) return fail(400, MEMO_ERRORS.duplicateKeys);
    key = body.key;
  } else {
    const base = slugifyKey(title) || "section";
    key = base;
    for (let n = 2; sections.some((s) => s.key === key); n++) {
      const suffix = `-${n}`;
      key = `${base.slice(0, MEMO_LIMITS.keyLength - suffix.length)}${suffix}`;
    }
  }
  const position = sections.reduce((n, s) => Math.max(n, s.position), -1) + 1;
  await db.memoSection.create({
    data: {
      memoId,
      key,
      title,
      markdown: "",
      citations: [],
      position,
      includeInShare: true,
      updatedById: actor.id,
      revisions: { create: [{ version: 1, title, markdown: "", citations: [], includeInShare: true, editedById: actor.id }] },
    },
  });
  await db.memo.update({ where: { id: memoId }, data: { updatedAt: new Date() } });
  await logAdminAction(actor, "MEMO_UPDATED", { targetType: "Memo", targetId: memoId, metadata: { memoId, fields: ["sections"] } });
  return { ok: true, value: { key, version: 1 } };
}

/** Removing a section deletes its history, so it stays with the owner. */
export async function removeSection(actor: Actor, memoId: string, key: string): Promise<MemoResult<{ key: string }>> {
  const memo = await loadVisible(actor.id, memoId, { ...HEAD, sections: { where: { key }, select: { id: true } } });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  if (!canManageMemo(memo, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);
  const section = (memo.sections as { id: string }[])[0];
  if (!section) return fail(404, MEMO_MESSAGES.sectionNotFound);
  await db.memoSection.delete({ where: { id: section.id } });
  await db.memo.update({ where: { id: memoId }, data: { updatedAt: new Date() } });
  await logAdminAction(actor, "MEMO_UPDATED", { targetType: "Memo", targetId: memoId, metadata: { memoId, fields: ["sections"] } });
  return { ok: true, value: { key } };
}

export async function reorderSections(actor: Actor, memoId: string, keys: unknown): Promise<MemoResult<{ count: number }>> {
  const memo = await loadVisible(actor.id, memoId, { ...HEAD, sections: { select: { id: true, key: true } } });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  if (!canEditMemo(memo as never, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);
  const sections = memo.sections as { id: string; key: string }[];
  if (
    !Array.isArray(keys) ||
    keys.length !== sections.length ||
    new Set(keys).size !== keys.length ||
    !keys.every((k) => typeof k === "string" && sections.some((s) => s.key === k))
  ) {
    return fail(400, "Send every section key exactly once.");
  }
  await db.$transaction(async (tx) => {
    for (let i = 0; i < keys.length; i++) {
      await tx.memoSection.update({ where: { id: sections.find((s) => s.key === keys[i])!.id }, data: { position: i } });
    }
    await tx.memo.update({ where: { id: memoId }, data: { updatedAt: new Date() } });
  });
  await logAdminAction(actor, "MEMO_UPDATED", { targetType: "Memo", targetId: memoId, metadata: { memoId, fields: ["sections"] } });
  return { ok: true, value: { count: keys.length } };
}

// ── company link ──────────────────────────────────────────────────────────────────────────

/** Owner only (Q117). Sets the company, clears the pending name, and expects the memo's own version. */
export async function linkCompany(
  actor: Actor,
  memoId: string,
  body: Record<string, unknown>,
  via?: Via
): Promise<MemoResult<{ id: string; companyId: string; version: number }>> {
  const memo = await loadVisible(actor.id, memoId, { ...HEAD, version: true, companyId: true, company: { select: { name: true } } });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  if (!canManageMemo(memo, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);
  if (!isVersion(body.expectedVersion)) return fail(400, MEMO_MESSAGES.expectedVersion);
  if (memo.companyId) return fail(400, `This memo is already linked to ${(memo.company as { name: string } | null)?.name ?? "a company"}.`);
  if (typeof body.companyId !== "string" || !body.companyId) return fail(400, MEMO_MESSAGES.noCompany);
  if (memo.version !== body.expectedVersion) return fail(409, MEMO_MESSAGES.staleMemo);
  const company = await loadCompany(body.companyId);
  if (!company) return fail(400, MEMO_MESSAGES.noCompany);
  const r = await db.memo.updateMany({
    where: { id: memoId, version: body.expectedVersion, companyId: null },
    data: { companyId: company.id, companyNamePending: null, version: { increment: 1 } },
  });
  if (r.count === 0) return fail(409, MEMO_MESSAGES.staleMemo);
  await logAdminAction(actor, "MEMO_COMPANY_LINKED", {
    targetType: "Memo",
    targetId: memoId,
    metadata: { memoId, companyId: company.id, ...viaMeta(via) },
  });
  return { ok: true, value: { id: memoId, companyId: company.id, version: body.expectedVersion + 1 } };
}

/** "Acme is now in Molly. Link it?": at most one strong match for a pending name, else null. */
export async function suggestCompany(pendingName: string | null | undefined): Promise<{ id: string; name: string } | null> {
  const wanted = normalizeCompanyName(pendingName ?? "");
  if (!wanted) return null;
  const all = await db.company.findMany({ where: memoCompanyFilter, select: { id: true, name: true, aliases: true } });
  const hits = all.filter((c) => normalizeCompanyName(c.name) === wanted || c.aliases.some((a) => normalizeCompanyName(a) === wanted));
  return hits.length === 1 ? { id: hits[0].id, name: hits[0].name } : null;
}

// ── template ──────────────────────────────────────────────────────────────────────────────

export async function saveTemplate(actor: Actor, raw: unknown): Promise<MemoResult<{ version: number }>> {
  if (!Array.isArray(raw) || raw.length === 0) return fail(400, MEMO_ERRORS.noSections);
  if (raw.length > MEMO_LIMITS.sections) return fail(400, MEMO_ERRORS.tooManySections);
  const out: MemoTemplateSection[] = [];
  for (const s of raw) {
    if (!isObj(s)) return fail(400, MEMO_ERRORS.badKey);
    const title = typeof s.title === "string" ? s.title.trim() : "";
    if (!title || title.length > MEMO_LIMITS.sectionTitle) return fail(400, MEMO_ERRORS.sectionTitle);
    const key = typeof s.key === "string" && s.key ? s.key : slugifyKey(title);
    if (!isValidKey(key)) return fail(400, MEMO_ERRORS.badKey);
    if (out.some((x) => x.key === key)) return fail(400, MEMO_ERRORS.duplicateKeys);
    const guidance = typeof s.guidance === "string" ? s.guidance : "";
    if (guidance.length > 2000) return fail(400, "Guidance is limited to 2,000 characters.");
    out.push({ key, title, guidance, required: s.required === true, shareByDefault: s.shareByDefault !== false });
  }
  const current = await currentTemplate();
  const version = current.version + 1;
  try {
    await db.memoTemplate.create({ data: { version, sections: out as object[], createdById: actor.id } });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") return fail(409, "The template changed while you were editing. Reload and try again.");
    throw err;
  }
  await logAdminAction(actor, "MEMO_TEMPLATE_UPDATED", { targetType: "MemoTemplate", metadata: { version } });
  return { ok: true, value: { version } };
}

// ── external share links (WS128) ──────────────────────────────────────────────────────────
// Memo links reuse ShareableLink. The token is shown once and only its SHA-256 fingerprint is stored
// (`token` stays null); revoking is a soft delete (`revokedAt`), so the link answers 410 and keeps
// its view log. Owner only (Q117-A). Links work whatever the memo's team visibility is: the owner
// chose to share it.

export const sha256Hex = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
export const MAX_LINK_LABEL = 100;

export interface CreatedShareLink {
  id: string;
  label: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** Shown to the owner once. Never stored, never listed again. */
  url: string;
}

export async function createShareLink(actor: Actor, memoId: string, body: Record<string, unknown>): Promise<MemoResult<CreatedShareLink>> {
  const memo = await loadVisible(actor.id, memoId, { ...HEAD });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  if (!canManageMemo(memo, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);

  let label: string | null = null;
  if (body.label !== undefined && body.label !== null) {
    if (typeof body.label !== "string") return fail(400, "label must be text.");
    label = body.label.trim() || null;
    if (label && label.length > MAX_LINK_LABEL) return fail(400, "A label is limited to 100 characters.");
  }
  let expiresAt: Date | null = null;
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    const d = typeof body.expiresAt === "string" ? new Date(body.expiresAt) : null;
    if (!d || Number.isNaN(d.getTime())) return fail(400, "expiresAt must be a date.");
    if (d.getTime() <= Date.now()) return fail(400, "expiresAt must be in the future.");
    expiresAt = d;
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const link = await db.shareableLink.create({
    data: { token: null, tokenHash: sha256Hex(token), memoId, label, expiresAt, createdById: actor.id },
    select: { id: true, label: true, expiresAt: true, createdAt: true },
  });
  await logAdminAction(actor, "MEMO_SHARE_LINK_CREATED", {
    targetType: "Memo",
    targetId: memoId,
    metadata: { linkId: link.id, expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null },
  });
  return {
    ok: true,
    value: {
      id: link.id,
      label: link.label,
      expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
      createdAt: link.createdAt.toISOString(),
      url: `${mollyOrigin()}/share/m/${token}`,
    },
  };
}

/** The owner's list. Never returns a token or its hash. Viewer emails are the owner's "who opened it". */
export async function listShareLinks(actor: Actor, memoId: string): Promise<MemoResult<unknown[]>> {
  const memo = await loadVisible(actor.id, memoId, { ...HEAD });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  if (!canManageMemo(memo, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);
  const rows = await db.shareableLink.findMany({
    where: { memoId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      _count: { select: { views: true } },
      views: { orderBy: { viewedAt: "desc" }, take: 20, select: { email: true, viewedAt: true } },
    },
  });
  return {
    ok: true,
    value: rows.map(({ _count, ...r }) => ({ ...r, viewCount: _count.views })),
  };
}

export async function revokeShareLink(actor: Actor, memoId: string, linkId: string): Promise<MemoResult<{ id: string }>> {
  const memo = await loadVisible(actor.id, memoId, { ...HEAD });
  if (!memo) return fail(404, MEMO_MESSAGES.notFound);
  if (!canManageMemo(memo, actor.id)) return fail(403, MEMO_MESSAGES.ownerOnly);
  const link = await db.shareableLink.findFirst({ where: { id: linkId, memoId }, select: { id: true, revokedAt: true } });
  if (!link) return fail(404, "Link not found");
  if (!link.revokedAt) {
    await db.shareableLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
    await logAdminAction(actor, "MEMO_SHARE_LINK_REVOKED", { targetType: "Memo", targetId: memoId, metadata: { linkId: link.id } });
  }
  return { ok: true, value: { id: link.id } };
}
