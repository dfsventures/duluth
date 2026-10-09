// Part 37 (WS108.1) — the one digest extraction path, shared by the paste
// composer (and, in WS109, Granola intake). Server only.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/db";
import { ORG_NAME } from "@/lib/org";
import { digestHtmlToPlain } from "@/lib/digest-html";
import type { Canonical } from "@/lib/board-reconcile";

export const DIGEST_MODEL = "claude-sonnet-4-6"; // unchanged from the original generate route

export const SECTION_DEFS = [
  { id: "projects", heading: "Running Projects" },
  { id: "news", heading: "Latest Relevant News" },
  { id: "done", heading: "Things That Got Done Last Week" },
  { id: "portfolio", heading: "Portfolio Company Updates" },
  { id: "personal", heading: "Personal / Fun Team Updates" },
  { id: "riddle", heading: "Riddle of the Week" },
];

/** The slice of loadBoardContext() the extractor needs. */
export interface ExtractionContext {
  people: Canonical[];
  projects: Canonical[];
  openCards: { id: string; title: string; ownerId: string | null; projectId: string | null }[];
}

export interface ExtractedItem {
  title: string;
  ownerRaw: string | null;
  ownerId: string | null;
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
  lastRiddle: string | null;
}

const MAX_OPEN_CARDS_IN_PROMPT = 150;

export function buildPrompt(input: PromptInput): string {
  const { ctx, weekOf, lastRiddle } = input;
  const riddleContext = lastRiddle
    ? `\nLast week's riddle section was: "${lastRiddle}"\nFor the riddle section, first reveal the answer to last week's riddle, then pose a new original riddle. Format as plain text: "Last week's answer: [answer]\n\n[New riddle question]"`
    : `\nFor the riddle section, pose a fun, original riddle. Format as plain text: "[Riddle question]\n\n(Answer revealed next week)"`;

  const peopleLines = ctx.people.map((p) => `${p.id} | ${p.name} | ${p.aliases.join(", ")}`).join("\n") || "(none)";
  const projectLines = ctx.projects.map((p) => `${p.id} | ${p.name} | ${p.aliases.join(", ")}`).join("\n") || "(none)";
  const personName = new Map(ctx.people.map((p) => [p.id, p.name]));
  const projectName = new Map(ctx.projects.map((p) => [p.id, p.name]));
  const cardLines =
    ctx.openCards
      .slice(0, MAX_OPEN_CARDS_IN_PROMPT)
      .map(
        (c) =>
          `${c.id} | ${c.title} | ${(c.ownerId && personName.get(c.ownerId)) || "-"} | ${(c.projectId && projectName.get(c.projectId)) || "-"}`
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
- "sections": array of exactly 6 objects, one per section, each with "id", "heading", and "content" (plain text, 1-4 short paragraphs). Leave "content" as an empty string if there is nothing relevant from the notes.
- "items": array of action items extracted from the notes. For each action item return "title" (without the owner's name, e.g. "Follow up with Acme re: term sheet"), "ownerRaw" (the name as said in the notes, e.g. "Jane Founder", or null), "ownerId" (an id from PEOPLE only if you are confident it is the same person, else null; never invent ids), "projectRaw"/"projectId" likewise from PROJECTS, "dueDate" (YYYY-MM-DD or null), and "existingCardId" if the item restates an OPEN CARD (an id from OPEN CARDS, else null). The board's spellings are always correct; the notes may misspell names.

PEOPLE (id | name | aliases):
${peopleLines}

PROJECTS (id | name | aliases):
${projectLines}

OPEN CARDS (id | title | owner | project):
${cardLines}

Sections must be in this exact order with these exact ids and headings:
${SECTION_DEFS.map((s) => `- id: "${s.id}", heading: "${s.heading}"`).join("\n")}

The first 5 sections should be populated from the meeting notes.
${riddleContext}

Return only valid JSON, no markdown fences.
${meetingLines ? `\n${meetingLines}\n` : ""}
Meeting notes:
${input.notesText}`;
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
    return { id: def.id, heading: def.heading, content: found?.content ?? "" };
  });

  const items: ExtractedItem[] = parsed.data.items.map((i) => ({
    title: i.title.trim(),
    ownerRaw: i.ownerRaw,
    ownerId: i.ownerId && personIds.has(i.ownerId) ? i.ownerId : null,
    projectRaw: i.projectRaw,
    projectId: i.projectId && projectIds.has(i.projectId) ? i.projectId : null,
    dueDate: i.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(i.dueDate) ? i.dueDate : null,
    existingCardId: i.existingCardId && cardIds.has(i.existingCardId) ? i.existingCardId : null,
  }));

  return { title: parsed.data.title?.trim() || fallbackTitle, sections, items };
}

async function lastRiddleContent(): Promise<string | null> {
  try {
    const last = await db.weeklyDigest.findFirst({
      orderBy: { weekOf: "desc" },
      select: { sections: true },
    });
    if (!last) return null;
    const sections = last.sections as { id: string; content: string }[];
    const content = sections.find((s) => s.id === "riddle")?.content;
    return content ? digestHtmlToPlain(content) : null;
  } catch {
    return null;
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
  const prompt = buildPrompt({ ...input, weekOf, lastRiddle: await lastRiddleContent() });
  const fallbackTitle = `${ORG_NAME} Weekly — Week of ${weekOf}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // One retry on malformed output (nobody is watching the composer on automated intake).
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await anthropic.messages.create(
      { model: DIGEST_MODEL, max_tokens: 4096, messages: [{ role: "user", content: prompt }] },
      { maxRetries: 3 }
    );
    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    try {
      return parseExtraction(raw, input.ctx, fallbackTitle);
    } catch (err) {
      lastErr = err;
      console.error("Digest extraction: malformed AI response (attempt " + (attempt + 1) + ")");
    }
  }
  throw lastErr instanceof Error ? lastErr : new DigestExtractionError("Failed to parse AI response");
}
