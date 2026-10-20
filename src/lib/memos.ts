// Part 40 (WS125). Investment memos: constants, limits, validation and the one definition of
// "who can read a memo". Pure except for the Prisma type import; no database access here.
// The sentences are the contract shared with Marge (docs/IMPLEMENTATION_PLAN.md, Part 40).
import type { Prisma } from "@prisma/client";

export const MEMO_STATUSES = ["DRAFT", "IN_REVIEW", "FINAL"] as const;
export type MemoStatus = (typeof MEMO_STATUSES)[number];
export const MEMO_STATUS_LABELS: Record<MemoStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  FINAL: "Final",
};
export const MEMO_VISIBILITIES = ["PRIVATE", "TEAM"] as const;
export type MemoVisibility = (typeof MEMO_VISIBILITIES)[number];

// Part 41 (D4). Notion's list. The partner-event value is stored under a generic label (Q130).
export const MEMO_SOURCES = [
  "Cold Outreach",
  "Founder Intro",
  "VC Intro",
  "Conference",
  "Operator Intro",
  "Warm Outreach",
  "Partner event",
] as const;
export type MemoSource = (typeof MEMO_SOURCES)[number];

// Part 41 (D3). Notion's Decision. Separate from status (the memo's own lifecycle).
export const MEMO_DECISIONS = ["IN_PROGRESS", "MEMO", "INVESTED", "LATER", "PASSED"] as const;
export type MemoDecision = (typeof MEMO_DECISIONS)[number];
export const MEMO_DECISION_LABELS: Record<MemoDecision, string> = {
  IN_PROGRESS: "In Progress",
  MEMO: "Memo",
  INVESTED: "Invested",
  LATER: "Later",
  PASSED: "Passed",
};

export const CITATION_KINDS = ["call", "deck", "tracker", "web", "other"] as const;
export type CitationKind = (typeof CITATION_KINDS)[number];

// JC-MM-E
export const MEMO_LIMITS = {
  sectionChars: 20_000,
  memoChars: 150_000,
  sections: 30,
  citationsPerSection: 20,
  citationLabel: 200,
  url: 2_000,
  title: 200,
  sectionTitle: 120,
  tags: 20,
  tagLength: 40,
  introCalls: 20,
  keyLength: 40,
} as const;

export interface MemoCitation {
  label: string;
  kind: CitationKind;
  date?: string;
  url?: string;
}
export interface MemoIntroCall {
  label: string;
  date?: string;
  url?: string;
}
export interface MemoTemplateSection {
  key: string;
  title: string;
  guidance: string;
  required: boolean;
  shareByDefault: boolean;
}
export interface MemoSectionInput {
  key: string;
  title: string;
  markdown: string;
  citations: MemoCitation[];
}
export interface MemoMetaValue {
  title: string;
  companyId?: string;
  companyNamePending?: string;
  source: MemoSource | null;
  tags: string[];
  introDate: Date | null;
  websiteUrl: string | null;
  introCalls: MemoIntroCall[];
}

export const MEMO_ERRORS = {
  title: "A title of 1-200 characters is required.",
  sectionTitle: "A section title of 1-120 characters is required.",
  bothCompanies: "Give either a company or a pending company name, not both.",
  sectionTooLong: "A section is limited to 20,000 characters.",
  memoTooLong: "A memo is limited to 150,000 characters in total.",
  tooManySections: "A memo can have at most 30 sections.",
  noSections: "A memo needs at least one section.",
  tooManyCitations: "A section can have at most 20 citations.",
  duplicateKeys: "Each section needs a different key.",
  badKey: "A section key must be 1-40 lowercase letters, digits or hyphens.",
  badUrl: "Links must start with http:// or https://.",
  badDate: "Dates must look like 2026-10-23.",
  badCitation: "Each citation needs a label of 1-200 characters and a kind of call, deck, tracker, web or other.",
  badSource: "That source isn't one of the options.",
  badDecision: "That decision isn't one of the options.",
  badTags: "Tags: at most 20, each 1-40 characters.",
  tooManyCalls: "A memo can have at most 20 intro calls.",
  badCall: "Each intro call needs a label of 1-200 characters.",
  badMarkdown: "Section text must be text.",
  badIdempotency: "idempotencyKey must be 8-100 letters, digits, - or _.",
} as const;

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };
const bad = (error: string): { ok: false; error: string } => ({ ok: false, error });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** "Open Questions" -> "open-questions". Always passes KEY_RE or returns "" (caller decides). */
export function slugifyKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MEMO_LIMITS.keyLength)
    .replace(/-+$/g, "");
}
export const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isValidKey = (k: unknown): k is string =>
  typeof k === "string" && k.length >= 1 && k.length <= MEMO_LIMITS.keyLength && KEY_RE.test(k);

export function validateIdempotencyKey(k: unknown): Validated<string> {
  return typeof k === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(k) ? { ok: true, value: k } : bad(MEMO_ERRORS.badIdempotency);
}

/** http(s) only, no whitespace, within the length cap. */
export function validateWebUrl(raw: unknown): Validated<string> {
  if (typeof raw !== "string") return bad(MEMO_ERRORS.badUrl);
  const v = raw.trim();
  if (!v || v.length > MEMO_LIMITS.url || /\s/.test(v)) return bad(MEMO_ERRORS.badUrl);
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return bad(MEMO_ERRORS.badUrl);
    if (!/^https?:\/\//i.test(v)) return bad(MEMO_ERRORS.badUrl);
  } catch {
    return bad(MEMO_ERRORS.badUrl);
  }
  return { ok: true, value: v };
}

/** YYYY-MM-DD that is a real calendar date. */
export function parseDateOnly(raw: unknown): Date | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw ? null : d;
}

export function validateCitation(raw: unknown): Validated<MemoCitation> {
  if (!isObj(raw)) return bad(MEMO_ERRORS.badCitation);
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!label || label.length > MEMO_LIMITS.citationLabel) return bad(MEMO_ERRORS.badCitation);
  if (!(CITATION_KINDS as readonly unknown[]).includes(raw.kind)) return bad(MEMO_ERRORS.badCitation);
  const out: MemoCitation = { label, kind: raw.kind as CitationKind };
  if (raw.date !== undefined && raw.date !== null && raw.date !== "") {
    if (!parseDateOnly(raw.date)) return bad(MEMO_ERRORS.badDate);
    out.date = raw.date as string;
  }
  if (raw.url !== undefined && raw.url !== null && raw.url !== "") {
    const u = validateWebUrl(raw.url);
    if (!u.ok) return u;
    out.url = u.value;
  }
  return { ok: true, value: out };
}

export function validateCitations(raw: unknown): Validated<MemoCitation[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return bad(MEMO_ERRORS.badCitation);
  if (raw.length > MEMO_LIMITS.citationsPerSection) return bad(MEMO_ERRORS.tooManyCitations);
  const out: MemoCitation[] = [];
  for (const c of raw) {
    const v = validateCitation(c);
    if (!v.ok) return v;
    out.push(v.value);
  }
  return { ok: true, value: out };
}

/** One section's own fields. `markdown` is optional only where the caller allows it (updates). */
export function validateSectionInput(raw: unknown): Validated<MemoSectionInput> {
  if (!isObj(raw)) return bad(MEMO_ERRORS.badKey);
  if (!isValidKey(raw.key)) return bad(MEMO_ERRORS.badKey);
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title || title.length > MEMO_LIMITS.sectionTitle) return bad(MEMO_ERRORS.sectionTitle);
  const markdown = raw.markdown === undefined ? "" : raw.markdown;
  if (typeof markdown !== "string") return bad(MEMO_ERRORS.badMarkdown);
  if (markdown.length > MEMO_LIMITS.sectionChars) return bad(MEMO_ERRORS.sectionTooLong);
  const citations = validateCitations(raw.citations);
  if (!citations.ok) return citations;
  return { ok: true, value: { key: raw.key, title, markdown, citations: citations.value } };
}

/** Sections as a list: count, unique keys, each valid, total length. */
export function validateSections(raw: unknown): Validated<MemoSectionInput[]> {
  if (!Array.isArray(raw) || raw.length === 0) return bad(MEMO_ERRORS.noSections);
  if (raw.length > MEMO_LIMITS.sections) return bad(MEMO_ERRORS.tooManySections);
  const out: MemoSectionInput[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const s of raw) {
    const v = validateSectionInput(s);
    if (!v.ok) return v;
    if (seen.has(v.value.key)) return bad(MEMO_ERRORS.duplicateKeys);
    seen.add(v.value.key);
    total += v.value.markdown.length;
    out.push(v.value);
  }
  if (total > MEMO_LIMITS.memoChars) return bad(MEMO_ERRORS.memoTooLong);
  return { ok: true, value: out };
}

export function validateTitle(raw: unknown): Validated<string> {
  const t = typeof raw === "string" ? raw.trim() : "";
  return !t || t.length > MEMO_LIMITS.title ? bad(MEMO_ERRORS.title) : { ok: true, value: t };
}

export function validateTags(raw: unknown): Validated<string[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw) || raw.length > MEMO_LIMITS.tags) return bad(MEMO_ERRORS.badTags);
  const out: string[] = [];
  for (const t of raw) {
    const v = typeof t === "string" ? t.trim() : "";
    if (!v || v.length > MEMO_LIMITS.tagLength) return bad(MEMO_ERRORS.badTags);
    if (!out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return { ok: true, value: out };
}

export function validateIntroCalls(raw: unknown): Validated<MemoIntroCall[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return bad(MEMO_ERRORS.badCall);
  if (raw.length > MEMO_LIMITS.introCalls) return bad(MEMO_ERRORS.tooManyCalls);
  const out: MemoIntroCall[] = [];
  for (const c of raw) {
    if (!isObj(c)) return bad(MEMO_ERRORS.badCall);
    const label = typeof c.label === "string" ? c.label.trim() : "";
    if (!label || label.length > MEMO_LIMITS.citationLabel) return bad(MEMO_ERRORS.badCall);
    const call: MemoIntroCall = { label };
    if (c.date !== undefined && c.date !== null && c.date !== "") {
      if (!parseDateOnly(c.date)) return bad(MEMO_ERRORS.badDate);
      call.date = c.date as string;
    }
    if (c.url !== undefined && c.url !== null && c.url !== "") {
      const u = validateWebUrl(c.url);
      if (!u.ok) return u;
      call.url = u.value;
    }
    out.push(call);
  }
  return { ok: true, value: out };
}

/** Memo metadata (everything but the sections). Hand-written allowlist: unknown keys are ignored. */
export function validateMemoMeta(raw: unknown): Validated<MemoMetaValue> {
  if (!isObj(raw)) return bad(MEMO_ERRORS.title);
  const title = validateTitle(raw.title);
  if (!title.ok) return title;
  const companyId = typeof raw.companyId === "string" && raw.companyId.trim() ? raw.companyId.trim() : undefined;
  const pendingRaw = typeof raw.companyNamePending === "string" ? raw.companyNamePending.trim() : "";
  if (companyId && pendingRaw) return bad(MEMO_ERRORS.bothCompanies);
  if (pendingRaw.length > MEMO_LIMITS.title) return bad(MEMO_ERRORS.title);
  let source: MemoSource | null = null;
  if (raw.source !== undefined && raw.source !== null && raw.source !== "") {
    if (!(MEMO_SOURCES as readonly unknown[]).includes(raw.source)) return bad(MEMO_ERRORS.badSource);
    source = raw.source as MemoSource;
  }
  const tags = validateTags(raw.tags);
  if (!tags.ok) return tags;
  let introDate: Date | null = null;
  if (raw.introDate !== undefined && raw.introDate !== null && raw.introDate !== "") {
    introDate = parseDateOnly(raw.introDate);
    if (!introDate) return bad(MEMO_ERRORS.badDate);
  }
  let websiteUrl: string | null = null;
  if (raw.websiteUrl !== undefined && raw.websiteUrl !== null && raw.websiteUrl !== "") {
    const u = validateWebUrl(raw.websiteUrl);
    if (!u.ok) return u;
    websiteUrl = u.value;
  }
  const calls = validateIntroCalls(raw.introCalls);
  if (!calls.ok) return calls;
  return {
    ok: true,
    value: {
      title: title.value,
      companyId,
      companyNamePending: pendingRaw || undefined,
      source,
      tags: tags.value,
      introDate,
      websiteUrl,
      introCalls: calls.value,
    },
  };
}

/** Metadata plus sections: what Marge's memo_create and any one-shot creator sends. */
export function validateMemoInput(raw: unknown): Validated<MemoMetaValue & { sections: MemoSectionInput[] }> {
  const meta = validateMemoMeta(raw);
  if (!meta.ok) return meta;
  const sections = validateSections((raw as Record<string, unknown>).sections);
  if (!sections.ok) return sections;
  return { ok: true, value: { ...meta.value, sections: sections.value } };
}

// ── visibility (Q116, Q117) ───────────────────────────────────────────────────────────────

/** Part 40. The only definition of "who can read a memo". Pages, API routes and Marge all use it. */
export function memoVisibleWhere(userId: string): Prisma.MemoWhereInput {
  return { archivedAt: null, OR: [{ ownerId: userId }, { visibility: "TEAM" }] };
}
/** Q116-A: the owner, or any approved admin once the memo is shared with the team. */
export function canEditMemo(memo: { ownerId: string; visibility: string }, userId: string): boolean {
  return memo.ownerId === userId || memo.visibility === "TEAM";
}
/** Q117-A: visibility, share links, archive and company link stay with the owner. */
export const canManageMemo = (memo: { ownerId: string }, userId: string) => memo.ownerId === userId;

/** Hand-rolled so a stored Json column is never trusted as the right shape. */
export function readCitations(json: unknown): MemoCitation[] {
  if (!Array.isArray(json)) return [];
  const out: MemoCitation[] = [];
  for (const c of json) {
    const v = validateCitation(c);
    if (v.ok) out.push(v.value);
  }
  return out;
}
export function readIntroCalls(json: unknown): MemoIntroCall[] {
  const v = validateIntroCalls(Array.isArray(json) ? json.slice(0, MEMO_LIMITS.introCalls) : []);
  return v.ok ? v.value : [];
}

/** Companies a memo may link to: both stages (DILIGENCE and ACTIVE), but not a signup still pending approval (Q118-A). */
export const memoCompanyFilter: Prisma.CompanyWhereInput = {
  NOT: { createdBy: { status: "PENDING", approvalToken: null } },
};
