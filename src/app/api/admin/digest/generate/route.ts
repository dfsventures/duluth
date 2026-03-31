export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SECTION_DEFS = [
  { id: "projects", heading: "Running Projects" },
  { id: "news", heading: "Latest Relevant News" },
  { id: "done", heading: "Things That Got Done Last Week" },
  { id: "portfolio", heading: "Portfolio Company Updates" },
  { id: "personal", heading: "Personal / Fun Team Updates" },
  { id: "riddle", heading: "Riddle of the Week" },
];

/**
 * Fetch a Granola transcript URL and extract readable plain text from the HTML.
 */
async function fetchTranscriptFromUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Molly/1.0)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  const html = await res.text();

  // Remove <script> and <style> blocks entirely
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");

  // Replace block-level closing tags with newlines to preserve structure
  text = text.replace(/<\/(p|div|li|h[1-6]|section|article|tr)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse excess whitespace
  text = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");

  // Cap at ~15k chars to stay within Claude's useful context
  const capped = text.length > 15000 ? text.slice(0, 15000) + "\n[truncated]" : text;
  return `[Source: ${url}]\n${capped}`;
}

export async function POST(request: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { notes } = await request.json() as { notes: string };
    if (!notes?.trim()) {
      return NextResponse.json({ error: "Meeting notes or links are required" }, { status: 400 });
    }

    // Split input into URL lines and plain-text lines
    const lines = notes.split("\n");
    const urlLines = lines.filter((l) => /^https?:\/\//i.test(l.trim()));
    const textLines = lines.filter((l) => !/^https?:\/\//i.test(l.trim()));

    // Fetch all URLs in parallel
    const fetchedTexts: string[] = [];
    if (urlLines.length > 0) {
      const results = await Promise.allSettled(
        urlLines.map((url) => fetchTranscriptFromUrl(url.trim()))
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          fetchedTexts.push(result.value);
        } else {
          console.error("Failed to fetch transcript:", result.reason);
        }
      }
    }

    const combinedNotes = [
      ...fetchedTexts,
      textLines.join("\n").trim(),
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    if (!combinedNotes.trim()) {
      return NextResponse.json({ error: "Could not retrieve any content from the provided input" }, { status: 400 });
    }

    const today = new Date();
    const weekOf = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    // Fetch last digest to extract previous riddle (best-effort)
    const lastRiddleContent = await (async () => {
      try {
        const lastDigest = await db.weeklyDigest.findFirst({
          orderBy: { weekOf: "desc" },
          select: { sections: true },
        });
        if (!lastDigest) return null;
        const sections = lastDigest.sections as { id: string; content: string }[];
        return sections.find((s) => s.id === "riddle")?.content ?? null;
      } catch {
        return null;
      }
    })();

    const riddleContext = lastRiddleContent
      ? `\nLast week's riddle section was: "${lastRiddleContent}"\nFor the riddle section, first reveal the answer to last week's riddle, then pose a new original riddle. Format as plain text: "Last week's answer: [answer]\n\n[New riddle question]"`
      : `\nFor the riddle section, pose a fun, original riddle. Format as plain text: "[Riddle question]\n\n(Answer revealed next week)"`;

    const prompt = `You are generating the DFS Lab weekly digest from raw meeting notes.

Today is ${weekOf}. Given the meeting notes below, produce a JSON object with:
- "title": a digest title like "DFS Lab Weekly — Week of ${weekOf}"
- "sections": array of exactly 6 objects, one per section, each with "id", "heading", and "content" (plain text, 1-4 short paragraphs). Leave "content" as an empty string if there is nothing relevant from the notes.
- "todos": array of action items extracted from the notes, each with "text" (include the assignee name inline if mentioned, e.g. "Follow up with Acme re: term sheet — Joseph")

Sections must be in this exact order with these exact ids and headings:
${SECTION_DEFS.map((s) => `- id: "${s.id}", heading: "${s.heading}"`).join("\n")}

The first 5 sections should be populated from the meeting notes.
${riddleContext}

Return only valid JSON, no markdown fences.

Meeting notes:
${combinedNotes}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";

    // Strip markdown fences if Claude wrapped the JSON despite instructions
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let parsed: { title: string; sections: { id: string; heading: string; content: string }[]; todos: { text: string }[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response. Raw output:", raw.slice(0, 500));
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    const sections = SECTION_DEFS.map((def) => {
      const found = parsed.sections?.find((s) => s.id === def.id);
      return { id: def.id, heading: def.heading, content: found?.content ?? "" };
    });

    return NextResponse.json({
      title: parsed.title ?? `DFS Lab Weekly — Week of ${weekOf}`,
      weekOf: today.toISOString(),
      sections,
      todos: (parsed.todos ?? []).map((t) => ({ text: t.text })),
    });
  } catch (err) {
    console.error("POST /api/admin/digest/generate error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
