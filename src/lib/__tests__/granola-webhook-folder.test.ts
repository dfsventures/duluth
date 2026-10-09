import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// End to end through the real intake runner: an out-of-folder note is SKIPPED, never extracted.
const m = { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), getNote: vi.fn(), extract: vi.fn(), wu: vi.fn() };
vi.mock("@prisma/client", () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));
vi.mock("@/lib/db", () => ({
  db: { granolaIntake: {
    create: (...a: unknown[]) => m.create(...a), update: (...a: unknown[]) => m.update(...a),
    updateMany: (...a: unknown[]) => m.updateMany(...a), findUnique: (...a: unknown[]) => m.findUnique(...a),
  } },
}));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendDigestDraftReadyEmail: vi.fn(), BASE_URL: "https://x.test" }));
vi.mock("@/lib/board-server", () => ({ loadBoardContext: vi.fn(), buildDigestActionItems: vi.fn(), titleKey: vi.fn() }));
vi.mock("@/lib/digest-extraction", () => ({ extractDigest: (...a: unknown[]) => m.extract(...a), DigestExtractionError: class extends Error {} }));
vi.mock("@/lib/granola", async (orig) => ({ ...(await orig<typeof import("@/lib/granola")>()), getGranolaNote: (...a: unknown[]) => m.getNote(...a) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => m.wu(p) }));

import { POST } from "@/app/api/webhooks/granola/route";

const KEY = Buffer.from("test-secret-not-real");

describe("webhook folder filtering", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset());
    process.env.GRANOLA_API_KEY = "k";
    process.env.GRANOLA_FOLDER_ID = "fol_AAAAAAAAAAAAAA";
    process.env.GRANOLA_WEBHOOK_SECRET = "whsec_" + KEY.toString("base64");
  });

  it("a note outside the configured folder is SKIPPED and never reaches Claude", async () => {
    m.create.mockResolvedValue({ id: "i1" });
    m.updateMany.mockResolvedValue({ count: 1 });
    m.findUnique.mockResolvedValue({ id: "i1", noteId: "not_AAAAAAAAAAAAAA" });
    m.update.mockResolvedValue({});
    m.getNote.mockResolvedValue({ id: "not_AAAAAAAAAAAAAA", title: "t", created_at: new Date().toISOString(), folder_membership: [{ id: "fol_BBBBBBBBBBBBBB", parent_folder_id: null }], attendees: [] });
    const body = JSON.stringify({ event_id: "e1", event_type: "note.generated", note_id: "not_AAAAAAAAAAAAAA", occurred_at: "x" });
    const ts = Math.floor(Date.now() / 1000);
    const sig = "v1," + crypto.createHmac("sha256", KEY).update(`e1.${ts}.${body}`).digest("base64");
    const res = await POST(new Request("https://x.test/api/webhooks/granola", { method: "POST", body, headers: { "webhook-id": "e1", "webhook-timestamp": String(ts), "webhook-signature": sig } }));
    expect(res.status).toBe(200);
    await m.wu.mock.calls[0][0];
    expect(m.extract).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED", skipReason: "outside folder" }) }));
  });
});
