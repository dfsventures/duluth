import { describe, it, expect } from "vitest";
import { IDENTITY_INK, IDENTITY_POOL, identityColour, identityHash } from "../identity-colour";

// PLAN-1 WS159. Placeholder names only.

// An independent BigInt version of FNV-1a 32 bit, so the helper is checked against the
// definition and not only against its own output.
function fnvReference(s: string): number {
  const prime = BigInt(16777619);
  const mask = BigInt(0xffffffff);
  let h = BigInt(2166136261);
  for (const ch of s.trim().toLowerCase()) {
    h ^= BigInt(ch.codePointAt(0)!);
    h = (h * prime) & mask;
  }
  return Number(h);
}

const SAMPLES = ["Acme Ltd", "Example Co", "Sample Labs", "Sam Admin", "Jo Admin", "Alex Admin", "Acme", "Example Co"];

describe("identityColour", () => {
  it("matches the FNV-1a 32-bit definition for sample names", () => {
    for (const n of SAMPLES) expect(identityHash(n), n).toBe(fnvReference(n));
  });

  it("matches the known FNV-1a test vectors (empty string and 'a')", () => {
    expect(identityHash("")).toBe(0x811c9dc5);
    expect(identityHash("a")).toBe(0xe40c292c);
  });

  it("is deterministic and ignores case and surrounding spaces", () => {
    expect(identityColour("Acme").fill).toBe(identityColour("  ACME ").fill);
    expect(identityColour("Example Co")).toEqual(identityColour("example co"));
  });

  it("picks the pool entry at hash % 8 for the fixed sample names", () => {
    for (const n of SAMPLES) {
      expect(identityColour(n).name, n).toBe(IDENTITY_POOL[fnvReference(n) % 8].name);
    }
  });

  it("fixed sample results", () => {
    const got = Object.fromEntries(["Acme", "Example Co"].map((n) => [n, identityColour(n).name]));
    expect(got).toEqual({ Acme: "slate", "Example Co": "magenta" });
  });

  it("handles empty, missing and non-Latin names without throwing", () => {
    expect(identityColour("").fill).toMatch(/^#[0-9A-F]{6}$/);
    expect(identityColour(null).fill).toMatch(/^#[0-9A-F]{6}$/);
    expect(identityColour("Zoë 東京").fill).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("has eight distinct fills, and the ink is near-black", () => {
    expect(new Set(IDENTITY_POOL.map((p) => p.fill)).size).toBe(8);
    expect(identityColour("Acme").ink).toBe(IDENTITY_INK);
    expect(IDENTITY_INK).toBe("#14161A");
  });

  it("the initial passes 4.5:1 on every fill, and no fill sits in a state hue band", () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const hue = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      if (d === 0) return 0;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const sat = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    };
    for (const { name, fill } of IDENTITY_POOL) {
      const [a, b] = [lum(IDENTITY_INK), lum(fill)];
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), name).toBeGreaterThanOrEqual(4.5);
      // Red 345-25, amber 28-58, green 130-170, accent 195-228. The two desaturated fills
      // (stone, slate) are exempt by design: they cannot read as a hue.
      if (sat(fill) > 0.3) {
        const h = hue(fill);
        const inBand = h >= 345 || h <= 58 || (h >= 130 && h <= 170) || (h >= 195 && h <= 228);
        expect(inBand, `${name} hue ${Math.round(h)}`).toBe(false);
      }
    }
  });
});
