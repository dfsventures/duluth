import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/share/[token] — theming fields only. Mocked db, synthetic data.
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

const ID1 = "ckabc1234567890abcdef";
const H = "0123456789abcdef";

function co(id: string, over: Record<string, unknown> = {}) {
  return {
    companyId: id,
    company: {
      id,
      name: `Acme ${id.slice(-3)}`,
      description: null,
      sector: null,
      geography: null,
      fundingStage: null,
      website: null,
      brandColor: null,
      logoPlate: "LIGHT",
      logoWebKey: null,
      logoWidth: null,
      logoHeight: null,
      ...over,
    },
  };
}

function link(companies: ReturnType<typeof co>[]) {
  return {
    id: "l1",
    label: "Q3",
    periodStart: new Date("2026-07-01"),
    periodEnd: new Date("2026-09-30"),
    expiresAt: null,
    metricScope: "LATEST",
    companies,
    selectedUpdates: [],
  };
}

const call = () => GET(new Request("https://molly.dfs.vc/api/share/tok"), { params: Promise.resolve({ token: "tok" }) });

beforeEach(() => {
  mockLink.mockReset();
  mockUpdates.mockReset().mockResolvedValue([]);
  mockMetrics.mockReset().mockResolvedValue([]);
});

describe("share API theming", () => {
  it("single themed company: page theme + logo URL, derived server-side", async () => {
    mockLink.mockResolvedValue(
      link([co(ID1, { brandColor: "#12a5b0", logoPlate: "BRAND", logoWebKey: `companies/${ID1}/logo/${H}-web.png`, logoWidth: 200, logoHeight: 200 })])
    );
    const body = await (await call()).json();
    expect(body.theme.fill).toBe("#0e828b");
    expect(body.companies[0].theme).toEqual(body.theme);
    expect(body.companies[0].logoUrl).toBe(`/api/logo/${ID1}/${H}-web.png`);
    expect(body.companies[0].logoPlate).toBe("BRAND");
    expect(body.companies[0].logoSquare).toBe(true);
  });

  it("multi-company: no page theme, each card keeps its own", async () => {
    mockLink.mockResolvedValue(
      link([co("ckaaa1234567890aaaaaaa", { brandColor: "#12a5b0" }), co("ckbbb1234567890bbbbbbb")])
    );
    const body = await (await call()).json();
    expect(body.theme).toBeNull();
    expect(body.companies[0].theme.fill).toBe("#0e828b");
    expect(body.companies[1].theme).toBeNull();
  });

  it("a malformed stored colour yields the default, never a raw value", async () => {
    mockLink.mockResolvedValue(link([co(ID1, { brandColor: "red;background:url(x)" })]));
    const body = await (await call()).json();
    expect(body.theme).toBeNull();
    expect(JSON.stringify(body)).not.toContain("background:url");
  });

  it("exposes no company fields beyond the existing ones plus theming", async () => {
    mockLink.mockResolvedValue(link([co(ID1, { brandColor: "#12a5b0", logoWebKey: `companies/${ID1}/logo/${H}-web.png` })]));
    const body = await (await call()).json();
    expect(Object.keys(body.companies[0]).sort()).toEqual(
      ["description", "fundingStage", "geography", "id", "logoPlate", "logoSquare", "logoUrl", "metrics", "name", "sector", "theme", "website"]
    );
    // storage keys and the raw pick are never returned
    expect(JSON.stringify(body)).not.toContain("logoWebKey");
    expect(JSON.stringify(body)).not.toContain("companies/");
  });

  it("an unthemed company without a logo is unchanged (null theme, null logo)", async () => {
    mockLink.mockResolvedValue(link([co(ID1)]));
    const body = await (await call()).json();
    expect(body.theme).toBeNull();
    expect(body.companies[0].logoUrl).toBeNull();
  });
});
