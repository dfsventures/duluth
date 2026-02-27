export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";

export async function POST(request: Request) {
  try {
    console.log("[chat] step 1: requireAdmin");
    const { error } = await requireAdmin();
    if (error) return error;

    console.log("[chat] step 2: parse body");
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

    console.log("[chat] step 3: import ai module");
    const { chatWithAI } = await import("@/lib/ai");

    console.log("[chat] step 4: call chatWithAI, history length:", history.length);
    const result = await chatWithAI(body.message, history);

    console.log("[chat] step 5: success");
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("POST /api/ai/chat error:", msg, "\nStack:", stack);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
