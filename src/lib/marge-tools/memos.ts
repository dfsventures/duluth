// Part 40 (WS129). The memo tools Marge may call, registered only when MARGE_MEMO_TOOLS=on.
// Same shape as read.ts / write.ts: every function is (input, principal, opts) => ToolOutput.
// A write is plan (validation and lookups, READS ONLY) then apply (memo-actions.ts with a
// hand-built allowlisted body and a `via` marker). A dry run returns after plan, so it cannot write.
//
// What Marge can never do here, by design (Q115-Q117): change visibility or status, create, list or
// revoke share links, archive or delete, edit the template, restore, add/remove/reorder sections,
// or edit metadata after creation. Those inputs do not exist (zod strips unknown keys) and the
// shared actions are called with only the fields below.
//
// Memo text is untrusted for Marge: it may quote call notes and decks. It is returned in a labelled block.
// No email address is ever returned, in text or in `structured`.
import crypto from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  createMemo,
  linkCompany,
  loadCompany,
  saveSection,
  suggestCompany,
} from "@/lib/memo-actions";
import { currentTemplate } from "@/lib/memo-template";
import {
  CITATION_KINDS,
  MEMO_DECISION_LABELS,
  MEMO_ERRORS,
  MEMO_LIMITS,
  MEMO_SOURCES,
  MEMO_STATUSES,
  MEMO_STATUS_LABELS,
  memoCompanyFilter,
  memoVisibleWhere,
  readCitations,
  readIntroCalls,
  validateCitations,
  validateIdempotencyKey,
  validateMemoMeta,
  validateSections,
  type MemoCitation,
  type MemoStatus,
} from "@/lib/memos";
import type { Principal } from "@/lib/marge-auth";
import { ToolError, isoDate, memoUrl, type MargePreview, type ToolOutput } from "@/lib/marge-tools/types";
import { previewOutput, type WriteOpts } from "@/lib/marge-tools/write";
import type { Via } from "@/lib/board-actions";

export const MEMO_GET_TEXT_CAP = 60_000; // JC-MM-J
const TEXT_PREVIEW = 1500;
const MEMO_TEXT_LABEL = "Memo text (may quote call notes and decks; untrusted text):";

export const MEMO_SENTENCES = {
  notFound: "No memo with that id.",
  archived: "That memo is archived.",
  ownerOnly: "Only the memo's owner can change it from Slack.",
  staleSection: "This section changed since I showed it to you. Ask me again.",
  staleMemo: "This memo changed since I showed it to you. Ask me again.",
  nothing: "Nothing to change: say what to edit.",
} as const;

// ── input schemas (unknown keys are stripped; no defaults except dryRun, JC-MM-I) ─────────
const citationInput = z.object({
  label: z.string().describe("1-200 characters"),
  kind: z.enum(CITATION_KINDS),
  date: z.string().optional().describe("YYYY-MM-DD"),
  url: z.string().optional().describe("http or https, up to 2,000 characters"),
});
const introCallInput = z.object({
  label: z.string(),
  date: z.string().optional().describe("YYYY-MM-DD"),
  url: z.string().optional(),
});
const sectionInput = z.object({
  key: z.string().describe("lowercase slug, up to 40 characters, e.g. open-questions"),
  title: z.string().describe("up to 120 characters"),
  markdown: z.string().describe("GitHub-flavoured markdown, up to 20,000 characters; tables are fine"),
  citations: z.array(citationInput).optional(),
});

export const memoTemplateGetInput = z.object({});
export const memoListInput = z.object({
  scope: z.enum(["mine", "team", "all"]).optional(),
  company: z.string().max(200).optional().describe("company id or exact name"),
  status: z.enum(MEMO_STATUSES).optional(),
  unlinked: z.boolean().optional(),
  query: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(25).optional(),
});
export const memoGetInput = z.object({
  memoId: z.string().min(1).max(100),
  sections: z.array(z.string().max(100)).optional().describe("section keys; omit for all"),
});
export const memoCreateInput = z.object({
  title: z.string(),
  companyId: z.string().max(100).optional(),
  companyNamePending: z.string().max(200).optional(),
  source: z.string().max(100).optional().describe(`one of: ${MEMO_SOURCES.join(", ")}`),
  tags: z.array(z.string()).optional(),
  introDate: z.string().optional().describe("YYYY-MM-DD"),
  websiteUrl: z.string().optional(),
  introCalls: z.array(introCallInput).optional(),
  sections: z.array(sectionInput),
  idempotencyKey: z.string().describe("8-100 letters, digits, - or _; reuse the same key when retrying the same memo"),
  dryRun: z.boolean().default(true),
});
export const memoUpdateSectionInput = z.object({
  memoId: z.string().min(1).max(100),
  sectionKey: z.string().min(1).max(100),
  expectedVersion: z.number().int(),
  title: z.string().optional(),
  markdown: z.string().optional(),
  citations: z.array(citationInput).optional(),
  dryRun: z.boolean().default(true),
});
export const memoLinkCompanyInput = z.object({
  memoId: z.string().min(1).max(100),
  expectedVersion: z.number().int(),
  company: z.string().min(1).max(200).describe("company id or exact name"),
  dryRun: z.boolean().default(true),
});

// ── helpers ───────────────────────────────────────────────────────────────────────────────
const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const n = (x: number) => x.toLocaleString("en-US");
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max).trimEnd()}…` : s);
const ownerName = (o: { name: string | null }) => o.name?.trim() || "Unnamed owner";
const pendingLabel = (name: string) => `Not in Molly yet: ${name}`;

function requireVia(opts: WriteOpts): Via {
  if (!opts.via) throw new Error("apply without via"); // a programming error, not a user error
  return opts.via;
}

function citationLine(c: MemoCitation): string {
  return [c.label, c.kind, c.date, c.url].filter(Boolean).join(" · ");
}

/** "No memo with that id." for unknown or someone else's private memo; "That memo is archived." only for one the person could otherwise see. */
async function notFoundOrArchived(memoId: string, p: Principal): Promise<never> {
  const archived = await db.memo.findFirst({
    where: { id: memoId, archivedAt: { not: null }, OR: [{ ownerId: p.id }, { visibility: "TEAM" }] },
    select: { id: true },
  });
  throw new ToolError(archived ? MEMO_SENTENCES.archived : MEMO_SENTENCES.notFound);
}

/** Part 41: Notion's pipeline decision as its label; null when not set. Output only: Marge cannot set it. */
const decisionLabel = (d: string | null): string | null => (d ? (MEMO_DECISION_LABELS as Record<string, string>)[d] ?? d : null);

const HEAD_SELECT = {
  id: true,
  title: true,
  status: true,
  visibility: true,
  ownerId: true,
  draftedByMarge: true,
  decision: true,
  companyId: true,
  companyNamePending: true,
  version: true,
  updatedAt: true,
  company: { select: { id: true, name: true } },
  owner: { select: { name: true } },
} as const;

async function loadVisibleMemo<T extends object>(memoId: string, p: Principal, extra: T) {
  const memo = await db.memo.findFirst({
    where: { id: memoId, ...memoVisibleWhere(p.id) },
    select: { ...HEAD_SELECT, ...extra },
  });
  if (!memo) return notFoundOrArchived(memoId, p);
  return memo;
}

function companyLabel(m: { company: { name: string } | null; companyNamePending: string | null }): string {
  return m.company?.name ?? (m.companyNamePending ? pendingLabel(m.companyNamePending) : "none");
}

// ── memo_template_get ─────────────────────────────────────────────────────────────────────
export async function memoTemplateGet(_input: z.infer<typeof memoTemplateGetInput>, _p: Principal): Promise<ToolOutput> {
  const t = await currentTemplate();
  const lines = [`Memo template, version ${t.version}. Sections in order:`];
  t.sections.forEach((s, i) => {
    lines.push(
      `${i + 1}. ${s.key} · ${s.title} · ${s.required ? "required" : "optional"} · ${s.shareByDefault ? "shared by default" : "not shared by default"}`
    );
    if (s.guidance) lines.push(`   Guidance: ${s.guidance}`);
  });
  return {
    text: lines.join("\n"),
    structured: { version: t.version, sections: t.sections },
    count: t.sections.length,
  };
}

// ── memo_list ─────────────────────────────────────────────────────────────────────────────
async function resolveCompanyFilter(raw: string): Promise<{ id: string; name: string }> {
  const byId = await loadCompany(raw);
  if (byId) return { id: byId.id, name: byId.name };
  const matches = await db.company.findMany({
    where: { AND: [memoCompanyFilter, { name: { equals: raw, mode: "insensitive" } }] },
    select: { id: true, name: true },
    take: 6,
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new ToolError(`“${raw}” matches ${matches.length} companies: ${matches.map((c) => c.name).join(", ")}. Use the id.`);
  }
  const close = await db.company.findMany({
    where: { AND: [memoCompanyFilter, { name: { contains: raw.slice(0, 50), mode: "insensitive" } }] },
    select: { id: true, name: true },
    take: 5,
  });
  throw new ToolError(`No company called “${raw}”.${close.length ? ` Closest: ${close.map((c) => c.name).join(", ")}.` : ""}`);
}

export async function memoList(input: z.infer<typeof memoListInput>, p: Principal): Promise<ToolOutput> {
  const and: object[] = [memoVisibleWhere(p.id)];
  if (input.scope === "mine") and.push({ ownerId: p.id });
  else if (input.scope === "team") and.push({ visibility: "TEAM" });
  if (input.company) and.push({ companyId: (await resolveCompanyFilter(input.company.trim())).id });
  if (input.status) and.push({ status: input.status });
  if (input.unlinked) and.push({ companyId: null });
  const q = input.query?.trim();
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { companyNamePending: { contains: q, mode: "insensitive" } },
        { company: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  const rows = await db.memo.findMany({
    where: { AND: and },
    orderBy: { updatedAt: "desc" },
    take: input.limit ?? 10,
    select: HEAD_SELECT,
  });
  const memos = rows.map((m) => ({
    id: m.id,
    title: m.title,
    company: companyLabel(m),
    companyId: m.companyId,
    companyNamePending: m.companyId ? null : m.companyNamePending,
    status: m.status,
    owner: ownerName(m.owner),
    visibility: m.visibility,
    draftedByMarge: m.draftedByMarge,
    decision: decisionLabel(m.decision),
    updatedAt: m.updatedAt.toISOString(),
    url: memoUrl(m.id),
  }));
  const lines = memos.map(
    (m) =>
      `[${m.id}] ${m.title} · ${m.company} · ${MEMO_STATUS_LABELS[m.status as MemoStatus] ?? m.status} · ${m.decision ? `${m.decision} · ` : ""}owner ${m.owner} · ${m.visibility === "TEAM" ? "shared with team" : "private"}${m.draftedByMarge ? " · drafted by Marge" : ""} · updated ${isoDate(new Date(m.updatedAt))} · ${m.url}`
  );
  return { text: lines.length ? lines.join("\n") : "No memos matched.", structured: { memos }, count: memos.length };
}

// ── memo_get ──────────────────────────────────────────────────────────────────────────────
export async function memoGet(input: z.infer<typeof memoGetInput>, p: Principal): Promise<ToolOutput> {
  const memo = await loadVisibleMemo(input.memoId, p, {
    source: true,
    tags: true,
    introDate: true,
    websiteUrl: true,
    introCalls: true,
    templateVersion: true,
    sections: {
      orderBy: { position: "asc" },
      select: { key: true, title: true, markdown: true, citations: true, includeInShare: true, version: true },
    },
  });

  const all = memo.sections;
  let wanted = all;
  if (input.sections?.length) {
    for (const k of input.sections) {
      if (!all.some((s) => s.key === k)) throw new ToolError(unknownSection(k, all));
    }
    wanted = all.filter((s) => input.sections!.includes(s.key));
  }
  // JC-MM-J: whole sections only, in order, up to the character cap.
  const shown: typeof wanted = [];
  const omitted: string[] = [];
  let used = 0;
  for (const s of wanted) {
    if (used + s.markdown.length > MEMO_GET_TEXT_CAP) omitted.push(s.key);
    else {
      shown.push(s);
      used += s.markdown.length;
    }
  }

  const calls = readIntroCalls(memo.introCalls);
  const header = {
    id: memo.id,
    title: memo.title,
    company: companyLabel(memo),
    companyId: memo.companyId,
    companyNamePending: memo.companyId ? null : memo.companyNamePending,
    status: memo.status,
    owner: ownerName(memo.owner),
    ownerIsYou: memo.ownerId === p.id,
    visibility: memo.visibility,
    draftedByMarge: memo.draftedByMarge,
    decision: decisionLabel(memo.decision),
    source: memo.source,
    tags: memo.tags,
    introDate: isoDate(memo.introDate),
    websiteUrl: memo.websiteUrl,
    introCalls: calls,
    templateVersion: memo.templateVersion,
    version: memo.version,
    updatedAt: memo.updatedAt.toISOString(),
    url: memoUrl(memo.id),
  };
  const sections = shown.map((s) => ({
    key: s.key,
    title: s.title,
    version: s.version,
    includeInShare: s.includeInShare,
    markdown: s.markdown,
    citations: readCitations(s.citations), // all fields, internal URLs included: Marge may need them
  }));

  const lines = [
    `Memo [${header.id}] ${header.title}`,
    `Company: ${header.company} · Status: ${MEMO_STATUS_LABELS[header.status as MemoStatus] ?? header.status} · ${header.visibility === "TEAM" ? "Shared with team" : "Private"} · Owner: ${header.owner}${header.ownerIsYou ? " (you)" : ""} · Memo version ${header.version}${header.draftedByMarge ? " · Drafted by Marge" : ""}`,
    `Source: ${header.source ?? "not set"} · Decision: ${header.decision ?? "not set"} · Tags: ${header.tags.length ? header.tags.join(", ") : "none"} · Intro date: ${header.introDate ?? "not set"} · Website: ${header.websiteUrl ?? "not set"}`,
  ];
  if (calls.length) lines.push(`Intro calls: ${calls.map((c) => [c.label, c.date, c.url].filter(Boolean).join(" · ")).join("; ")}`);
  lines.push(`Link: ${header.url}`);
  for (const s of sections) {
    lines.push("", `Section [${s.key}] ${s.title} · section version ${s.version} · ${s.includeInShare ? "in share links" : "not in share links"}`);
    lines.push(MEMO_TEXT_LABEL, s.markdown || "(empty)");
    if (s.citations.length) lines.push(`Citations: ${s.citations.map(citationLine).join("; ")}`);
  }
  if (omitted.length) {
    lines.push(
      "",
      `Left out to keep this short (over ${n(MEMO_GET_TEXT_CAP)} characters of text): ${omitted.join(", ")}. Ask with sections: [${omitted.map((k) => `"${k}"`).join(", ")}].`
    );
  }
  return {
    text: lines.join("\n"),
    structured: { memo: header, sections, omittedSections: omitted },
    count: sections.length,
  };
}

function unknownSection(key: string, sections: { key: string }[]): string {
  return `No section “${key}” in this memo. Sections: ${sections.map((s) => s.key).join(", ")}`;
}

// ── memo_create ───────────────────────────────────────────────────────────────────────────
export async function memoCreate(input: z.infer<typeof memoCreateInput>, p: Principal, opts: WriteOpts): Promise<ToolOutput> {
  // The allowlist: only these keys are ever read from the input, so nothing else can reach the action.
  const key = validateIdempotencyKey(input.idempotencyKey);
  if (!key.ok) throw new ToolError(key.error);
  const meta = validateMemoMeta({
    title: input.title,
    companyId: input.companyId,
    companyNamePending: input.companyNamePending,
    source: input.source,
    tags: input.tags,
    introDate: input.introDate,
    websiteUrl: input.websiteUrl,
    introCalls: input.introCalls,
  });
  if (!meta.ok) throw new ToolError(meta.error);
  const sections = validateSections(input.sections);
  if (!sections.ok) throw new ToolError(sections.error);

  let company: { id: string; name: string } | null = null;
  if (meta.value.companyId) {
    const c = await loadCompany(meta.value.companyId);
    if (!c) throw new ToolError("No company with that id in Molly. Use companyNamePending for a company that isn't in Molly yet.");
    company = { id: c.id, name: c.name };
  }

  // The body handed to the shared action, built field by field from the validated values.
  const body: Record<string, unknown> = { title: meta.value.title, sections: sections.value, idempotencyKey: key.value };
  if (meta.value.companyId) body.companyId = meta.value.companyId;
  if (meta.value.companyNamePending) body.companyNamePending = meta.value.companyNamePending;
  if (meta.value.source) body.source = meta.value.source;
  if (meta.value.tags.length) body.tags = meta.value.tags;
  if (input.introDate) body.introDate = input.introDate;
  if (meta.value.websiteUrl) body.websiteUrl = meta.value.websiteUrl;
  if (meta.value.introCalls.length) body.introCalls = meta.value.introCalls;

  if (opts.dryRun) {
    const template = await currentTemplate();
    const given = new Set(sections.value.map((s) => s.key));
    const missing = template.sections.filter((s) => s.required && !given.has(s.key)).map((s) => s.title);
    const totalCitations = sections.value.reduce((t, s) => t + s.citations.length, 0);
    const warnings = ["Private to you until you share it in Molly."];
    if (missing.length) warnings.push(`Missing required sections: ${missing.join(", ")}.`);
    let suggested: { id: string; name: string } | null = null;
    if (meta.value.companyNamePending) {
      suggested = await suggestCompany(meta.value.companyNamePending);
      if (suggested) warnings.push(`${suggested.name} looks like it is already in Molly. Link it to keep things together.`);
    }
    const existing = await db.memo.findUnique({
      where: { createKey: sha256(`${p.id}:${key.value}`) },
      select: { title: true },
    });
    if (existing) warnings.push(`Already created as “${existing.title}”.`);

    const preview: MargePreview = {
      action: "Create memo",
      fields: [
        { label: "Title", after: meta.value.title },
        { label: "Company", after: company?.name ?? (meta.value.companyNamePending ? pendingLabel(meta.value.companyNamePending) : "none") },
        { label: "Owner", after: "you" },
        {
          label: "Sections",
          after: sections.value
            .map((s, i) => `${i + 1}. ${s.title} · ${n(s.markdown.length)} characters · ${s.citations.length} ${s.citations.length === 1 ? "citation" : "citations"}`)
            .join("\n"),
        },
        { label: "Citations", after: String(totalCitations) },
        { label: "Status", after: "Draft" },
        { label: "Visibility", after: "Private to you" },
      ],
      warnings,
    };
    const out = previewOutput(preview);
    if (suggested) out.structured = { ...out.structured, suggestedCompany: suggested };
    return out;
  }

  const r = await createMemo(p, body, requireVia(opts));
  if (!r.ok) throw new ToolError(r.error);
  const url = memoUrl(r.value.id);
  return {
    text: r.value.duplicate
      ? `That memo was already created: ${url}`
      : `Created draft memo “${meta.value.title}”. Private to you until you share it in Molly. ${url}`,
    structured: { memoId: r.value.id, url, version: r.value.version, duplicate: r.value.duplicate },
    count: 1,
  };
}


// ── memo_update_section ───────────────────────────────────────────────────────────────────
export async function memoUpdateSection(
  input: z.infer<typeof memoUpdateSectionInput>,
  p: Principal,
  opts: WriteOpts
): Promise<ToolOutput> {
  const memo = await loadVisibleMemo(input.memoId, p, {
    sections: {
      orderBy: { position: "asc" },
      select: { key: true, title: true, markdown: true, citations: true, version: true },
    },
  });
  if (memo.ownerId !== p.id) throw new ToolError(MEMO_SENTENCES.ownerOnly);
  const section = memo.sections.find((s) => s.key === input.sectionKey);
  if (!section) throw new ToolError(unknownSection(input.sectionKey, memo.sections));
  if (section.version !== input.expectedVersion) throw new ToolError(MEMO_SENTENCES.staleSection, "conflict");

  const before = { title: section.title, markdown: section.markdown, citations: readCitations(section.citations) };
  const body: Record<string, unknown> = { expectedVersion: input.expectedVersion }; // only title, markdown, citations ever follow
  const fields: MargePreview["fields"] = [];

  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t || t.length > MEMO_LIMITS.sectionTitle) throw new ToolError(MEMO_ERRORS.sectionTitle);
    if (t !== before.title) {
      body.title = t;
      fields.push({ label: "Section title", before: before.title, after: t });
    }
  }
  if (input.markdown !== undefined) {
    if (input.markdown.length > MEMO_LIMITS.sectionChars) throw new ToolError(MEMO_ERRORS.sectionTooLong);
    const others = memo.sections.reduce((t, s) => (s.key === section.key ? t : t + s.markdown.length), 0);
    if (others + input.markdown.length > MEMO_LIMITS.memoChars) throw new ToolError(MEMO_ERRORS.memoTooLong);
    if (input.markdown !== before.markdown) {
      body.markdown = input.markdown;
      fields.push({
        label: "Text",
        before: `${n(before.markdown.length)} characters`,
        after: `${clip(input.markdown, TEXT_PREVIEW)} (${n(input.markdown.length)} characters)`,
      });
    }
  }
  if (input.citations !== undefined) {
    const c = validateCitations(input.citations);
    if (!c.ok) throw new ToolError(c.error);
    if (JSON.stringify(c.value) !== JSON.stringify(before.citations)) {
      body.citations = c.value;
      fields.push({ label: "Citations", before: String(before.citations.length), after: String(c.value.length) });
    }
  }
  if (!fields.length) throw new ToolError(MEMO_SENTENCES.nothing);

  if (opts.dryRun) {
    const warnings: string[] = [];
    if ("markdown" in body && before.markdown.length > 0) {
      warnings.push(`Replaces the whole section text (${n(before.markdown.length)} characters).`);
    }
    return previewOutput({
      action: "Edit memo section",
      target: `${memo.title} — ${section.title}`,
      fields,
      warnings,
      expectedVersion: section.version,
    });
  }

  const r = await saveSection(p, memo.id, section.key, body, requireVia(opts));
  if (!r.ok) {
    if (r.status === 409) throw new ToolError(MEMO_SENTENCES.staleSection, "conflict");
    if (r.status === 403) throw new ToolError(MEMO_SENTENCES.ownerOnly);
    if (r.status === 404) throw new ToolError(r.error === "Section not found" ? unknownSection(section.key, memo.sections) : MEMO_SENTENCES.notFound);
    throw new ToolError(r.error);
  }
  const url = memoUrl(memo.id);
  return {
    text: `Updated “${section.title}” in “${memo.title}”. ${url}`,
    structured: { memoId: memo.id, sectionKey: section.key, version: r.value.version, url },
    count: 1,
  };
}

// ── memo_link_company ─────────────────────────────────────────────────────────────────────
export async function memoLinkCompany(
  input: z.infer<typeof memoLinkCompanyInput>,
  p: Principal,
  opts: WriteOpts
): Promise<ToolOutput> {
  const memo = await loadVisibleMemo(input.memoId, p, {});
  if (memo.ownerId !== p.id) throw new ToolError(MEMO_SENTENCES.ownerOnly);
  if (memo.company) throw new ToolError(`This memo is already linked to ${memo.company.name}.`);
  if (memo.version !== input.expectedVersion) throw new ToolError(MEMO_SENTENCES.staleMemo, "conflict");
  const company = await resolveCompanyFilter(input.company.trim()); // id or exact name, either stage

  if (opts.dryRun) {
    return previewOutput({
      action: "Link memo to company",
      target: memo.title,
      fields: [{ label: "Company", before: memo.companyNamePending ? pendingLabel(memo.companyNamePending) : "none", after: company.name }],
      warnings: [],
      expectedVersion: memo.version,
    });
  }

  const r = await linkCompany(p, memo.id, { expectedVersion: input.expectedVersion, companyId: company.id }, requireVia(opts));
  if (!r.ok) {
    if (r.status === 409) throw new ToolError(MEMO_SENTENCES.staleMemo, "conflict");
    if (r.status === 403) throw new ToolError(MEMO_SENTENCES.ownerOnly);
    if (r.status === 404) throw new ToolError(MEMO_SENTENCES.notFound);
    throw new ToolError(r.error);
  }
  const url = memoUrl(memo.id);
  return {
    text: `Linked “${memo.title}” to ${company.name}. ${url}`,
    structured: { memoId: memo.id, companyId: company.id, version: r.value.version, url },
    count: 1,
  };
}
