import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 45, WS152 (Q140 A) — an investor link made before Marge files an old
// update or figure does not start showing it. The route builds the filter;
// these tests read it back from the mocked db calls and evaluate it against
// sample rows (so a filter that also dropped ordinary rows would fail).
// Synthetic data only.
const mockLink = vi.fn();
const mockUpdates = vi.fn();
const mockMetrics = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    shareableLink: { findUnique: (...a: unknown[]) => mockLink(...a) },
    update: { findMany: (...a: unknown[]) => mockUpdates(...a) },
    metricValue: { findMany: (...a: unknown[]) => mockMetrics(...a) },
  },
}));

import { GET } from "@/app/api/share/[token]/route";

const LINK_MADE = new Date("2026-09-01T00:00:00Z");
const BEFORE = new Date("2026-08-01T00:00:00Z");
const AFTER = new Date("2026-10-01T00:00:00Z");

type Cond = Record<string, unknown>;
// Tiny evaluator for the shapes the route uses: null, { lte }, OR, AND.
function matches(row: Record<string, unknown>, where: Cond): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Cond[]).some((w) => matches(row, w));
    if (k === "AND") return (v as Cond[]).every((w) => matches(row, w));
    if (!(k in row)) return true; // fields the sample rows don't model (company, date range, ...)
    const cell = row[k];
    if (v === null) return cell === null;
    if (v && typeof v === "object" && "lte" in (v as object)) {
      return cell instanceof Date && cell <= ((v as { lte: Date }).lte);
    }
    return true;
  });
}

const link = {
  id: "l1",
  label: "2026",
  createdAt: LINK_MADE,
  periodStart: new Date("2026-01-01"),
  periodEnd: new Date("2026-12-31"),
  expiresAt: null,
  metricScope: "ALL_TIME",
  companies: [
    {
      companyId: "c1",
      company: {
        id: "c1", name: "Acme", description: null, sector: null, geography: null, fundingStage: null,
        website: null, brandColor: null, logoPlate: "LIGHT", logoWebKey: null, logoWidth: null, logoHeight: null,
      },
    },
  ],
  selectedUpdates: [],
};

beforeEach(() => {
  mockLink.mockReset().mockResolvedValue(link);
  mockUpdates.mockReset().mockResolvedValue([]);
  mockMetrics.mockReset().mockResolvedValue([]);
});

const call = () => GET(new Request("https://x/api/share/tok"), { params: Promise.resolve({ token: "tok" }) });

describe("share link vs email-filed updates (Q140 A)", () => {
  it("legacy period query keeps ordinary updates and updates filed before the link, drops ones filed after", async () => {
    await call();
    const where = mockUpdates.mock.calls[0][0].where as Cond;
    expect(matches({ filedAt: null }, where)).toBe(true); // every ordinary update
    expect(matches({ filedAt: BEFORE }, where)).toBe(true);
    expect(matches({ filedAt: AFTER }, where)).toBe(false);
  });

  it("metric summary keeps ordinary values and values filed before the link, drops Marge values filed after", async () => {
    await call();
    const where = mockMetrics.mock.calls[0][0].where as Cond;
    expect(matches({ via: null, createdAt: AFTER }, where)).toBe(true); // a founder value entered after the link: today's behaviour
    expect(matches({ via: "marge", createdAt: BEFORE }, where)).toBe(true);
    expect(matches({ via: "marge", createdAt: AFTER }, where)).toBe(false);
  });
});
