import { describe, it, expect } from "vitest";
import { relativeTime } from "../relative-time";

const now = new Date("2026-10-10T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("relativeTime", () => {
  it("covers minutes, hours and days", () => {
    expect(relativeTime(ago(10_000), now)).toBe("just now");
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5 min ago");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 h ago");
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe("2 d ago");
  });
  it("falls back to a date after two weeks", () => {
    expect(relativeTime(ago(30 * 86_400_000), now)).toBe("Sep 10, 2026");
  });
  it("treats the future as just now and bad input as empty", () => {
    expect(relativeTime(new Date(now.getTime() + 5000), now)).toBe("just now");
    expect(relativeTime("nope", now)).toBe("");
  });
});
