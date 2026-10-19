// Part 37 (WS108.1) — the one digest extraction path, shared by the paste
// composer (and, in WS109, Granola intake). Server only.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/db";
import { ORG_NAME } from "@/lib/org";
import { digestHtmlToPlain } from "@/lib/digest-html";
import { normalizeName, type Canonical } from "@/lib/board-reconcile";
import { MAX_OWNERS_PER_CARD } from "@/lib/board";

export const DIGEST_MODEL = "claude-sonnet-5-5";

// Sections sort by topic only; status ("closed", "waiting on") lives in the sentence.
// `guide` is what the model reads to place each item. Order is the email order.
export const SECTION_DEFS = [
  {
    id: "fund",
    heading: "Fund and LPs",
    guide:
      "DFS's own funds and the money going into them: LP conversations and fundraising, capital calls, fund vehicles (including funds DFS runs with a partner), fund documents and expense treatment, LP lists and one-pagers.",
  },
  {
    id: "portfolio",
    heading: "Portfolio and deals",
    guide:
      "Named companies DFS has invested in or is evaluating: performance, raises, due diligence, side letters, closings, SAFEs, tranches, founder inbounds.",
  },
  {
    id: "research",
    heading: "Research and programmes",
    guide:
      "DFS's own research, surveys, grants and partnerships not tied to one portfolio company: surveys, fieldwork, observatories, grant work, MOUs, funder and partner conversations.",
  },
  {
    id: "team",
    heading: "Team and tools",
    guide: "How DFS runs itself: internal tools, the website, costs, process changes the team needs to know about.",
  },
  {
    id: "news",
    heading: "Market news",
    guide:
      "Things that happened outside DFS with no DFS action attached: regulation, macro trends, ecosystem rounds, competitor news. Never anything a DFS person did or will do.",
  },
  {
    id: "travel",
    heading: "Travel, talks and events",
    guide:
      "Where DFS people are going, speaking or showing up: who, where, when and what for. What a trip produced goes in the topic section that owns it.",
  },
  {
    id: "life",
    heading: "Team life",
    guide:
      "Personal, non-work news about the team and the people close to them: a new baby, a birthday, a return from leave, a move, a renovation. Never work, including work travel and talks.",
  },
  { id: "riddle", heading: "Riddle of the Week", guide: "" },
];

const PAST_RIDDLES_IN_PROMPT = 8;

/** The slice of loadBoardContext() the extractor needs. */
export interface ExtractionContext {
  people: Canonical[];
  projects: Canonical[];
  openCards: { id: string; title: string; ownerIds: string[]; projectId: string | null }[];
}

export interface ExtractedItem {
  title: string;
  /** Part 38: everyone who owns the item (equal owners), as heard + matched id. */
  owners: { raw: string; id: string | null }[];
  projectRaw: string | null;
  projectId: string | null;
  dueDate: string | null; // YYYY-MM-DD
  existingCardId: string | null;
}

export interface ExtractedDigest {
  title: string;
  sections: { id: string; heading: string; content: string }[];
  items: ExtractedItem[];
}

export class DigestExtractionError extends Error {}

const nullableString = z.string().nullish().transform((v) => (v && v.trim() ? v.trim() : null));

const RawSchema = z.object({
  title: z.string().optional(),
  sections: z
    .array(
      z.object({
        id: z.string(),
        heading: z.string().optional(),
        content: z.string().nullish().transform((v) => v ?? ""),
      })
    )
    .optional()
    .default([]),
  items: z
    .array(
      z.object({
        title: z.string().min(1),
        owners: z
          .array(z.object({ raw: nullableString, id: nullableString }))
          .nullish()
          .transform((v) => v ?? []),
        // Legacy single-owner fields stay accepted (JC-MO-M): model drift, old prompts.
        ownerRaw: nullableString,
        ownerId: nullableString,
        projectRaw: nullableString,
        projectId: nullableString,
        dueDate: nullableString,
        existingCardId: nullableString,
      })
    )
    .optional()
    .default([]),
});

export interface PromptInput {
  notesText: string;
  meetingTitle?: string;
  meetingDate?: Date;
  attendees?: { name: string | null; email: string }[];
  ctx: ExtractionContext;
  weekOf: string;
  /** Riddle sections of past sent digests, newest first. */
  pastRiddles: string[];
}

const MAX_OPEN_CARDS_IN_PROMPT = 150;

export function buildPrompt(input: PromptInput): string {
  const { ctx, weekOf, pastRiddles } = input;
  const [lastRiddle] = pastRiddles;
  const noRepeat = pastRiddles.length
    ? `\nThe new riddle must be different from every past riddle below (no reworded versions of the same answer either):\n${pastRiddles.map((r) => `- "${r}"`).join("\n")}`
    : "";
  const riddleContext = lastRiddle
    ? `Last week's riddle was: "${lastRiddle}"\nFor the riddle section, first reveal the answer to last week's riddle, then pose a new original riddle. Format as plain text: "Last week's answer: [answer]\n\n[New riddle question]"${noRepeat}`
    : `For the riddle section, pose a fun, original riddle. Format as plain text: "[Riddle question]\n\n(Answer revealed next week)"`;

  const peopleLines = ctx.people.map((p) => `${p.id} | ${p.name} | ${p.aliases.join(", ")}`).join("\n") || "(none)";
  const projectLines = ctx.projects.map((p) => `${p.id} | ${p.name} | ${p.aliases.join(", ")}`).join("\n") || "(none)";
  const personName = new Map(ctx.people.map((p) => [p.id, p.name]));
  const projectName = new Map(ctx.projects.map((p) => [p.id, p.name]));
  const cardLines =
    ctx.openCards
      .slice(0, MAX_OPEN_CARDS_IN_PROMPT)
      .map(
        (c) =>
          `${c.id} | ${c.title} | ${c.ownerIds.map((o) => personName.get(o)).filter(Boolean).join(" & ") || "-"} | ${(c.projectId && projectName.get(c.projectId)) || "-"}`
      )
      .join("\n") || "(none)";

  const meetingLines = [
    input.meetingTitle ? `Meeting: ${input.meetingTitle}` : null,
    input.meetingDate ? `Meeting date: ${input.meetingDate.toISOString().slice(0, 10)}` : null,
    input.attendees?.length
      ? `Attendees: ${input.attendees.map((a) => a.name ?? a.email).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are generating the ${ORG_NAME} weekly digest from raw meeting notes.

Today is ${weekOf}. Given the meeting notes below, produce a JSON object with:
- "title": a digest title like "${ORG_NAME} Weekly — Week of ${weekOf}"
- "sections": array of exactly ${SECTION_DEFS.length} objects, one per section, each with "id", "heading", and "content" (plain text, 1-4 short paragraphs). Leave "content" as an empty string unless something in the notes clearly belongs there.
- "items": array of action items extracted from the notes. For each action item return "title" (without the owner's name, e.g. "Follow up with Acme re: term sheet"), "owners" (an array of everyone who owns the item, each {"raw": the name as said in the notes, e.g. "Jane Founder", "id": an id from PEOPLE only if you are confident it is the same person, else null; never invent ids}; owners are equal, so list every owner, at most ${MAX_OWNERS_PER_CARD}, or [] if nobody was named; if several people share one action item, return ONE item listing all of them and do not split it), "projectRaw"/"projectId" likewise from PROJECTS, "dueDate" (YYYY-MM-DD or null), and "existingCardId" if the item restates an OPEN CARD (an id from OPEN CARDS, else null). The board's spellings are always correct; the notes may misspell names.

PEOPLE (id | name | aliases):
${peopleLines}

PROJECTS (id | name | aliases):
${projectLines}

OPEN CARDS (id | title | owner | project):
${cardLines}

Sections must be in this exact order with these exact ids and headings. What belongs in each:
${SECTION_DEFS.map((s) => `- id: "${s.id}", heading: "${s.heading}"${s.guide ? ` — ${s.guide}` : ""}`).join("\n")}

Place every fact from the notes in exactly one section. To choose, take the first question that is a yes:
1. Is it personal and not about work? Team life.
2. Is it about where someone is going, speaking or attending (the trip, talk or event itself)? Travel, talks and events.
3. Is it about the mechanics of a DFS fund, its LPs or its expenses? Fund and LPs.
4. Is it about a named company DFS has invested in or is evaluating? Portfolio and deals.
5. Is it DFS's own research, survey, grant or partnership? Research and programmes.
6. Is it about how DFS runs internally? Team and tools.
7. Did it happen outside DFS, with no DFS action attached? Market news.
Never repeat a fact in a second section. Never move an item into a section it does not fit just to fill it; an empty section is fine and is left out of the email. Only call something done if the notes say it is done.

Leave out entirely: travel logistics (flights, hotels, what is covered), scheduling of internal calls, calendar or tool-invite housekeeping, who needs briefing before an event, next-step lists (action items go in "items", not in sections), and anything with no outcome or decision (e.g. "a list was reviewed").

Voice: write like a colleague catching the team up, not a report. Plain sentences, one fact per sentence. Refer to people by name every time; never use he, she, him or her for anyone. Call the firm ${ORG_NAME}, even where the notes use an older name. Lead with what moved, then why it matters in half a sentence. No filler, no praise words, no claims the notes do not support. Keep the warmth for Team life.

${riddleContext}

Return only valid JSON, no markdown fences.
${meetingLines ? `\n${meetingLines}\n` : ""}
Meeting notes:
${input.notesText}

Before you return the JSON, check every section: each fact is in the one section the tie-break picks, nothing from the leave-out list is included, and no sentence uses he, she, him or her for a person (use the name).`;
}

/** The notes still say "DFS Lab"; the brand is DFS (2026-10-15). Model output can't be trusted to rename it. */
function withOrgName(text: string): string {
  return ORG_NAME === "DFS Lab" ? text : text.replace(/\bDFS Lab\b/g, ORG_NAME);
}

/** Drops nameless entries, nulls unknown ids, dedupes by normalized name, caps at the max. */
function normalizeOwners(
  owners: { raw: string | null; id: string | null }[],
  personIds: Set<string>
): { raw: string; id: string | null }[] {
  const out: { raw: string; id: string | null }[] = [];
  const seen = new Set<string>();
  for (const o of owners) {
    if (!o.raw) continue;
    const key = normalizeName(o.raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ raw: o.raw, id: o.id && personIds.has(o.id) ? o.id : null });
    if (out.length >= MAX_OWNERS_PER_CARD) break;
  }
  return out;
}

/** Validates Claude's text output. Unknown ids are nulled (JC-TB-H). Throws on malformed output. */
export function parseExtraction(raw: string, ctx: ExtractionContext, fallbackTitle: string): ExtractedDigest {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new DigestExtractionError("Failed to parse AI response");
  }
  const parsed = RawSchema.safeParse(json);
  if (!parsed.success) throw new DigestExtractionError("AI response had an unexpected shape");

  const personIds = new Set(ctx.people.map((p) => p.id));
  const projectIds = new Set(ctx.projects.map((p) => p.id));
  const cardIds = new Set(ctx.openCards.map((c) => c.id));

  const sections = SECTION_DEFS.map((def) => {
    const found = parsed.data.sections.find((s) => s.id === def.id);
    return { id: def.id, heading: def.heading, content: withOrgName(found?.content ?? "") };
  });

  const items: ExtractedItem[] = parsed.data.items.map((i) => ({
    title: i.title.trim(),
    owners: normalizeOwners(i.owners.length ? i.owners : i.ownerRaw ? [{ raw: i.ownerRaw, id: i.ownerId }] : [], personIds),
    projectRaw: i.projectRaw,
    projectId: i.projectId && projectIds.has(i.projectId) ? i.projectId : null,
    dueDate: i.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(i.dueDate) ? i.dueDate : null,
    existingCardId: i.existingCardId && cardIds.has(i.existingCardId) ? i.existingCardId : null,
  }));

  return { title: parsed.data.title?.trim() || fallbackTitle, sections, items };
}

/**
 * Just the riddle question from a stored riddle section: drops the previous week's
 * answer and the "answer next week" footer, so the model can't confuse old answers.
 */
export function riddleQuestion(plain: string): string {
  const marker = plain.match(/(?:here is )?this week's riddle:\s*/i);
  const text =
    marker?.index !== undefined
      ? plain.slice(marker.index + marker[0].length)
      : plain
          .split(/\n\s*\n/)
          .filter((p) => !/^\s*last week's answer/i.test(p))
          .join("\n\n");
  return text.replace(/\(answer revealed next week\)/i, "").trim();
}

/** Riddles the team actually received (sent digests only), newest first. */
async function pastRiddleContents(): Promise<string[]> {
  try {
    const rows = await db.weeklyDigest.findMany({
      where: { sentAt: { not: null } },
      orderBy: { weekOf: "desc" },
      take: PAST_RIDDLES_IN_PROMPT,
      select: { sections: true },
    });
    return rows.flatMap((r) => {
      const content = (r.sections as { id: string; content: string }[]).find((s) => s.id === "riddle")?.content;
      const plain = content ? riddleQuestion(digestHtmlToPlain(content)) : "";
      return plain ? [plain] : [];
    });
  } catch {
    return [];
  }
}

export async function extractDigest(input: {
  notesText: string;
  meetingTitle?: string;
  meetingDate?: Date;
  attendees?: { name: string | null; email: string }[];
  ctx: ExtractionContext;
}): Promise<ExtractedDigest> {
  const today = new Date();
  const weekOf = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const prompt = buildPrompt({ ...input, weekOf, pastRiddles: await pastRiddleContents() });
  const fallbackTitle = `${ORG_NAME} Weekly — Week of ${weekOf}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // One retry on malformed output (nobody is watching the composer on automated intake).
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await anthropic.messages.create(
      {
        model: DIGEST_MODEL,
        // Thinking is on by default on this model and counts toward max_tokens.
        max_tokens: 16000,
        output_config: { effort: "medium" },
        messages: [{ role: "user", content: prompt }],
      },
      { maxRetries: 3 }
    );
    // Thinking blocks come first; the JSON is in the text block.
    const raw = message.content.find((b) => b.type === "text")?.text ?? "";
    try {
      return parseExtraction(raw, input.ctx, fallbackTitle);
    } catch (err) {
      lastErr = err;
      console.error("Digest extraction: malformed AI response (attempt " + (attempt + 1) + ")");
    }
  }
  throw lastErr instanceof Error ? lastErr : new DigestExtractionError("Failed to parse AI response");
}
