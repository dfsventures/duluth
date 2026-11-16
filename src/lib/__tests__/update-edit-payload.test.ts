import { describe, it, expect } from "vitest";
import { buildEditMetricValues, carryProvenance, type OldFigure } from "../update-edit-rules";

// What the edit page really sends: stored dates are full ISO strings from the
// API, and "now" is a different day. Synthetic data only.

const now = new Date("2026-11-16T10:00:00.000Z");
const stored = {
  m1: "2026-10-05T00:00:00.000Z",
  m2: "2026-10-05T00:00:00.000Z",
};

const old: OldFigure[] = [
  { metricDefinitionId: "m1", value: 100, date: new Date(stored.m1), via: "marge", quote: "revenue was 100", enteredById: null, origin: "email" },
  { metricDefinitionId: "m2", value: "50.5", date: new Date(stored.m2), via: "marge", quote: "50.5 users", enteredById: null, origin: "attachment" },
];

function tagsFor(payload: ReturnType<typeof buildEditMetricValues>) {
  return carryProvenance(
    old,
    payload.map((p) => ({ ...p, date: new Date(p.date) })),
    "admin-1"
  );
}

describe("buildEditMetricValues", () => {
  it("keeps the stored date for unchanged figures", () => {
    const out = buildEditMetricValues({ m1: "100", m2: "50.5" }, stored, now);
    expect(out.map((o) => o.date)).toEqual([stored.m1, stored.m2]);
    expect(out.map((o) => o.value)).toEqual([100, 50.5]);
  });

  it("gives a metric with no stored figure the new date", () => {
    const out = buildEditMetricValues({ m1: "100", m3: "7" }, stored, now);
    expect(out.find((o) => o.metricDefinitionId === "m3")?.date).toBe(now.toISOString());
    expect(out.find((o) => o.metricDefinitionId === "m1")?.date).toBe(stored.m1);
  });

  it("drops empty values", () => {
    const out = buildEditMetricValues({ m1: "  ", m2: "50.5" }, stored, now);
    expect(out.map((o) => o.metricDefinitionId)).toEqual(["m2"]);
  });

  it("a text-only save keeps every tag", () => {
    const tags = tagsFor(buildEditMetricValues({ m1: "100", m2: "50.5" }, stored, now));
    expect(tags.map((t) => t.via)).toEqual(["marge", "marge"]);
    expect(tags.map((t) => t.origin)).toEqual(["email", "attachment"]);
  });

  it("changing one number drops only that tag; its date stays stored", () => {
    const payload = buildEditMetricValues({ m1: "120", m2: "50.5" }, stored, now);
    expect(payload[0].date).toBe(stored.m1);
    const tags = tagsFor(payload);
    expect(tags[0]).toEqual({ via: null, quote: null, enteredById: "admin-1", origin: null });
    expect(tags[1].via).toBe("marge");
  });
});
