import crypto from "crypto";

/**
 * Standard Webhooks v1 verification (Granola, verified against docs.granola.ai/webhooks 2026-10-09).
 * Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`; HMAC-SHA256; key = base64-decode of
 * the secret with its "whsec_" prefix removed. The signature header may hold several space-separated
 * "v1,<base64>" entries. Constant-time compare, length-guarded. Timestamp must be within tolerance of now
 * (replay protection; Granola's docs give no exact figure, 5 minutes is the Standard Webhooks default).
 */
export function verifyStandardWebhook(o: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signatures: string | null;
  rawBody: string;
  nowSec?: number;
  toleranceSec?: number;
}): boolean {
  if (!o.secret || !o.id || !o.timestamp || !o.signatures) return false;
  if (!/^\d+$/.test(o.timestamp)) return false;
  const ts = Number(o.timestamp);
  const now = o.nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(ts) || Math.abs(now - ts) > (o.toleranceSec ?? 300)) return false;

  const key = Buffer.from(o.secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${o.id}.${o.timestamp}.${o.rawBody}`).digest();

  let ok = false;
  for (const entry of o.signatures.split(" ")) {
    const [version, sig] = entry.split(",");
    if (version !== "v1" || !sig) continue;
    const candidate = Buffer.from(sig, "base64");
    if (candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)) ok = true;
  }
  return ok;
}
