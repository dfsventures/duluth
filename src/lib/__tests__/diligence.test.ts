import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 16, WS40 (JC-DD-F) — the DD checklist completion logic Felix
// flagged for extra scrutiny: recompute-on-read, not an explicit founder
// "submit" step. Synthetic data only.

const mockDocumentFindFirst = vi.fn();
const mockCompanyDiligenceUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    document: { findFirst: (...args: unknown[]) => mockDocumentFindFirst(...args) },
    companyDiligence: { update: (...args: unknown[]) => mockCompanyDiligenceUpdate(...args) },
  },
}));

import {
  diligenceProgress,
  hasActivePassportDocument,
  isDiligenceChecklistComplete,
  recomputeDiligenceCompletion,
} from "@/lib/diligence";

describe("diligenceProgress / isDiligenceChecklistComplete", () => {
  it("a non-Stellar deal needs only the incorporation answer + passport doc (2 items)", () => {
    const incomplete = diligenceProgress({
      isUsIncorporated: null,
      isStellarEcosystem: false,
      stellarWhyText: null,
      stellarTimelineText: null,
      hasPassportDocument: false,
    });
    expect(incomplete).toEqual({ done: 0, total: 2 });
    expect(isDiligenceChecklistComplete({ ...incomplete, isUsIncorporated: null, isStellarEcosystem: false, stellarWhyText: null, stellarTimelineText: null, hasPassportDocument: false })).toBe(false);

    const complete = diligenceProgress({
      isUsIncorporated: true,
      isStellarEcosystem: false,
      stellarWhyText: null,
      stellarTimelineText: null,
      hasPassportDocument: true,
    });
    expect(complete).toEqual({ done: 2, total: 2 });
  });

  it("isUsIncorporated: false still counts as answered (not the same as null/unanswered)", () => {
    const state = {
      isUsIncorporated: false,
      isStellarEcosystem: false,
      stellarWhyText: null,
      stellarTimelineText: null,
      hasPassportDocument: true,
    };
    expect(isDiligenceChecklistComplete(state)).toBe(true);
  });

  it("a Stellar deal requires both essay fields on top of the base 2 items (4 total)", () => {
    const state = {
      isUsIncorporated: true,
      isStellarEcosystem: true,
      stellarWhyText: "",
      stellarTimelineText: "",
      hasPassportDocument: true,
    };
    expect(diligenceProgress(state)).toEqual({ done: 2, total: 4 });
    expect(isDiligenceChecklistComplete(state)).toBe(false);

    const filled = { ...state, stellarWhyText: "Because X", stellarTimelineText: "Q1 2027" };
    expect(diligenceProgress(filled)).toEqual({ done: 4, total: 4 });
    expect(isDiligenceChecklistComplete(filled)).toBe(true);
  });

  it("whitespace-only essay text does not count as answered", () => {
    const state = {
      isUsIncorporated: true,
      isStellarEcosystem: true,
      stellarWhyText: "   ",
      stellarTimelineText: "\n",
      hasPassportDocument: true,
    };
    expect(isDiligenceChecklistComplete(state)).toBe(false);
  });

  it("missing the passport document alone blocks completion even with everything else answered", () => {
    const state = {
      isUsIncorporated: true,
      isStellarEcosystem: true,
      stellarWhyText: "Because X",
      stellarTimelineText: "Q1 2027",
      hasPassportDocument: false,
    };
    expect(isDiligenceChecklistComplete(state)).toBe(false);
  });
});

describe("hasActivePassportDocument", () => {
  beforeEach(() => {
    mockDocumentFindFirst.mockReset();
  });

  it("is true only when an active (non-archived) passport doc exists", async () => {
    mockDocumentFindFirst.mockResolvedValue({ id: "passport-doc-1" });
    expect(await hasActivePassportDocument("company-1")).toBe(true);
    expect(mockDocumentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: "company-1", docType: "passport", archivedAt: null },
      })
    );
  });

  it("is false when there is no matching document", async () => {
    mockDocumentFindFirst.mockResolvedValue(null);
    expect(await hasActivePassportDocument("company-1")).toBe(false);
  });
});

describe("recomputeDiligenceCompletion", () => {
  beforeEach(() => {
    mockCompanyDiligenceUpdate.mockReset();
  });

  it("sets completedAt (and persists it) the moment the checklist becomes complete", async () => {
    const result = await recomputeDiligenceCompletion(
      "company-1",
      { isUsIncorporated: true, isStellarEcosystem: false, stellarWhyText: null, stellarTimelineText: null, completedAt: null },
      true
    );

    expect(result).toBeInstanceOf(Date);
    expect(mockCompanyDiligenceUpdate).toHaveBeenCalledWith({
      where: { companyId: "company-1" },
      data: { completedAt: result },
    });
  });

  it("does not re-write completedAt when it was already set and remains complete", async () => {
    const already = new Date("2026-01-01T00:00:00Z");

    const result = await recomputeDiligenceCompletion(
      "company-1",
      { isUsIncorporated: true, isStellarEcosystem: false, stellarWhyText: null, stellarTimelineText: null, completedAt: already },
      true
    );

    expect(result).toBe(already);
    expect(mockCompanyDiligenceUpdate).not.toHaveBeenCalled();
  });

  it("un-sets completedAt (persisting null) if a previously-complete checklist regresses — e.g. the passport doc was archived", async () => {
    const already = new Date("2026-01-01T00:00:00Z");

    const result = await recomputeDiligenceCompletion(
      "company-1",
      { isUsIncorporated: true, isStellarEcosystem: false, stellarWhyText: null, stellarTimelineText: null, completedAt: already },
      false // no active passport doc anymore
    );

    expect(result).toBeNull();
    expect(mockCompanyDiligenceUpdate).toHaveBeenCalledWith({
      where: { companyId: "company-1" },
      data: { completedAt: null },
    });
  });

  it("stays incomplete (no write) when nothing has changed and it was never complete", async () => {
    const result = await recomputeDiligenceCompletion(
      "company-1",
      { isUsIncorporated: null, isStellarEcosystem: false, stellarWhyText: null, stellarTimelineText: null, completedAt: null },
      false
    );

    expect(result).toBeNull();
    expect(mockCompanyDiligenceUpdate).not.toHaveBeenCalled();
  });
});
