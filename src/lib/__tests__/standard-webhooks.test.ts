import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyStandardWebhook } from "@/lib/standard-webhooks";

const secret = "whsec_" + Buffer.from("test-secret-not-real").toString("base64");
const key = Buffer.from("test-secret-not-real");
const NOW = 1_800_000_000;
const body = '{"event_id":"evt_1","event_type":"note.generated","note_id":"not_AAAAAAAAAAAAAA"}';
const sign = (id: string, ts: number, b: string, k = key) =>
  "v1," + crypto.createHmac("sha256", k).update(`${id}.${ts}.${b}`).digest("base64");
const v = (o: Partial<Parameters<typeof verifyStandardWebhook>[0]> = {}) =>
  verifyStandardWebhook({
    secret, id: "evt_1", timestamp: String(NOW), signatures: sign("evt_1", NOW, body), rawBody: body, nowSec: NOW, ...o,
  });

describe("verifyStandardWebhook", () => {
  it("accepts a valid signature", () => expect(v()).toBe(true));
  it("rejects a tampered body", () => expect(v({ rawBody: body + " " })).toBe(false));
  it("rejects a wrong secret", () =>
    expect(v({ signatures: sign("evt_1", NOW, body, Buffer.from("other")) })).toBe(false));
  it("rejects a stale timestamp (301 s) and a future one", () => {
    expect(v({ timestamp: String(NOW - 301), signatures: sign("evt_1", NOW - 301, body) })).toBe(false);
    expect(v({ timestamp: String(NOW + 301), signatures: sign("evt_1", NOW + 301, body) })).toBe(false);
  });
  it("accepts when one of several signatures is valid", () =>
    expect(v({ signatures: `v1,AAAA ${sign("evt_1", NOW, body)}` })).toBe(true));
  it("ignores a v2 entry", () =>
    expect(v({ signatures: sign("evt_1", NOW, body).replace("v1,", "v2,") })).toBe(false));
  it("does not throw on length-mismatched or garbage signatures", () => {
    expect(v({ signatures: "v1,AAAA" })).toBe(false);
    expect(v({ signatures: "v1," })).toBe(false);
    expect(v({ signatures: "garbage" })).toBe(false);
  });
  it("rejects missing headers, bad timestamps and an empty secret", () => {
    expect(v({ id: null })).toBe(false);
    expect(v({ timestamp: null })).toBe(false);
    expect(v({ signatures: null })).toBe(false);
    expect(v({ timestamp: "12abc" })).toBe(false);
    expect(v({ secret: "" })).toBe(false);
  });
});
