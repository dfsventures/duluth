import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const m = { enqueue: vi.fn(), process: vi.fn(), rate: vi.fn(), waitUntil: vi.fn() };
vi.mock("@/lib/granola-intake", () => ({
  enqueueGranolaNote: (...a: unknown[]) => m.enqueue(...a),
  processGranolaIntake: (...a: unknown[]) => m.process(...a),
  safeErrorText: () => "x",
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => m.rate(...a) }));
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => m.waitUntil(p) }));

import { POST } from "@/app/api/webhooks/granola/route";

const KEY = Buffer.from("test-secret-not-real");
const SECRET = "whsec_" + KEY.toString("base64");
const NOTE = "not_AAAAAAAAAAAAAA";

function delivery(opts: { type?: string; id?: string; ts?: number; sig?: string; body?: string } = {}) {
  const body = opts.body ?? JSON.stringify({ event_id: opts.id ?? "evt_1", event_type: opts.type ?? "note.generated", note_id: NOTE, occurred_at: "2026-10-09T00:00:00Z" });
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const id = opts.id ?? "evt_1";
  const sig = opts.sig ?? "v1," + crypto.createHmac("sha256", KEY).update(`${id}.${ts}.${body}`).digest("base64");
  return new Request("https://example.test/api/webhooks/granola", {
    method: "POST",
    headers: { "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": sig },
    body,
  });
}

describe("POST /api/webhooks/granola", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset());
    m.rate.mockResolvedValue(true);
    m.enqueue.mockResolvedValue({ id: "intake_1" });
    m.process.mockResolvedValue({ outcome: "done" });
    process.env.GRANOLA_API_KEY = "k";
    process.env.GRANOLA_FOLDER_ID = "fol_AAAAAAAAAAAAAA";
    process.env.GRANOLA_WEBHOOK_SECRET = SECRET;
  });

  it("404 and no work when unconfigured", async () => {
    delete process.env.GRANOLA_WEBHOOK_SECRET;
    expect((await POST(delivery())).status).toBe(404);
    expect(m.enqueue).not.toHaveBeenCalled();
  });

  it("valid signature: 200 fast, intake processed via waitUntil", async () => {
    const res = await POST(delivery());
    expect(res.status).toBe(200);
    expect(m.enqueue).toHaveBeenCalledWith(NOTE, "WEBHOOK", "evt_1");
    expect(m.waitUntil).toHaveBeenCalledTimes(1);
    await m.waitUntil.mock.calls[0][0];
    expect(m.process).toHaveBeenCalledWith("intake_1");
  });

  it("bad signature: 401, no rate-limit, no db, no processing", async () => {
    const res = await POST(delivery({ sig: "v1,AAAA" }));
    expect(res.status).toBe(401);
    expect(m.rate).not.toHaveBeenCalled();
    expect(m.enqueue).not.toHaveBeenCalled();
  });

  it("unsigned: 401", async () => {
    const res = await POST(new Request("https://example.test/api/webhooks/granola", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(m.enqueue).not.toHaveBeenCalled();
  });

  it("expired timestamp: 401 even with a correct signature", async () => {
    const res = await POST(delivery({ ts: Math.floor(Date.now() / 1000) - 3600 }));
    expect(res.status).toBe(401);
    expect(m.enqueue).not.toHaveBeenCalled();
  });

  it("duplicate delivery: 200, nothing processed twice", async () => {
    m.enqueue.mockResolvedValue(null); // noteId already known
    const res = await POST(delivery());
    expect(res.status).toBe(200);
    expect(m.waitUntil).not.toHaveBeenCalled();
    expect(m.process).not.toHaveBeenCalled();
  });

  it("rate limited: 429 after verification", async () => {
    m.rate.mockResolvedValue(false);
    expect((await POST(delivery())).status).toBe(429);
    expect(m.enqueue).not.toHaveBeenCalled();
  });

  it("note.edited is acknowledged and ignored; note.access_granted is processed", async () => {
    const r1 = await POST(delivery({ type: "note.edited" }));
    expect(r1.status).toBe(200);
    expect(m.enqueue).not.toHaveBeenCalled();
    const r2 = await POST(delivery({ type: "note.access_granted" }));
    expect(r2.status).toBe(200);
    expect(m.enqueue).toHaveBeenCalledTimes(1);
  });

  it("malformed signed payload: 400", async () => {
    expect((await POST(delivery({ body: "not json" }))).status).toBe(400);
    expect((await POST(delivery({ body: JSON.stringify({ note_id: "bad" }) }))).status).toBe(400);
  });

  it("db failure is a retryable 500 that leaks nothing", async () => {
    m.enqueue.mockRejectedValue(new Error("secret note title"));
    const res = await POST(delivery());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret note title");
  });
});
