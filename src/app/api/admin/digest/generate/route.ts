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

export async function POST(request: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { notes } = await request.json() as { notes: string };
    if (!notes?.trim()) {
      return NextResponse.json({ error: "Meeting notes are required" }, { status: 400 });
    }

    const today = new Date();
    const weekOf = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    // Fetch last digest to extract previous riddle
    const lastDigest = await db.weeklyDigest.findFirst({
      orderBy: { weekOf: "desc" },
      select: { sections: true },
    });

    const lastRiddleContent = (() => {
      if (!lastDigest) return null;
      const sections = lastDigest.sections as { id: string; content: string }[];
      return sections.find((s) => s.id === "riddle")?.content ?? null;
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
${notes}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";

    let parsed: { title: string; sections: { id: string; heading: string; content: string }[]; todos: { text: string }[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    // Ensure all 6 sections are present even if Claude omitted one
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
