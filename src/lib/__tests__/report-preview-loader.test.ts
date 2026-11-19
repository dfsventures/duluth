import { beforeEach, describe, expect, it, vi } from "vitest";

// WS172 (B-171): the shared loader behind both report preview routes. Placeholder data only.
const findReport = vi.fn();
const findCompanies = vi.fn();
const findFund = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    fundReport: { findUnique: (a: unknown) => findReport(a) },
    portfolioCompany: { findMany: (a: unknown) => findCompanies(a) },
    fund: { findUnique: (a: unknown) => findFund(a) },
  },
}));

import { loadReportPreview } from "@/lib/report-preview";

beforeEach(() => {
  vi.clearAllMocks();
  findCompanies.mockResolvedValue([]);
});

describe("loadReportPreview", () => {
  it("returns null when the report does not exist", async () => {
    findReport.mockResolvedValue(null);
    expect(await loadReportPreview("missing")).toBeNull();
    expect(findCompanies).not.toHaveBeenCalled();
  });

  it("returns the report with no mentions and no snapshot for a plain body", async () => {
    findReport.mockResolvedValue({
      id: "r1",
      title: "Example Fund I: H1 Report",
      periodLabel: "H1",
      publishedAt: null,
      body: "<p>Placeholder report.</p>",
      fundId: "f1",
      fund: { id: "f1", name: "Example Fund I" },
    });
    const out = await loadReportPreview("r1");
    expect(out).toEqual({
      report: {
        id: "r1",
        title: "Example Fund I: H1 Report",
        periodLabel: "H1",
        publishedAt: null,
        body: "<p>Placeholder report.</p>",
        fund: { id: "f1", name: "Example Fund I" },
      },
      mentions: [],
      fundSnapshot: null,
    });
    // No snapshot marker in the body, so the fund is never loaded.
    expect(findFund).not.toHaveBeenCalled();
  });
});
