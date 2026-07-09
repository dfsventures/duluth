import { describe, it, expect } from "vitest";
import { buildMentionSnapshot, computeMultiple, extractMentionIds, type DealInput } from "@/lib/report-snapshot";

// Synthetic data only — no real DFS Lab figures (confidentiality ground rule).

describe("computeMultiple", () => {
  it("returns current/entry when both are known and entry > 0", () => {
    expect(computeMultiple(100, 460)).toBeCloseTo(4.6);
  });
  it("returns 0 (written off) when currentValuation is 0", () => {
    expect(computeMultiple(100, 0)).toBe(0);
  });
  it("returns null when entryValuation is null", () => {
    expect(computeMultiple(null, 500)).toBeNull();
  });
  it("returns null when entryValuation is 0", () => {
    expect(computeMultiple(0, 500)).toBeNull();
  });
  it("returns null when currentValuation is null", () => {
    expect(computeMultiple(100, null)).toBeNull();
  });
});

describe("buildMentionSnapshot", () => {
  it("single initial deal — since-first-check multiple matches the deal's own multiple", () => {
    const deals: DealInput[] = [
      { investmentType: "INITIAL", dealDate: new Date("2020-10-01"), amountUsd: 100_000, entryValuation: 1_000_000, currentValuation: 4_600_000 },
    ];
    const snap = buildMentionSnapshot("Acme", "Kenya", deals);
    expect(snap.sinceFirstCheckMultiple).toBeCloseTo(4.6);
    expect(snap.firstCheckEntryValuationUsd).toBe(1_000_000);
    expect(snap.firstCheckCurrentValuationUsd).toBe(4_600_000);
    expect(snap.totalInvestedUsd).toBe(100_000);
    expect(snap.deals).toHaveLength(1);
    expect(snap.deals[0].multiple).toBeCloseTo(4.6);
  });

  it("initial + follow-on — headline uses the EARLIEST deal, not a blend (Q6)", () => {
    const deals: DealInput[] = [
      { investmentType: "FOLLOW_ON", dealDate: new Date("2022-01-01"), amountUsd: 200_000, entryValuation: 5_000_000, currentValuation: 5_000_000 },
      { investmentType: "INITIAL", dealDate: new Date("2020-10-01"), amountUsd: 100_000, entryValuation: 1_000_000, currentValuation: 4_600_000 },
    ];
    const snap = buildMentionSnapshot("Acme", "Kenya", deals);
    // Headline is the first (earliest) deal's multiple, 4.6x — not any blend with the 1x follow-on.
    expect(snap.sinceFirstCheckMultiple).toBeCloseTo(4.6);
    expect(snap.firstDealDate).toBe(new Date("2020-10-01").toISOString());
    // Full detail — total invested sums ALL deals (check sizes), per-deal rows sorted chronologically.
    expect(snap.totalInvestedUsd).toBe(300_000);
    expect(snap.deals.map((d) => d.investmentType)).toEqual(["INITIAL", "FOLLOW_ON"]);
  });

  it("written off (current valuation 0) renders as multiple 0, not null", () => {
    const deals: DealInput[] = [
      { investmentType: "INITIAL", dealDate: new Date("2021-01-01"), amountUsd: 50_000, entryValuation: 2_000_000, currentValuation: 0 },
    ];
    const snap = buildMentionSnapshot("Defunct Co", null, deals);
    expect(snap.sinceFirstCheckMultiple).toBe(0);
    expect(snap.deals[0].multiple).toBe(0);
  });

  it("null entry valuation on the first deal -> since-first-check multiple is null (n/a)", () => {
    const deals: DealInput[] = [
      { investmentType: "INITIAL", dealDate: new Date("2021-01-01"), amountUsd: 50_000, entryValuation: null, currentValuation: 1_000_000 },
    ];
    const snap = buildMentionSnapshot("Unknown Entry Co", null, deals);
    expect(snap.sinceFirstCheckMultiple).toBeNull();
    expect(snap.deals[0].multiple).toBeNull();
  });

  it("carries full dollar detail per deal (entry, current, check size)", () => {
    const deals: DealInput[] = [
      { investmentType: "INITIAL", dealDate: new Date("2020-01-01"), amountUsd: 250_000, entryValuation: 4_000_000, currentValuation: 18_500_000 },
    ];
    const snap = buildMentionSnapshot("Full Detail Co", "Nigeria", deals);
    expect(snap.deals[0]).toMatchObject({
      amountUsd: 250_000,
      entryValuationUsd: 4_000_000,
      currentValuationUsd: 18_500_000,
    });
  });
});

describe("extractMentionIds", () => {
  it("returns an empty array for a body with no mentions", () => {
    expect(extractMentionIds("<p>No mentions here.</p>")).toEqual([]);
  });

  it("extracts a single mention id", () => {
    const html = `<p>We're excited about <span data-portco="abc123" class="portco-mention">Acme</span>'s progress.</p>`;
    expect(extractMentionIds(html)).toEqual(["abc123"]);
  });

  it("dedupes repeated mentions of the same company", () => {
    const html = `<span data-portco="abc123" class="portco-mention">Acme</span> ... <span data-portco="abc123" class="portco-mention">Acme</span>`;
    expect(extractMentionIds(html)).toEqual(["abc123"]);
  });

  it("is robust to attribute order (class before data-portco)", () => {
    const html = `<span class="portco-mention" data-portco="xyz789">Beta</span>`;
    expect(extractMentionIds(html)).toEqual(["xyz789"]);
  });

  it("extracts multiple distinct mentions in document order", () => {
    const html = `<span data-portco="a1" class="portco-mention">A</span> and <span data-portco="b2" class="portco-mention">B</span>`;
    expect(extractMentionIds(html)).toEqual(["a1", "b2"]);
  });
});
