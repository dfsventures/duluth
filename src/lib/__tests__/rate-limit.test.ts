import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    rateLimitCounter: {
      upsert: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

import { db } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const mockUpsert = vi.mocked(db.rateLimitCounter.upsert);

beforeEach(() => {
  mockUpsert.mockReset();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", async () => {
    mockUpsert.mockResolvedValue({ id: "1", key: "signup:1.2.3.4", windowStart: new Date(), count: 3 } as any);
    expect(await checkRateLimit("signup", "1.2.3.4", 10)).toBe(true);
  });

  it("blocks requests over the limit", async () => {
    mockUpsert.mockResolvedValue({ id: "1", key: "signup:1.2.3.4", windowStart: new Date(), count: 11 } as any);
    expect(await checkRateLimit("signup", "1.2.3.4", 10)).toBe(false);
  });

  it("allows exactly at the limit boundary", async () => {
    mockUpsert.mockResolvedValue({ id: "1", key: "signup:1.2.3.4", windowStart: new Date(), count: 10 } as any);
    expect(await checkRateLimit("signup", "1.2.3.4", 10)).toBe(true);
  });

  it("fails open when the database throws", async () => {
    mockUpsert.mockRejectedValue(new Error("connection lost"));
    expect(await checkRateLimit("signup", "1.2.3.4", 10)).toBe(true);
  });
});

describe("clientIp", () => {
  it("reads the first entry of x-forwarded-for", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("returns 'unknown' when the header is absent", () => {
    const req = new Request("https://example.com");
    expect(clientIp(req)).toBe("unknown");
  });
});
