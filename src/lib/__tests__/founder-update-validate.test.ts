import { describe, it, expect } from "vitest";
import {
  validateNewCompany,
  validateFileUpdate,
  validateMetric,
  validateMetricValueSet,
  validateMatchInput,
  validateLimit,
  validateValuesCount,
} from "@/lib/founder-update-validate";
import { PORTCO_SENTENCES as S } from "@/lib/marge-tools/portco-contract";

const src = { kind: "slack_email", channelId: "C1", messageTs: "1.2", permalink: "https://slack.example/p", subject: "Hi", fromName: "Pat", fromDomain: "x.example", forwardedBy: "Sam" };
const base = { companyId: "c1", period: "2025-Q3", title: "T", bodyText: "Body", sentAt: "2025-10-03", source: src, idempotencyKey: "key_12345678" };
const err = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error);

describe("validateNewCompany", () => {
  const k = { idempotencyKey: "key_12345678" };
  it("accepts a plain name and trims", () => {
    expect(validateNewCompany({ name: "  Zeta Labs ", ...k })).toEqual({ ok: true, value: { name: "Zeta Labs", ledgerId: null, website: null, idempotencyKey: "key_12345678" } });
  });
  it.each([["", "empty"], ["x".repeat(201), "long"], ["1234", "no letter"], ["A\nB", "line break"], ["A<b>", "angle"]])("rejects %j (%s)", (name) => {
    expect(err(validateNewCompany({ name, ...k }))).toBe(S.badName);
  });
  it("checks website and key", () => {
    expect(err(validateNewCompany({ name: "Zeta", website: "ftp://x.example", ...k }))).toBe(S.badWebsite);
    expect(err(validateNewCompany({ name: "Zeta", website: "https://x.example/" + "a".repeat(300), ...k }))).toBe(S.badWebsite);
    expect(err(validateNewCompany({ name: "Zeta", idempotencyKey: "short" }))).toBe(S.badIdempotency);
  });
});

describe("validateFileUpdate", () => {
  it("accepts a minimal update", () => {
    const r = validateFileUpdate(base);
    expect(r.ok && r.value.metrics).toEqual([]);
  });
  it("needs exactly one of companyId / newCompany", () => {
    expect(err(validateFileUpdate({ ...base, companyId: undefined }))).toBe(S.companyXor);
    expect(err(validateFileUpdate({ ...base, newCompany: { name: "Zeta", idempotencyKey: "key_12345678" } }))).toBe(S.companyXor);
  });
  it("checks period, title, body, date", () => {
    expect(err(validateFileUpdate({ ...base, period: "Q3 2025" }))).toBe(S.badPeriod);
    expect(err(validateFileUpdate({ ...base, title: " " }))).toBe(S.badTitle);
    expect(err(validateFileUpdate({ ...base, title: "x".repeat(201) }))).toBe(S.badTitle);
    expect(err(validateFileUpdate({ ...base, bodyText: "  " }))).toBe(S.badBody);
    expect(err(validateFileUpdate({ ...base, bodyText: "x".repeat(40_001) }))).toBe(S.bodyTooLong);
    expect(validateFileUpdate({ ...base, bodyText: "x".repeat(40_000) }).ok).toBe(true);
    expect(err(validateFileUpdate({ ...base, sentAt: "2025-02-30" }))).toBe(S.badDate);
  });
  it("refuses an @ in subject, fromName and forwardedBy", () => {
    for (const k of ["subject", "fromName", "forwardedBy"]) {
      expect(err(validateFileUpdate({ ...base, source: { ...src, [k]: "a@b.example" } }))).toBe(S.sourceHasAddress);
    }
  });
  it("limits attachments and metrics", () => {
    const att = Array.from({ length: 11 }, (_, i) => ({ filename: `f${i}.pdf` }));
    expect(err(validateFileUpdate({ ...base, source: { ...src, attachments: att } }))).toBe(S.tooManyAttachments);
    const m = { name: "MRR", value: 1, date: "2025-09-30", quote: "q" };
    expect(err(validateFileUpdate({ ...base, metrics: Array.from({ length: 21 }, () => m) }))).toBe(S.tooManyMetrics);
    expect(validateFileUpdate({ ...base, metrics: Array.from({ length: 20 }, () => m) }).ok).toBe(true);
  });
});

describe("validateMetric", () => {
  const ok = { name: "MRR", value: 1, date: "2025-09-30", quote: "q" };
  it("needs exactly one of definitionId / name", () => {
    expect(err(validateMetric({ ...ok, definitionId: "d" }, { quoteRequired: true }))).toBe(S.metricXor);
    expect(err(validateMetric({ value: 1, date: "2025-09-30", quote: "q" }, { quoteRequired: true }))).toBe(S.metricXor);
  });
  it("checks name, value, quote, date", () => {
    expect(err(validateMetric({ ...ok, name: "x".repeat(81) }, { quoteRequired: true }))).toBe(S.badMetricName);
    expect(err(validateMetric({ ...ok, value: 1e15 }, { quoteRequired: true }))).toBe(S.badValue);
    expect(err(validateMetric({ ...ok, value: NaN }, { quoteRequired: true }))).toBe(S.badValue);
    expect(validateMetric({ ...ok, value: -999999999999999 }, { quoteRequired: true }).ok).toBe(true);
    expect(err(validateMetric({ ...ok, quote: "x".repeat(301) }, { quoteRequired: true }))).toBe(S.badQuote);
    expect(err(validateMetric({ ...ok, quote: undefined }, { quoteRequired: true }))).toBe(S.badQuote);
    expect(validateMetric({ ...ok, quote: undefined }, { quoteRequired: false }).ok).toBe(true);
    expect(err(validateMetric({ ...ok, date: "2025-9-30" }, { quoteRequired: true }))).toBe(S.badDate);
  });
});

describe("validateMetricValueSet / reads", () => {
  it("accepts a value without a quote", () => {
    expect(validateMetricValueSet({ companyId: "c1", name: "MRR", value: 1, date: "2025-09-30" }).ok).toBe(true);
  });
  it("limits", () => {
    expect(validateLimit(undefined, 20, 50)).toEqual({ ok: true, value: 20 });
    expect(validateLimit(51, 20, 50).ok).toBe(false);
    expect(validateLimit(0, 20, 50).ok).toBe(false);
    expect(validateValuesCount(0)).toEqual({ ok: true, value: 0 });
    expect(validateValuesCount(25).ok).toBe(false);
  });
  it("company_match input", () => {
    expect(validateMatchInput({ names: [] }).ok).toBe(false);
    expect(validateMatchInput({ names: Array(6).fill("a") }).ok).toBe(false);
    expect(validateMatchInput({ names: ["x".repeat(201)] }).ok).toBe(false);
    expect(validateMatchInput({ names: ["Zeta"], domain: "a@b.example" }).ok).toBe(false);
    expect(validateMatchInput({ names: ["Zeta"], domain: "x".repeat(121) }).ok).toBe(false);
    expect(validateMatchInput({ names: [" Zeta "], domain: "Zeta.Example" })).toEqual({ ok: true, value: { names: ["Zeta"], domain: "zeta.example" } });
  });
});
