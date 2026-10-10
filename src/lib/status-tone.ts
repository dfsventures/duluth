// UI overhaul phase 1 (docs/design/app-ui-overhaul.md, 6.8 + 11.1).
// ONE map from a status to its colour treatment. Before this, the cadence,
// approvals and report statuses each re-mapped colours inline per page.
//
// Pure and DB-free. The hex values here MUST match the --tone-* custom
// properties in src/app/globals.css (design-tokens.test.ts enforces that, and
// also that every fill/ink pair is >= 4.5:1, WCAG AA).

export type Tone = "stone" | "sky" | "sage" | "clay" | "sand" | "amber";

export interface ToneColors {
  /** Soft tinted background. */
  fill: string;
  /** Deep ink for text on the fill (and on white/Paper). */
  ink: string;
  /** Solid brand hue for dots, markers, drop rings and chart series. Never for text. */
  dot: string;
}

export const TONES: Record<Tone, ToneColors> = {
  stone: { fill: "#E7E4DA", ink: "#46443C", dot: "#8C897B" },
  sky: { fill: "#DCE7F3", ink: "#2C4459", dot: "#5B8DC5" },
  sage: { fill: "#E3E8D0", ink: "#4A5524", dot: "#6E7A3E" },
  clay: { fill: "#F4E0D6", ink: "#8F4A30", dot: "#A65A3E" },
  sand: { fill: "#F1E4C8", ink: "#6B4A0E", dot: "#C9B08A" },
  amber: { fill: "#F8EBC9", ink: "#6B4A0E", dot: "#C9963A" },
};

/** Tailwind classes for each tone (full literals so the JIT sees them). */
export const TONE_CLASSES: Record<Tone, { chip: string; dot: string }> = {
  stone: { chip: "bg-tone-stone text-tone-stone-ink", dot: "bg-[#8C897B]" },
  sky: { chip: "bg-tone-sky text-tone-sky-ink", dot: "bg-sky" },
  sage: { chip: "bg-tone-sage text-tone-sage-ink", dot: "bg-acacia" },
  clay: { chip: "bg-tone-clay text-tone-clay-ink", dot: "bg-laterite" },
  sand: { chip: "bg-tone-sand text-tone-sand-ink", dot: "bg-cocoa" },
  amber: { chip: "bg-tone-amber text-tone-amber-ink", dot: "bg-ochre" },
};

// Convention (Part 32, C02, update-cadence.ts): clay/laterite = requires
// intervention. A never-happened-yet state is neutral or info, NEVER clay.
const STATUS_TONE: Record<string, Tone> = {
  // company update cadence
  current: "sage",
  aging: "amber",
  behind: "clay",
  new: "sky",
  // approvals / providers
  pending: "amber",
  approved: "sage",
  vetted: "sage",
  rejected: "clay",
  // updates / reports / broadcasts / digests
  draft: "stone",
  sent: "sage",
  published: "sage",
  // board columns
  todo: "stone",
  "to do": "stone",
  "in progress": "sky",
  in_progress: "sky",
  blocked: "clay",
  done: "sage",
  // funding stage accents (spec 11.1)
  "pre-seed": "sand",
  seed: "sky",
  "series a": "sage",
};

/** Colour treatment for a status/stage string (case-insensitive). Unknown -> stone. */
export function statusTone(status: string | null | undefined): Tone {
  if (!status) return "stone";
  return STATUS_TONE[status.trim().toLowerCase()] ?? "stone";
}

export function toneColors(status: string | null | undefined): ToneColors {
  return TONES[statusTone(status)];
}

const TILE_TONES: Tone[] = ["sand", "sky", "sage", "clay"];

/**
 * Stable tint for a name tile (spec 11.1: "company tiles rotate through
 * Sand/Sky/Sage/Clay by a stable hash of the name so a company keeps its colour").
 * Decorative only: it never carries meaning, and clay here is not a warning.
 */
export function tileTone(name: string | null | undefined): Tone {
  const s = (name ?? "").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TILE_TONES[h % TILE_TONES.length];
}
