import { describe, it, expect, vi, beforeEach } from "vitest";

const sweep = vi.fn();
vi.mock("@/lib/granola-intake", () => ({ runGranolaSweep: (...a: unknown[]) => sweep(...a), safeErrorText: () => "x" }));

import { GET, POST } from "@/app/api/cron/granola-sweep/route";
import { NextRequest } from "next/server";

const req = (auth?: string) =>
  new NextRequest("https://example.test/api/cron/granola-sweep", { headers: auth ? { authorization: auth } : {} });

describe("cron/granola-sweep", () => {
  beforeEach(() => {
    sweep.mockReset();
    process.env.CRON_SECRET = "s3cret";
    delete process.env.GRANOLA_API_KEY;
    delete process.env.GRANOLA_FOLDER_ID;
  });

  it("401 without the secret, before anything else", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await POST(req("Bearer wrong"))).status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
  });

  it("no-ops with skipped:true when Granola is not configured", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: true });
    expect(sweep).not.toHaveBeenCalled();
  });

  it("runs the sweep when configured", async () => {
    process.env.GRANOLA_API_KEY = "k";
    process.env.GRANOLA_FOLDER_ID = "fol_AAAAAAAAAAAAAA";
    sweep.mockResolvedValue({ enqueued: 1, processed: 1, skipped: 0, failed: 0, found: 1 });
    const res = await POST(req("Bearer s3cret"));
    expect(await res.json()).toMatchObject({ processed: 1 });
    expect(sweep).toHaveBeenCalledWith("SWEEP");
  });
});
