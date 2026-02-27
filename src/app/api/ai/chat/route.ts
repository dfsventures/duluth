export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";

export async function POST(request: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();

    if (!body.message || typeof body.message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const history = Array.isArray(body.history) ? body.history : [];

    // Check if Anthropic is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        response:
          "AI chat is not yet configured. Please set your ANTHROPIC_API_KEY environment variable to enable this feature.",
        sources: [],
      });
    }

    const { chatWithAI } = await import("@/lib/ai");
    const result = await chatWithAI(body.message, history);

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /api/ai/chat error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
