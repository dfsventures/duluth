export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { z } from "zod";
import { waitUntil } from "@vercel/functions";
import { granolaWebhookEnabled, NOTE_ID_RE } from "@/lib/granola";
import { verifyStandardWebhook } from "@/lib/standard-webhooks";
import { checkRateLimit } from "@/lib/rate-limit";
import { enqueueGranolaNote, processGranolaIntake, safeErrorText } from "@/lib/granola-intake";

// Part 37, WS110 — Granola webhook (Standard Webhooks signing). Public in
// route-access.ts for exactly this path; the signature check below is the real gate.
// Granola (docs.granola.ai/webhooks): 15 s to answer; 408/429/5xx/timeouts are retried
// with backoff for ~4 days, 3xx and other 4xx are permanent failures. Payloads carry no
// note content. Nothing here logs titles, content, headers or the secret.
const Event = z.object({
  event_id: z.string().min(1).max(200),
  event_type: z.string().min(1).max(100),
  note_id: z.string().regex(NOTE_ID_RE),
  occurred_at: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    if (!granolaWebhookEnabled()) {
      return Response.json({ error: "Not configured" }, { status: 404 }); // 4xx: Granola stops retrying; the daily sweep still covers
    }

    const raw = await req.text(); // raw body before any JSON parse: required for the HMAC
    if (raw.length > 64_000) return Response.json({ error: "Too large" }, { status: 413 });

    const ok = verifyStandardWebhook({
      secret: process.env.GRANOLA_WEBHOOK_SECRET!,
      rawBody: raw,
      id: req.headers.get("webhook-id"),
      timestamp: req.headers.get("webhook-timestamp"),
      signatures: req.headers.get("webhook-signature"),
    });
    if (!ok) return Response.json({ error: "Invalid signature" }, { status: 401 }); // no DB access for unsigned traffic

    // After verification: the risk is spend from a leaked secret or a bulk access-granted flood.
    // 429 is retried by Granola with backoff, so it self-throttles.
    if (!(await checkRateLimit("granola-webhook", "global", 60))) {
      return Response.json({ error: "Rate limited" }, { status: 429 });
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Bad payload" }, { status: 400 });
    }
    const parsed = Event.safeParse(json);
    if (!parsed.success) return Response.json({ error: "Bad payload" }, { status: 400 });
    const e = parsed.data;

    // note.edited is ignored (exactly-once per note); 200 so it is not retried.
    if (e.event_type !== "note.generated" && e.event_type !== "note.access_granted") {
      return Response.json({ ignored: e.event_type });
    }

    // noteId is unique: a duplicate delivery returns null and creates nothing.
    // Folder filtering happens inside processGranolaIntake, same guard as the sweep.
    const intake = await enqueueGranolaNote(e.note_id, "WEBHOOK", e.event_id);
    if (intake) {
      waitUntil(
        processGranolaIntake(intake.id).then(
          (r) => console.log(`[webhooks/granola] intake outcome=${r.outcome}`),
          (err) => console.error(`[webhooks/granola] intake failed: ${safeErrorText(err)}`)
        )
      );
    }
    return Response.json({ received: true });
  } catch (err) {
    console.error(`[webhooks/granola] failed: ${safeErrorText(err)}`);
    return Response.json({ error: "Internal error" }, { status: 500 }); // 5xx is retried by Granola
  }
}
