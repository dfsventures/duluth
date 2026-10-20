// Part 41 (WS133). One Notion page (.md export) -> a memo draft for importMemo. Pure: no database,
// no file access. Real export data never enters the repo: tests use synthetic pages (Acme, Globex).
// Warnings are counts and field names only; they never contain body text.
import {
  MEMO_LIMITS,
  MEMO_SOURCES,
  slugifyKey,
  validateIntroCalls,
  validateMemoMeta,
  validateSections,
  validateWebUrl,
  parseDateOnly,
  type MemoCitation,
  type MemoDecision,
  type MemoIntroCall,
  type MemoSectionInput,
  type MemoSource,
  type MemoStatus,
} from "@/lib/memos";

export const NOTION_IMPORT_MIN_BODY = 200; // JC-NI-B: non-whitespace characters after the property block

/** Template key <- normalised Notion headings (JC-NI-D). Partner and company names never appear here. */
export const NOTION_HEADING_ALIASES: Record<string, string[]> = {
  "open-questions": ["open questions"],
  "company-overview": ["company overview", "overview"],
  product: ["product", "product and solution", "product overview", "product and technology"],
  "market-opportunity": ["market opportunity", "market sizing", "market"],
  traction: ["traction", "traction and roadmap"],
  "business-model": ["business model", "business model and unit economics"],
  "go-to-market-hook": ["go to market", "go to market strategy", "go to market hook", "go to market strategy hook"],
  "competition-status-quo": ["competition", "competitive landscape", "competition status quo"],
  team: ["team", "founder and team", "founders"],
  "round-investment-terms": [
    "ask",
    "round",
    "deal",
    "funding",
    "fundraising",
    "funding and use of funds",
    "fundraising and use of funds",
    "round investment terms",
  ],
  "key-risks": [
    "key risks",
    "risks",
    "future concerns",
    "risks and considerations",
    "key risks future concerns",
    "key risks and open questions", // Q128-A
    "risks concerns and open questions", // Q128-A
  ],
  "exit-opportunities": ["exit opportunities"],
};

/** JC-NI-E: internal-view headings, matched on the normalised title and kept out of share links by default. */
export const NOTION_INTERNAL_HEADINGS: RegExp[] = [
  /^team thoughts$/,
  /^internal view/,
  /^investment decision$/,
  /^dfs notes$/,
  /^due diligence/,
  /^potential .+ integration$/, // a recurring heading names a partner fund; matched without the name
];

export const NOTION_DECISIONS: Record<string, MemoDecision> = {
  "in progress": "IN_PROGRESS",
  memo: "MEMO",
  invested: "INVESTED",
  later: "LATER",
  passed: "PASSED",
};

const ALIAS_LOOKUP = new Map<string, string>();
for (const [key, aliases] of Object.entries(NOTION_HEADING_ALIASES)) for (const a of aliases) ALIAS_LOOKUP.set(a, key);

export interface NotionMemoDraft {
  notionId: string; // 32 lowercase hex from the file name
  title: string; // from "# ", at most 200
  decision: MemoDecision | null;
  source: MemoSource | null;
  tags: string[];
  introDate: string | null; // YYYY-MM-DD
  lastEdited: Date | null; // JC-NI-I, 12:00 UTC
  websiteUrl: string | null;
  introCalls: MemoIntroCall[];
  sections: (MemoSectionInput & { includeInShare: boolean })[];
  deck: { kind: "url"; url: string } | { kind: "file"; path: string } | null;
  splitMode: SplitMode; // for the dry-run table only
  warnings: string[]; // shown in the dry run; never contain body text
}
export type NotionParse =
  | { kind: "memo"; draft: NotionMemoDraft }
  | { kind: "stub"; notionId: string; title: string }
  | { kind: "error"; notionId: string | null; title: string; error: string };

/** Q127-A. No Decision on the page: Draft, the same default a new memo gets. */
export function statusForDecision(decision: MemoDecision | null): MemoStatus {
  if (decision === "INVESTED" || decision === "PASSED" || decision === "LATER") return "FINAL";
  if (decision === "MEMO" || decision === "IN_PROGRESS") return "IN_REVIEW";
  return "DRAFT";
}

// ── property block ────────────────────────────────────────────────────────────────────────

const PROPERTY_KEYS = ["Tags", "Decision", "Intro Date", "Deck", "Intro Call Notes", "Last Edit", "Source", "URL"];
const PROPERTY_LINE = new RegExp(`^(${PROPERTY_KEYS.join("|")}):[ \\t]*(.*)$`);

/**
 * The property block: `Key: value` lines from the first non-blank line to the first blank line. A line that
 * does not start with a known key continues the previous property (joined with "\n"). `bodyStart` is the
 * index of the first line after the block's blank line (the first line when there is no block).
 */
export function readPropertyBlock(lines: string[]): { props: Record<string, string>; bodyStart: number } {
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const props: Record<string, string> = {};
  if (i >= lines.length || !PROPERTY_LINE.test(lines[i])) return { props, bodyStart: i };
  let last: string | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") break;
    const m = PROPERTY_LINE.exec(line);
    if (m) {
      last = m[1];
      props[last] = m[2].trim();
    } else if (last) {
      props[last] = `${props[last]}\n${line.trim()}`.replace(/^\n/, "");
    }
  }
  while (i < lines.length && lines[i].trim() === "") i++;
  return { props, bodyStart: i };
}

// ── dates, sources, intro calls ───────────────────────────────────────────────────────────

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "January 26, 2026" (optionally followed by a time or a range) -> "2026-01-26"; null when absent or not a real date. */
export function parseNotionDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /^\s*([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(raw);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const idx = MONTHS.findIndex((x) => x === name || (name.length === 3 && x.startsWith(name)) || (name === "sept" && x === "september"));
  if (idx < 0) return null;
  const iso = `${m[3]}-${String(idx + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return parseDateOnly(iso) ? iso : null;
}

/** JC-NI-M. Exact (case-insensitive) match, else anything containing the word "event" -> "Partner event", else null with a warning. */
export function mapSource(raw: string | undefined): { source: MemoSource | null; warning?: string } {
  const v = (raw ?? "").trim();
  if (!v) return { source: null };
  const exact = MEMO_SOURCES.find((s) => s.toLowerCase() === v.toLowerCase());
  if (exact) return { source: exact };
  if (/\bevent\b/i.test(v)) return { source: "Partner event" };
  return { source: null, warning: "Source not recognised; left empty." };
}

const DATE_IN_LABEL = "[A-Za-z]{3,9}\\.? \\d{1,2}, \\d{4}";

/** JC-NI-P. Split on new lines and " | "; first http(s) URL per part is the link, text before it the label. */
export function parseIntroCalls(raw: string | undefined, introDate: string | null): MemoIntroCall[] {
  const parts = (raw ?? "")
    .split(/\n| \| /)
    .map((p) => p.trim())
    .filter(Boolean);
  const calls: MemoIntroCall[] = [];
  let usedIntroDate = false;
  parts.forEach((part, idx) => {
    const um = /https?:\/\/[^\s|]+/.exec(part);
    let url: string | undefined;
    let before = part;
    if (um) {
      url = um[0].replace(/[.,;)\]]+$/, "");
      before = part.slice(0, um.index);
    }
    before = before.trim().replace(/[:\s]+$/, "").trim();
    let date: string | undefined;
    const paren = new RegExp(`\\s*\\((${DATE_IN_LABEL})\\)$`).exec(before);
    const dash = new RegExp(`\\s*[—–-]\\s*(${DATE_IN_LABEL})$`).exec(before);
    const hit = paren ?? dash;
    if (hit) {
      date = parseNotionDate(hit[1]) ?? undefined;
      if (date) before = before.slice(0, hit.index).trim();
    }
    let label = before;
    if (!label) {
      label = parts.length > 1 ? `Intro call ${idx + 1}` : "Intro call";
      if (!date && url && introDate && !usedIntroDate) date = introDate;
      if (url) usedIntroDate = true;
    }
    const call: MemoIntroCall = { label: label.slice(0, MEMO_LIMITS.citationLabel) };
    if (date) call.date = date;
    if (url) call.url = url;
    calls.push(call);
  });
  return calls;
}

// ── body cleaning (JC-NI-F) ───────────────────────────────────────────────────────────────

const FENCE = /^\s{0,3}(```|~~~)/;
const NOTION_IMG = /<img\b[^>]*\bsrc\s*=\s*["']notion:\/\/[^"']*["'][^>]*>/gi;
const HTML_IMG = /<img\b[^>]*>/gi;
const MD_IMAGE = /!\[([^\]]*)\]\((?:<([^>]*)>|([^)]*))\)/g;
const MD_LINK = /\[([^\]]*)\]\((?:<([^>]*)>|((?:[^()\s]|\([^)]*\))*))(?:\s+"[^"]*")?\)/g;
const SAFE_TARGET = /^(https?:|mailto:|#)/i;

function baseName(path: string): string {
  const last = path.split(/[\\/]/).filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
const placeholder = (what: string) => `[Image not imported: ${what.replace(/[[\]]/g, "").trim() || "image"}]`;

function cleanLine(line: string): string {
  let l = line.replace(NOTION_IMG, "");
  l = l.replace(HTML_IMG, (tag) => {
    const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    return placeholder(alt || baseName(src));
  });
  l = l.replace(MD_IMAGE, (_m, alt: string, a: string | undefined, b: string | undefined) => placeholder(alt || baseName(a ?? b ?? "")));
  l = l.replace(MD_LINK, (m, text: string, a: string | undefined, b: string | undefined) => {
    const target = (a ?? b ?? "").trim();
    if (SAFE_TARGET.test(target)) return m;
    return `${text.trim() || "File"} (file not imported)`;
  });
  return l;
}

/** Callouts -> blockquotes, Notion images dropped, other images and relative links replaced, leftover HTML counted. */
export function cleanNotionBody(body: string): { markdown: string; warnings: string[] } {
  const out: string[] = [];
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let fence = false;
  let aside: string[] | null = null;
  let depth = 0;
  let leftoverHtml = 0;

  const push = (line: string) => {
    if (!fence) {
      const probe = line.replace(/`[^`]*`/g, "");
      const tags = probe.match(/<\/?[a-zA-Z][^>\n]*>/g) ?? [];
      leftoverHtml += tags.filter((t) => !/^<(https?:|mailto:)/i.test(t)).length;
    }
    out.push(line);
  };
  const flushAside = (inner: string[]) => {
    const cleaned: string[] = [];
    for (const l of inner) {
      const c = cleanLine(l);
      if (c.trim() === "" && l.trim() !== "") continue; // a line that was only a dropped image
      cleaned.push(c);
    }
    while (cleaned.length && cleaned[0].trim() === "") cleaned.shift();
    while (cleaned.length && cleaned[cleaned.length - 1].trim() === "") cleaned.pop();
    const indents = cleaned.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].replace(/\t/g, "    ").length);
    const strip = indents.length ? Math.min(...indents) : 0;
    if (out.length && out[out.length - 1].trim() !== "") out.push("");
    for (const l of cleaned) {
      const text = l.trim() === "" ? "" : stripIndent(l, strip);
      push(text === "" ? ">" : `> ${text}`);
    }
    out.push("");
  };

  for (const raw of lines) {
    const t = raw.trim();
    if (aside) {
      if (/^<aside\b[^>]*>$/i.test(t)) depth++;
      if (t === "</aside>") {
        if (depth > 0) depth--;
        else {
          flushAside(aside);
          aside = null;
          continue;
        }
      }
      aside.push(raw);
      continue;
    }
    if (!fence && /^<aside\b[^>]*>$/i.test(t)) {
      aside = [];
      depth = 0;
      continue;
    }
    if (FENCE.test(raw)) fence = !fence;
    if (fence || FENCE.test(raw)) {
      push(raw);
      continue;
    }
    const c = cleanLine(raw);
    if (c.trim() === "" && raw.trim() !== "") continue;
    push(c);
  }
  if (aside) flushAside(aside); // an unclosed callout still keeps its text

  const warnings: string[] = [];
  if (leftoverHtml) warnings.push(`Raw HTML left in the body (${leftoverHtml} tag${leftoverHtml === 1 ? "" : "s"}); it will show as text.`);
  return { markdown: out.join("\n"), warnings };
}

function stripIndent(line: string, width: number): string {
  let n = 0;
  let i = 0;
  while (i < line.length && n < width && (line[i] === " " || line[i] === "\t")) {
    n += line[i] === "\t" ? 4 : 1;
    i++;
  }
  return line.slice(i);
}

// ── headings, sections, keys (JC-NI-C, JC-NI-D) ───────────────────────────────────────────

/** lowercase; bold, trailing colon, a leading "The " and a trailing "(...)" removed; "&" -> "and"; punctuation -> spaces. */
export function normalizeHeading(title: string): string {
  let t = title.toLowerCase().replace(/\*\*|__/g, "").trim();
  t = t.replace(/[:\s]+$/, "");
  t = t.replace(/\s*\([^)]*\)\s*$/, "");
  t = t.replace(/&/g, " and ");
  t = t.replace(/^the\s+/, "");
  t = t.replace(/[^a-z0-9]+/g, " ").trim();
  return t.replace(/\s+/g, " ");
}

const ATX = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const cleanTitle = (t: string) => t.replace(/\*\*|__/g, "").replace(/\s+/g, " ").trim();
const BOLD_LINE = /^\*\*([^*\n]{1,80})\*\*\s*$/;

interface Heading {
  line: number;
  level: number;
  title: string;
}
function findHeadings(lines: string[]): Heading[] {
  const out: Heading[] = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (FENCE.test(l)) {
      fence = !fence;
      return;
    }
    if (fence) return;
    const m = ATX.exec(l);
    if (m) out.push({ line: i, level: m[1].length, title: cleanTitle(m[2]) });
  });
  return out;
}

function trimRules(lines: string[]): string {
  const a = [...lines];
  const isRule = (l: string) => /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(l);
  for (;;) {
    while (a.length && a[0].trim() === "") a.shift();
    while (a.length && a[a.length - 1].trim() === "") a.pop();
    if (a.length && isRule(a[0])) a.shift();
    else if (a.length && isRule(a[a.length - 1])) a.pop();
    else break;
  }
  return a.join("\n");
}

const sectionTitle = (t: string) => (t || "Section").slice(0, MEMO_LIMITS.sectionTitle).trim();

type Split = { title: string; markdown: string; preamble: boolean }[];
/** How a page was split, for the dry run: "###" (the heading level), "bold" (bold-line fallback) or "single". */
export type SplitMode = string;

/** JC-NI-C. Split cleaned markdown into sections at the inferred heading level. */
export function splitSections(markdown: string): Split {
  return splitWithMode(markdown).sections;
}

function splitWithMode(markdown: string): { sections: Split; mode: SplitMode } {
  const lines = markdown.split("\n");
  const headings = findHeadings(lines);

  // The split level: the one with most alias-matching headings (ties: more headings, then shallower).
  const stats = new Map<number, { matches: number; total: number }>();
  for (const h of headings) {
    const s = stats.get(h.level) ?? { matches: 0, total: 0 };
    s.total++;
    if (ALIAS_LOOKUP.has(normalizeHeading(h.title))) s.matches++;
    stats.set(h.level, s);
  }
  let level = 0;
  for (const [lv, s] of [...stats.entries()].sort((a, b) => a[0] - b[0])) {
    const best = stats.get(level);
    if (!best || s.matches > best.matches || (s.matches === best.matches && s.total > best.total)) level = lv;
  }

  const starts = level
    ? headings.filter((h) => h.level <= level && !(h.level === level && /:\s*$/.test(h.title)))
    : [];

  if (starts.length) {
    const result: Split = [];
    const pre = trimRules(lines.slice(0, starts[0].line));
    if (pre.trim()) result.push({ title: "Introduction", markdown: pre, preamble: true });
    starts.forEach((h, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].line : lines.length;
      result.push({ title: sectionTitle(h.title), markdown: trimRules(lines.slice(h.line + 1, end)), preamble: false });
    });
    return { sections: result, mode: "#".repeat(level) };
  }

  // No usable ATX headings: bold-only lines after a blank line, when there are at least two.
  const bold: { line: number; title: string }[] = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (FENCE.test(l)) fence = !fence;
    if (fence) return;
    const m = BOLD_LINE.exec(l.trim());
    if (m && (i === 0 || lines[i - 1].trim() === "")) bold.push({ line: i, title: cleanTitle(m[1]) });
  });
  if (bold.length >= 2) {
    const result: Split = [];
    const pre = trimRules(lines.slice(0, bold[0].line));
    if (pre.trim()) result.push({ title: "Introduction", markdown: pre, preamble: true });
    bold.forEach((h, i) => {
      const end = i + 1 < bold.length ? bold[i + 1].line : lines.length;
      result.push({ title: sectionTitle(h.title), markdown: trimRules(lines.slice(h.line + 1, end)), preamble: false });
    });
    return { sections: result, mode: "bold" };
  }
  return { sections: [{ title: "Memo", markdown: trimRules(lines), preamble: false }], mode: "single" };
}

function uniqueKey(base: string, used: Set<string>): string {
  const b = base || "section";
  let key = b;
  for (let n = 2; used.has(key); n++) {
    const suffix = `-${n}`;
    key = `${b.slice(0, MEMO_LIMITS.keyLength - suffix.length).replace(/-+$/, "")}${suffix}`;
  }
  used.add(key);
  return key;
}

/** JC-NI-D. Alias match -> the template key (the section keeps its own title); else a slug; repeats get -2, -3. */
export function keyForHeading(title: string, used: Set<string>): { key: string; matched: boolean } {
  const aliasKey = ALIAS_LOOKUP.get(normalizeHeading(title));
  if (aliasKey) return { key: uniqueKey(aliasKey, used), matched: true };
  return { key: uniqueKey(slugifyKey(title), used), matched: false };
}

// ── limits (JC-NI-G) ──────────────────────────────────────────────────────────────────────

const SPLIT_AT = 19_900;
function splitLong(markdown: string): string[] {
  if (markdown.length <= MEMO_LIMITS.sectionChars) return [markdown];
  const parts: string[] = [];
  let rest = markdown;
  while (rest.length > MEMO_LIMITS.sectionChars) {
    const window = rest.slice(0, SPLIT_AT);
    let cut = window.lastIndexOf("\n\n");
    if (cut <= 0) cut = window.lastIndexOf("\n");
    if (cut <= 0) cut = SPLIT_AT;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).replace(/^\s*\n/, "");
  }
  if (rest.trim()) parts.push(rest.trim());
  return parts;
}

// ── a whole page ──────────────────────────────────────────────────────────────────────────

const ID_IN_NAME = /(?:^|[\s_-])([0-9a-f]{32})\.md$/i;

function shareDefault(title: string, aliasKey: string | null, preamble: boolean): boolean {
  if (preamble) return false;
  if (aliasKey === "open-questions") return false;
  const n = normalizeHeading(title);
  if (/question/.test(n)) return false;
  return !NOTION_INTERNAL_HEADINGS.some((re) => re.test(n));
}

export function parseNotionPage(fileName: string, text: string): NotionParse {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const idMatch = ID_IN_NAME.exec(base);
  const fallbackTitle = base.replace(/\s*[0-9a-f]{32}\.md$/i, "").replace(/\.md$/i, "").trim() || "Untitled";
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const first = lines.findIndex((l) => l.trim() !== "");
  const h1 = first >= 0 ? /^#[ \t]+(.+?)\s*$/.exec(lines[first]) : null;
  const title = (h1 ? cleanTitle(h1[1]) : fallbackTitle) || fallbackTitle;
  if (!idMatch) return { kind: "error", notionId: null, title, error: "The file name has no 32-character Notion id." };
  const notionId = idMatch[1].toLowerCase();

  const afterTitle = h1 ? first + 1 : Math.max(first, 0);
  const { props, bodyStart } = readPropertyBlock(lines.slice(afterTitle));
  const body = lines.slice(afterTitle + bodyStart).join("\n");
  if (body.replace(/\s+/g, "").length < NOTION_IMPORT_MIN_BODY) return { kind: "stub", notionId, title };

  const warnings: string[] = [];

  const decRaw = props["Decision"]?.trim();
  let decision: MemoDecision | null = null;
  if (decRaw) {
    decision = NOTION_DECISIONS[decRaw.toLowerCase()] ?? null;
    if (!decision) warnings.push("Decision not recognised; left empty.");
  }
  const src = mapSource(props["Source"]);
  if (src.warning) warnings.push(src.warning);

  const tags = (props["Tags"] ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const introDate = parseNotionDate(props["Intro Date"]);
  if (props["Intro Date"] && !introDate) warnings.push("Intro date not understood; left empty.");
  const editDate = parseNotionDate(props["Last Edit"]);
  if (props["Last Edit"] && !editDate) warnings.push("Last edit date not understood; the import time is used.");
  const lastEdited = editDate ? new Date(`${editDate}T12:00:00.000Z`) : null;

  let websiteUrl: string | null = null;
  const urlRaw = props["URL"]?.trim();
  if (urlRaw) {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(urlRaw) ? urlRaw : `https://${urlRaw}`;
    const v = validateWebUrl(withScheme);
    if (v.ok) websiteUrl = v.value;
    else warnings.push("Website is not a valid link; left empty.");
  }

  let introCalls = parseIntroCalls(props["Intro Call Notes"], introDate);
  const callCheck = validateIntroCalls(introCalls);
  if (!callCheck.ok) {
    // A link that does not validate is dropped; the label stays.
    introCalls = introCalls.map(({ url: _u, ...c }) => {
      void _u;
      return c;
    });
    warnings.push("An intro call link was not valid and was dropped.");
  }

  let deck: NotionMemoDraft["deck"] = null;
  const deckRaw = props["Deck"]?.trim();
  if (deckRaw) {
    const um = /^https?:\/\/\S+/i.exec(deckRaw);
    if (um) {
      const v = validateWebUrl(um[0].replace(/[,;]+$/, ""));
      if (v.ok) deck = { kind: "url", url: v.value };
      else warnings.push("Deck link is not valid; left out.");
    } else deck = { kind: "file", path: deckRaw };
  }

  const cleaned = cleanNotionBody(body);
  warnings.push(...cleaned.warnings);

  // Split, key, share-default, then split any over-long section.
  const used = new Set<string>();
  const sections: (MemoSectionInput & { includeInShare: boolean })[] = [];
  const split = splitWithMode(cleaned.markdown);
  for (const s of split.sections) {
    const { key, matched } = keyForHeading(s.title, used);
    const aliasKey = matched ? (ALIAS_LOOKUP.get(normalizeHeading(s.title)) ?? null) : null;
    const includeInShare = shareDefault(s.title, aliasKey, s.preamble);
    const parts = splitLong(s.markdown);
    parts.forEach((md, i) => {
      if (i === 0) {
        sections.push({ key, title: s.title, markdown: md, citations: [], includeInShare });
        return;
      }
      const suffix = ` (continued ${i + 1})`;
      const t = `${s.title.slice(0, MEMO_LIMITS.sectionTitle - suffix.length).trim()}${suffix}`;
      sections.push({ key: uniqueKey(slugifyKey(`${s.title} continued ${i + 1}`), used), title: t, markdown: md, citations: [], includeInShare });
    });
  }

  if (deck?.kind === "url" && sections.length) {
    const cite: MemoCitation = { label: "Deck", kind: "deck", url: deck.url };
    sections[0].citations = [cite];
  }

  const draft: NotionMemoDraft = {
    notionId,
    title,
    decision,
    source: src.source,
    tags,
    introDate,
    lastEdited,
    websiteUrl,
    introCalls,
    sections,
    deck,
    splitMode: split.mode,
    warnings,
  };

  // The same verdict as the web and Marge: validateSections, then validateMemoMeta (without decision).
  const sv = validateSections(draft.sections);
  if (!sv.ok) return { kind: "error", notionId, title, error: sv.error };
  const mv = validateMemoMeta({
    title: draft.title,
    source: draft.source,
    tags: draft.tags,
    introDate: draft.introDate,
    websiteUrl: draft.websiteUrl,
    introCalls: draft.introCalls,
  });
  if (!mv.ok) return { kind: "error", notionId, title, error: mv.error };
  return { kind: "memo", draft };
}

