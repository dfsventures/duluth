export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { ORG_NAME } from "@/lib/org";
import { extractDigest, DigestExtractionError } from "@/lib/digest-extraction";
import { loadBoardContext } from "@/lib/board-server";
import { resolveEntity } from "@/lib/board-reconcile";

// Part 37 (WS108.2): thin route. Fetching/splitting stays here; the prompt,
// Claude call and validation live in src/lib/digest-extraction.ts.

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
    const warnings: string[] = [];
    if (urlLines.length > 0) {
      const results = await Promise.allSettled(
        urlLines.map((url) => fetchTranscriptFromUrl(url.trim()))
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          fetchedTexts.push(result.value);
          // F109: a page that yields almost no text is probably a JS-rendered share page.
          const body = result.value.replace(/^\[Source: [^\]]*\]\n?/, "");
          if (body.trim().length < 200 && !warnings.length) {
            warnings.push("One link returned almost no text. Granola share pages may need to be pasted as text.");
          }
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

    const ctx = await loadBoardContext();
    const extracted = await extractDigest({ notesText: combinedNotes, ctx });

    const todos = extracted.items.map((item) => {
      const owner = resolveEntity(item.ownerRaw, item.ownerId, ctx.people);
      const project = resolveEntity(item.projectRaw, item.projectId, ctx.projects);
      return {
        text: item.title,
        ownerId: owner.id,
        projectId: project.id,
        ownerRaw: owner.raw,
        projectRaw: project.raw,
        needsReview: owner.needsReview || project.needsReview,
        existingCardId: item.existingCardId,
        dueDate: item.dueDate,
      };
    });

    return NextResponse.json({
      title: extracted.title || `${ORG_NAME} Weekly — Week of ${weekOf}`,
      weekOf: today.toISOString(),
      sections: extracted.sections,
      todos,
      warnings,
    });
  } catch (err: unknown) {
    console.error("POST /api/admin/digest/generate error:", err);
    if (err instanceof DigestExtractionError) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }
    const status = (err as { status?: number })?.status;
    if (status === 529 || status === 503) {
      return NextResponse.json({ error: "Claude is currently overloaded — please try again in a moment" }, { status: 503 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
