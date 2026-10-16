// Part 39 (WS122). The write tools: each is plan (validation + name resolution, READS ONLY) then
// apply (the WS119 shared functions, with an explicit allowlisted body and a `via` marker).
// A dry run returns after plan; nothing below that line runs, so a dry run can never write.
// Never created here: people, projects, aliases, companies (JC-MG-J, Q100, Q113).
// Never accepted: HTML (broadcast text is converted from plain text, F123), `archived`, `status`
// on an edit, or any key outside the allowlists.
import { z } from "zod";
import { db } from "@/lib/db";
import {
  MAX_TITLE_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_OWNERS_PER_CARD,
  BOARD_STATUSES,
  BOARD_STATUS_LABELS,
  parseDueDate,
  type BoardStatus,
} from "@/lib/board";
import { MAX_LINKS_PER_CARD, hostOf, parseLinkInput } from "@/lib/board-links";
import {
  createBoardCard,
  updateBoardCard,
  moveBoardCard,
  addBoardCardLink,
  type Via,
} from "@/lib/board-actions";
import { createBroadcastDraft, updateBroadcastDraft } from "@/lib/broadcast-drafts";
import { plainToDigestHtml } from "@/lib/digest-html";
import { htmlToPlainText } from "@/lib/plain-text";
import type { Principal } from "@/lib/marge-auth";
import {
  ToolError,
  type ToolOutput,
  type MargePreview,
  boardUrl,
  broadcastUrl,
} from "@/lib/marge-tools/types";
import { loadBoardLists, resolvePerson, resolveProject, resolveOne } from "@/lib/marge-tools/resolve";

export interface WriteOpts {
  dryRun: boolean;
  via?: Via;
}

const STALE = "This card changed since I showed it to you. Ask me again.";
const STALE_DRAFT = "This draft changed since I showed it to you. Ask me again.";
const NOTES_PREVIEW = 300;
const BODY_PREVIEW = 1500;
export const MAX_BROADCAST_TEXT = 10_000;
export const MAX_BROADCAST_COMPANIES = 50;

// ── input schemas. `dryRun` defaults to true; an apply is dryRun:false. No other defaults, so the
//    argument hash Marge computes over what it sent matches what Molly recomputes. ────────────
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const boardCardCreateInput = z.object({
  title: z.string(),
  notes: z.string().optional(),
  status: z.enum(BOARD_STATUSES).optional(),
  owners: z.array(z.string()).max(MAX_OWNERS_PER_CARD).optional(),
  project: z.string().optional(),
  dueDate: dateString.optional(),
  dryRun: z.boolean().default(true),
});
export const boardCardUpdateInput = z.object({
  cardId: z.string().min(1).max(100),
  expectedUpdatedAt: z.string().min(1).max(40),
  title: z.string().optional(),
  notes: z.string().nullable().optional(),
  owners: z.array(z.string()).max(MAX_OWNERS_PER_CARD).optional(),
  project: z.string().nullable().optional(),
  dueDate: dateString.nullable().optional(),
  dryRun: z.boolean().default(true),
});
export const boardCardMoveInput = z.object({
  cardId: z.string().min(1).max(100),
  expectedUpdatedAt: z.string().min(1).max(40),
  status: z.enum(BOARD_STATUSES),
  dryRun: z.boolean().default(true),
});
export const boardCardAddLinkInput = z.object({
  cardId: z.string().min(1).max(100),
  url: z.string(),
  label: z.string().optional(),
  dryRun: z.boolean().default(true),
});
export const broadcastDraftSaveInput = z.object({
  broadcastId: z.string().min(1).max(100).optional(),
  expectedUpdatedAt: z.string().min(1).max(40).optional(),
  subject: z.string().optional(),
  bodyText: z.string().max(MAX_BROADCAST_TEXT).optional(),
  companies: z.array(z.string()).max(MAX_BROADCAST_COMPANIES).optional(),
  dryRun: z.boolean().default(true),
});

// ── helpers ───────────────────────────────────────────────────────────────────────────────
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Fri 23 Oct 2026 (2026-10-23)" */
export function dueLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} (${iso})`;
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);
const statusLabel = (s: string) => BOARD_STATUS_LABELS[s as BoardStatus] ?? s;
const names = (xs: string[]) => (xs.length ? xs.join(", ") : "none");

export function previewOutput(preview: MargePreview): ToolOutput {
  const lines = [`Preview (nothing has been changed): ${preview.action}${preview.target ? ` — ${preview.target}` : ""}`];
  for (const f of preview.fields) lines.push(f.before !== undefined ? `${f.label}: ${f.before} → ${f.after}` : `${f.label}: ${f.after}`);
  for (const w of preview.warnings) lines.push(`Note: ${w}`);
  return { text: lines.join("\n"), structured: { preview }, count: 1 };
}

function requireVia(opts: WriteOpts): Via {
  if (!opts.via) throw new Error("apply without via"); // a programming error, not a user error
  return opts.via;
}

function failure(r: { status: number; error: string }): never {
  throw new ToolError(r.status === 409 ? STALE : r.error, r.status === 409 ? "conflict" : undefined);
}

type CardRow = NonNullable<Awaited<ReturnType<typeof loadCard>>>;
async function loadCard(id: string) {
  const c = await db.boardCard.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      notes: true,
      status: true,
      dueDate: true,
      updatedAt: true,
      archivedAt: true,
      projectId: true,
      project: { select: { name: true } },
      owners: { select: { personId: true, person: { select: { displayName: true, user: { select: { name: true } } } } } },
      _count: { select: { links: true } },
    },
  });
  if (!c || c.archivedAt) throw new ToolError("No card with that id.");
  return c;
}
/** JC-MG-G: the card must be unchanged since the preview, at plan time and again at apply time. */
function assertFresh(card: { updatedAt: Date }, expected: string, message = STALE) {
  if (card.updatedAt.toISOString() !== expected) throw new ToolError(message, "conflict");
}
const ownerNames = (c: CardRow) => c.owners.map((o) => o.person.user?.name ?? o.person.displayName);

// ── board_card_create ─────────────────────────────────────────────────────────────────────
export async function boardCardCreate(
  input: z.infer<typeof boardCardCreateInput>,
  p: Principal,
  opts: WriteOpts
): Promise<ToolOutput> {
  const title = input.title.trim();
  if (!title || title.length > MAX_TITLE_LENGTH) throw new ToolError("A title of 1-300 characters is required.");
  if (input.notes !== undefined && input.notes.length > MAX_NOTES_LENGTH) throw new ToolError("Notes are limited to 5000 characters.");
  if (input.owners && input.owners.length > MAX_OWNERS_PER_CARD) throw new ToolError(`A card can have at most ${MAX_OWNERS_PER_CARD} owners.`);
  if (input.dueDate && !parseDueDate(input.dueDate)) throw new ToolError("dueDate must be a date like 2026-10-23.");

  const lists = await loadBoardLists();
  const owners: { id: string; name: string }[] = [];
  for (const raw of input.owners ?? []) {
    const o = await resolvePerson(raw, p, lists, !opts.dryRun);
    if (!owners.some((x) => x.id === o.id && o.id !== "")) owners.push(o);
  }
  const project = input.project ? resolveProject(input.project, lists) : null;

  // The allowlisted body, built field by field from resolved ids only.
  const body: Record<string, unknown> = { title };
  if (input.notes !== undefined) body.notes = input.notes;
  if (input.status !== undefined) body.status = input.status;
  if (owners.length) body.ownerIds = owners.map((o) => o.id);
  if (project) body.projectId = project.id;
  if (input.dueDate) body.dueDate = input.dueDate;

  if (opts.dryRun) {
    const fields: MargePreview["fields"] = [
      { label: "Title", after: title },
      { label: "Status", after: statusLabel(input.status ?? "TODO") },
      { label: "Owners", after: names(owners.map((o) => o.name)) },
      { label: "Project", after: project?.name ?? "none" },
      { label: "Due", after: input.dueDate ? dueLabel(input.dueDate) : "none" },
    ];
    if (input.notes?.trim()) fields.push({ label: "Notes", after: clip(input.notes, NOTES_PREVIEW) });
    return previewOutput({ action: "Create card", fields, warnings: [] });
  }

  const r = await createBoardCard(p, body, requireVia(opts));
  if (!r.ok) failure(r);
  return {
    text: `Created card “${r.value.title}”.`,
    structured: { cardId: r.value.id, url: boardUrl() },
    count: 1,
  };
}

// ── board_card_update ─────────────────────────────────────────────────────────────────────
export async function boardCardUpdate(
  input: z.infer<typeof boardCardUpdateInput>,
  p: Principal,
  opts: WriteOpts
): Promise<ToolOutput> {
  const card = await loadCard(input.cardId);
  assertFresh(card, input.expectedUpdatedAt);

  const body: Record<string, unknown> = {}; // only title, notes, dueDate, ownerIds, projectId (never archived)
  const fields: MargePreview["fields"] = [];

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title || title.length > MAX_TITLE_LENGTH) throw new ToolError("A title of 1-300 characters is required.");
    body.title = title;
    fields.push({ label: "Title", before: card.title, after: title });
  }
  if (input.notes !== undefined) {
    if (input.notes !== null && input.notes.length > MAX_NOTES_LENGTH) throw new ToolError("Notes are limited to 5000 characters.");
    body.notes = input.notes;
    fields.push({
      label: "Notes",
      before: card.notes ? clip(card.notes, NOTES_PREVIEW) : "none",
      after: input.notes?.trim() ? clip(input.notes, NOTES_PREVIEW) : "none",
    });
  }
  if (input.dueDate !== undefined) {
    if (input.dueDate !== null && !parseDueDate(input.dueDate)) throw new ToolError("dueDate must be a date like 2026-10-23.");
    body.dueDate = input.dueDate;
    fields.push({
      label: "Due",
      before: card.dueDate ? dueLabel(card.dueDate.toISOString().slice(0, 10)) : "none",
      after: input.dueDate ? dueLabel(input.dueDate) : "none",
    });
  }
  if (input.owners !== undefined || input.project !== undefined) {
    const lists = await loadBoardLists();
    if (input.owners !== undefined) {
      if (input.owners.length > MAX_OWNERS_PER_CARD) throw new ToolError(`A card can have at most ${MAX_OWNERS_PER_CARD} owners.`);
      const owners: { id: string; name: string }[] = [];
      for (const raw of input.owners) {
        const o = await resolvePerson(raw, p, lists, !opts.dryRun);
        if (!owners.some((x) => x.id === o.id && o.id !== "")) owners.push(o);
      }
      body.ownerIds = owners.map((o) => o.id);
      fields.push({ label: "Owners", before: names(ownerNames(card)), after: names(owners.map((o) => o.name)) });
    }
    if (input.project !== undefined) {
      if (input.project === null) {
        body.projectId = null;
        fields.push({ label: "Project", before: card.project?.name ?? "none", after: "none" });
      } else {
        const proj = resolveProject(input.project, lists);
        body.projectId = proj.id;
        fields.push({ label: "Project", before: card.project?.name ?? "none", after: proj.name });
      }
    }
  }
  if (!fields.length) throw new ToolError("Nothing to change: say what to edit.");

  if (opts.dryRun) {
    return previewOutput({
      action: "Edit card",
      target: card.title,
      fields,
      warnings: [],
      expectedUpdatedAt: card.updatedAt.toISOString(),
    });
  }

  const r = await updateBoardCard(p, card.id, body, requireVia(opts));
  if (!r.ok) failure(r);
  return { text: `Updated card “${r.value.title}”.`, structured: { cardId: card.id, url: boardUrl() }, count: 1 };
}

// ── board_card_move ───────────────────────────────────────────────────────────────────────
export async function boardCardMove(
  input: z.infer<typeof boardCardMoveInput>,
  p: Principal,
  opts: WriteOpts
): Promise<ToolOutput> {
  const card = await loadCard(input.cardId);
  assertFresh(card, input.expectedUpdatedAt);
  if (card.status === input.status) throw new ToolError(`That card is already in ${statusLabel(card.status)}.`);

  if (opts.dryRun) {
    const warnings: string[] = [];
    if (input.status === "DONE" && card._count.links === 0) warnings.push("No proof link yet."); // nudge only, never blocks
    return previewOutput({
      action: "Move card",
      target: card.title,
      fields: [{ label: "Status", before: statusLabel(card.status), after: statusLabel(input.status) }],
      warnings,
      expectedUpdatedAt: card.updatedAt.toISOString(),
    });
  }

  const r = await moveBoardCard(p, card.id, { status: input.status }, requireVia(opts)); // end of the column
  if (!r.ok) failure(r);
  return { text: `Moved “${card.title}” to ${statusLabel(input.status)}.`, structured: { cardId: card.id, url: boardUrl() }, count: 1 };
}

// ── board_card_add_link ───────────────────────────────────────────────────────────────────
export async function boardCardAddLink(
  input: z.infer<typeof boardCardAddLinkInput>,
  p: Principal,
  opts: WriteOpts
): Promise<ToolOutput> {
  const parsed = parseLinkInput({ url: input.url, label: input.label });
  if (!parsed.ok) throw new ToolError(parsed.error);
  const card = await loadCard(input.cardId);
  if (card._count.links >= MAX_LINKS_PER_CARD) throw new ToolError(`A card can have at most ${MAX_LINKS_PER_CARD} links.`);

  if (opts.dryRun) {
    return previewOutput({
      action: "Add link",
      target: card.title,
      fields: [{ label: "Link", after: parsed.label ? `${parsed.label} (${hostOf(parsed.url)})` : hostOf(parsed.url) }],
      warnings: [],
    });
  }

  const r = await addBoardCardLink(p, card.id, { url: parsed.url, label: parsed.label }, requireVia(opts)); // re-checks the cap
  if (!r.ok) failure(r);
  return { text: `Added a link to “${card.title}”.`, structured: { linkId: r.value.id, url: boardUrl() }, count: 1 };
}

// ── broadcast_draft_save ──────────────────────────────────────────────────────────────────
async function resolveCompanies(raws: string[]): Promise<{ id: string; name: string }[]> {
  const all = await db.portfolioCompany.findMany({ select: { id: true, name: true } });
  const list = all.map((c) => ({ id: c.id, name: c.name, aliases: [] as string[] }));
  const out: { id: string; name: string }[] = [];
  for (const raw of raws) {
    const r = resolveOne(raw, list, "company");
    if (!r.ok) throw new ToolError(r.error);
    if (!out.some((x) => x.id === r.id)) out.push({ id: r.id, name: r.name });
  }
  return out;
}

const audience = (xs: string[]) => (xs.length ? `${xs.length} ${xs.length === 1 ? "company" : "companies"}: ${xs.join(", ")}` : "none yet");
const DRAFT_ONLY = "Draft only. Nothing is sent until someone publishes it in Molly.";

export async function broadcastDraftSave(
  input: z.infer<typeof broadcastDraftSaveInput>,
  p: Principal,
  opts: WriteOpts
): Promise<ToolOutput> {
  const subject = input.subject?.trim();
  if (subject !== undefined && (!subject || subject.length > 200)) {
    throw new ToolError("The subject is required and must be 200 characters or fewer.");
  }
  const companies = input.companies !== undefined ? await resolveCompanies(input.companies) : undefined;
  const html = input.bodyText !== undefined ? plainToDigestHtml(input.bodyText) : undefined; // F123: plain text in, escaped HTML out
  const bodyPreview = (t: string) => `${clip(t, BODY_PREVIEW)} (${t.length.toLocaleString("en-US")} characters)`;

  // Create
  if (!input.broadcastId) {
    if (!subject) throw new ToolError("A subject is required to create a draft.");
    if (opts.dryRun) {
      const fields: MargePreview["fields"] = [
        { label: "Subject", after: subject },
        { label: "Audience", after: audience((companies ?? []).map((c) => c.name)) },
      ];
      if (input.bodyText?.trim()) fields.push({ label: "Body", after: bodyPreview(input.bodyText) });
      return previewOutput({ action: "Create draft broadcast", fields, warnings: [DRAFT_ONLY] });
    }
    const r = await createBroadcastDraft(
      p,
      { subject, body: html ?? "", portfolioCompanyIds: (companies ?? []).map((c) => c.id) },
      requireVia(opts)
    );
    if (!r.ok) failure(r);
    return {
      text: `Saved draft broadcast “${r.value.subject}”. Nothing has been sent.`,
      structured: { broadcastId: r.value.id, url: broadcastUrl(r.value.id) },
      count: 1,
    };
  }

  // Edit an existing draft
  if (!input.expectedUpdatedAt) throw new ToolError("expectedUpdatedAt is required when editing a draft.");
  const b = await db.companyBroadcast.findUnique({
    where: { id: input.broadcastId },
    select: {
      id: true,
      subject: true,
      body: true,
      status: true,
      updatedAt: true,
      targets: { select: { portfolioCompany: { select: { name: true } } } },
    },
  });
  if (!b) throw new ToolError("No broadcast with that id.");
  if (b.status !== "DRAFT") throw new ToolError("That broadcast is already published; edit a draft instead.");
  assertFresh(b, input.expectedUpdatedAt, STALE_DRAFT);

  const data: { subject?: string; body?: string; portfolioCompanyIds?: string[] } = {};
  const fields: MargePreview["fields"] = [];
  const warnings: string[] = [];
  if (subject !== undefined) {
    data.subject = subject;
    fields.push({ label: "Subject", before: b.subject, after: subject });
  }
  if (companies !== undefined) {
    data.portfolioCompanyIds = companies.map((c) => c.id);
    fields.push({
      label: "Audience",
      before: audience(b.targets.map((t) => t.portfolioCompany.name).sort()),
      after: audience(companies.map((c) => c.name)),
    });
  }
  if (html !== undefined && input.bodyText !== undefined) {
    data.body = html;
    const current = htmlToPlainText(b.body, Number.MAX_SAFE_INTEGER).length;
    fields.push({ label: "Body", before: current ? `${current.toLocaleString("en-US")} characters` : "empty", after: bodyPreview(input.bodyText) });
    if (current > 0) {
      warnings.push(`Replaces the current body (${current.toLocaleString("en-US")} characters). Formatting from the Molly editor is lost.`);
    }
  }
  if (!fields.length) throw new ToolError("Nothing to change: say what to edit.");
  warnings.push(DRAFT_ONLY);

  if (opts.dryRun) {
    return previewOutput({
      action: "Edit draft broadcast",
      target: b.subject,
      fields,
      warnings,
      expectedUpdatedAt: b.updatedAt.toISOString(),
    });
  }

  const r = await updateBroadcastDraft(p, b.id, data, requireVia(opts));
  if (!r.ok) failure(r);
  return {
    text: `Updated draft broadcast “${(r.value?.subject ?? b.subject)}”. Nothing has been sent.`,
    structured: { broadcastId: b.id, url: broadcastUrl(b.id) },
    count: 1,
  };
}
