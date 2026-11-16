// New look (PLAN-1, WS159, pattern 6). "Identity" colour: who, or which company, as a small
// mark. A person is a disc and a company is a rounded square; the colour tells one name from
// another and means nothing else. State colours (red, amber, green) never appear here, and
// neither does Molly's own accent band, so a mark cannot be mistaken for a status.
//
// Pure and deterministic: the same name gives the same colour on every screen and device.
// Values and the hash are from docs/design/redesign-v1.md section 2 and 3.5.

export const IDENTITY_POOL = [
  { name: "lime", fill: "#B7D86A" },
  { name: "teal", fill: "#6CCBC6" },
  { name: "indigo", fill: "#9A96F0" },
  { name: "violet", fill: "#B493F0" },
  { name: "orchid", fill: "#D08CE6" },
  { name: "magenta", fill: "#EA8DC3" },
  { name: "stone", fill: "#C9C2B6" },
  { name: "slate", fill: "#A9B6C6" },
] as const;

/** The initial's ink, on every fill, in both themes (6.9:1 or better). */
export const IDENTITY_INK = "#14161A";

/** FNV-1a, 32 bit, over the code points of the lower-cased, trimmed name. */
export function identityHash(name: string | null | undefined): number {
  let h = 2166136261;
  for (const ch of (name ?? "").trim().toLowerCase()) {
    h ^= ch.codePointAt(0) as number;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function identityColour(name: string | null | undefined): { name: string; fill: string; ink: string } {
  const swatch = IDENTITY_POOL[identityHash(name) % IDENTITY_POOL.length];
  return { name: swatch.name, fill: swatch.fill, ink: IDENTITY_INK };
}
