import { describe, it, expect } from "vitest";
import { metricChipLabel } from "@/lib/metric-origin";

describe("metricChipLabel", () => {
  it("says 'from attached file' for a Marge figure read from an attachment", () => {
    expect(metricChipLabel({ via: "marge", origin: "attachment" })).toBe("from attached file");
  });
  it("says 'from email' for origin email, no origin, or an unknown origin", () => {
    expect(metricChipLabel({ via: "marge", origin: "email" })).toBe("from email");
    expect(metricChipLabel({ via: "marge", origin: null })).toBe("from email");
    expect(metricChipLabel({ via: "marge" })).toBe("from email");
    expect(metricChipLabel({ via: "marge", origin: "other" })).toBe("from email");
  });
  it("shows no chip when Marge did not file the figure", () => {
    expect(metricChipLabel({ via: null, origin: "attachment" })).toBeNull();
    expect(metricChipLabel({})).toBeNull();
  });
});
