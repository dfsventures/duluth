import { db } from "@/lib/db";

const WINDOW_MS = 60 * 60 * 1000; // 1-hour fixed windows

/**
 * Postgres-backed fixed-window rate limiter.
 * Returns true if the request is allowed, false if over the limit.
 * Fails OPEN on DB errors — an outage must not lock users out of auth.
 */
export async function checkRateLimit(
  bucket: string,
  identifier: string,
  limit: number
): Promise<boolean> {
  const key = `${bucket}:${identifier}`;
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);
  try {
    const counter = await db.rateLimitCounter.upsert({
      where: { key_windowStart: { key, windowStart } },
      update: { count: { increment: 1 } },
      create: { key, windowStart },
    });
    // Opportunistic cleanup of stale windows (~1% of calls)
    if (Math.random() < 0.01) {
      db.rateLimitCounter
        .deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 24 * WINDOW_MS) } } })
        .catch(() => {});
    }
    return counter.count <= limit;
  } catch (err) {
    console.error("rate-limit check failed (allowing request):", err);
    return true;
  }
}

/** Best-effort client IP behind Vercel's proxy. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}
