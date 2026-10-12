/**
 * Company brand theming: derive a contrast-safe set of colour tokens from a
 * single founder-picked hex. Pure, dependency-free. See
 * docs/design/company-update-theming.md section 3.
 *
 * Store only the picked hex; derive on every read so algorithm improvements
 * upgrade every company with no migration.
 */

export const WHITE = "#ffffff";
export const PAPER = "#ebe8de";
export const DARK = "#14140f";
/** DFS default accent; used when a stored or submitted value is unusable. */
export const DEFAULT_BRAND_HEX = "#44688e";

// Internal thresholds sit just above the WCAG limits (4.5 / 3) so rounding in
// an external audit tool never lands below the line.
const TEXT_MIN = 4.55;
const GRAPHIC_MIN = 3.05;
const BAND_MIN = 1.3;

export interface BrandTheme {
  brand: string;
  /** Button / monogram / logo-plate background. */
  fill: string;
  /** Text colour on `fill`. */
  on: string;
  /** Hover state for `fill` (equals `fill` when a darker step would fail). */
  hover: string;
  /** Any text-coloured use: links, labels, chips, focus ring. */
  ink: string;
  /** Soft background wash. */
  tint: string;
  /** Graphics / non-text, 3:1 against white and Paper. */
  mark: string;
  /** Top band / rule colour. */
  band: string;
  /** True when `fill` is too faint on white/Paper and needs a 1px edge. */
  needsEdge: boolean;
  /** Edge colour (equals `mark`). */
  edge: string;
  /** Human-readable note about how `fill` was derived. */
  fillNote: string;
}

type Rgb = [number, number, number];

const hex2rgb = (h: string): Rgb =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

const rgb2hex = (r: number[]): string =>
  "#" +
  r
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("");

export function lum(hex: string): number {
  const [r, g, b] = hex2rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function cr(a: string, b: string): number {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function rgb2hsl([r0, g0, b0]: Rgb): [number, number, number] {
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0;
  let s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h =
      mx === r
        ? (g - b) / d + (g < b ? 6 : 0)
        : mx === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hsl2hex([h, s0, l0]: [number, number, number]): string {
  const s = s0 / 100;
  const l = l0 / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgb2hex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

/** Per-channel linear mix; `t` is the share of `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = hex2rgb(a);
  const y = hex2rgb(b);
  return rgb2hex(x.map((v, i) => v + (y[i] - v) * t));
}

/** Lower HSL lightness 1 point per step until `ok` passes or a cap is hit. */
export function darkenUntil(
  hex: string,
  ok: (candidate: string) => boolean,
  maxSteps = 100
): { hex: string; steps: number } {
  const [h, s, l0] = rgb2hsl(hex2rgb(hex));
  let l = l0;
  let n = 0;
  while (!ok(hsl2hex([h, s, l])) && l > 0 && n < maxSteps) {
    l -= 1;
    n++;
  }
  return { hex: hsl2hex([h, s, Math.max(0, l)]), steps: n };
}

/**
 * Accepts `#RGB` or `#RRGGBB`, any case, optional `#`, surrounding whitespace.
 * Returns lowercase `#rrggbb`, or null when invalid. Never judges contrast.
 */
export function normalizeBrandHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return "#" + h;
}

/**
 * Derive the full token set. Invalid input falls back to the DFS default so
 * callers never have to branch.
 */
export function deriveTheme(input: string): BrandTheme {
  const brand = normalizeBrandHex(input) ?? DEFAULT_BRAND_HEX;
  const tint = mix(brand, WHITE, lum(brand) > 0.6 ? 0.45 : 0.88);

  let fill = brand;
  let on: string;
  let fillNote = "as picked";
  if (cr(WHITE, brand) >= TEXT_MIN) {
    on = WHITE;
  } else {
    const d = darkenUntil(brand, (c) => cr(WHITE, c) >= TEXT_MIN, 12);
    if (cr(WHITE, d.hex) >= TEXT_MIN) {
      fill = d.hex;
      on = WHITE;
      fillNote = `darkened ${d.steps} pts for white text`;
    } else if (cr(DARK, brand) >= TEXT_MIN) {
      on = DARK;
      fillNote = "dark text on your colour";
    } else {
      const d2 = darkenUntil(brand, (c) => cr(WHITE, c) >= TEXT_MIN);
      fill = d2.hex;
      on = WHITE;
      fillNote = `darkened ${d2.steps} pts for white text`;
    }
  }

  const ink = darkenUntil(
    brand,
    (c) => Math.min(cr(c, WHITE), cr(c, PAPER), cr(c, tint)) >= TEXT_MIN
  ).hex;
  const mark = darkenUntil(
    brand,
    (c) => Math.min(cr(c, WHITE), cr(c, PAPER)) >= GRAPHIC_MIN
  ).hex;
  const band =
    Math.min(cr(brand, WHITE), cr(brand, PAPER)) >= BAND_MIN ? brand : mark;
  const needsEdge = Math.min(cr(fill, WHITE), cr(fill, PAPER)) < GRAPHIC_MIN;

  const [fh, fs, fl] = rgb2hsl(hex2rgb(fill));
  const darker = hsl2hex([fh, fs, Math.max(0, fl - 6)]);
  const hover = cr(on, darker) >= TEXT_MIN ? darker : fill;

  return { brand, fill, on, hover, ink, tint, mark, band, needsEdge, edge: mark, fillNote };
}

export type LogoPlate = "LIGHT" | "BRAND";

export function normalizeLogoPlate(input: unknown): LogoPlate | null {
  return input === "LIGHT" || input === "BRAND" ? input : null;
}

/** True when saturation is so low the colour reads as grey. */
export function isNearGrey(hex: string): boolean {
  const norm = normalizeBrandHex(hex);
  if (!norm) return false;
  return rgb2hsl(hex2rgb(norm))[1] < 8;
}

/** The plate colour a logo sits on for a given theme. */
export function plateColor(theme: BrandTheme, plate: LogoPlate): string {
  return plate === "BRAND" ? theme.fill : WHITE;
}

/**
 * CSS custom properties for a themed wrapper (or directly on a portalled
 * element). Components read them as `var(--co-x, <DFS fallback>)`, so an
 * unthemed company needs no branching in markup. Every value is a validated
 * #rrggbb produced by deriveTheme, so it is safe in a style attribute.
 */
export function themeCssVars(theme: BrandTheme): Record<string, string> {
  return {
    "--co-band": theme.band,
    "--co-ink": theme.ink,
    "--co-tint": theme.tint,
    "--co-fill": theme.fill,
    "--co-on": theme.on,
    "--co-hover": theme.hover,
    "--co-edge": theme.edge,
    "--co-mark": theme.mark,
  };
}

/** Theme for a stored value, or null for "use the Molly default". */
export function themeForStored(stored: string | null | undefined): BrandTheme | null {
  const norm = normalizeBrandHex(stored);
  return norm ? deriveTheme(norm) : null;
}

const ratio = (a: string, b: string) => cr(a, b).toFixed(2);

export interface BrandingRow {
  label: string;
  swatch: string;
  text: string;
}

/** "How we use it" rows: states exactly what changed and the contrast ratio. */
export function describeBranding(theme: BrandTheme): BrandingRow[] {
  const fillAdjusted = theme.fill !== theme.brand;
  const inkAdjusted = theme.ink !== theme.brand;
  return [
    {
      label: "Buttons",
      swatch: theme.fill,
      text: `${theme.fill.toUpperCase()} with ${theme.on === WHITE ? "white" : "dark"} text, ${ratio(theme.on, theme.fill)}:1.${fillAdjusted ? " Adjusted from your colour." : ""}`,
    },
    {
      label: "Links and labels",
      swatch: theme.ink,
      text: `${theme.ink.toUpperCase()} on white, ${ratio(theme.ink, WHITE)}:1.${inkAdjusted ? " Adjusted from your colour." : ""}`,
    },
    {
      label: "Top band and highlights",
      swatch: theme.band,
      text: `${theme.band.toUpperCase()}${theme.band !== theme.brand ? ", a darker shade so it stays visible" : ", your exact colour"}; panels use a soft tint (${theme.tint.toUpperCase()}).`,
    },
  ];
}

/** Plain, non-blocking notices (sand tone, never red). */
export function brandingNotices(
  brandHex: string | null,
  plate: LogoPlate,
  logoLuminance: number | null | undefined
): string[] {
  const out: string[] = [];
  const norm = normalizeBrandHex(brandHex);
  if (norm) {
    if (lum(norm) > 0.6) {
      out.push("This is a very light colour. We use a darker shade for text and links so they stay readable.");
    }
    if (isNearGrey(norm)) {
      out.push("This colour is close to grey, so your update will look fairly neutral.");
    }
  }
  if (typeof logoLuminance === "number") {
    if (plate === "LIGHT" && logoLuminance > 0.85) {
      out.push('Your logo is mostly white and may disappear on a white background. Try "Your colour".');
    }
    if (plate === "BRAND") {
      const theme = deriveTheme(norm ?? DEFAULT_BRAND_HEX);
      const g = Math.round(Math.max(0, Math.min(1, logoLuminance)) * 255)
        .toString(16)
        .padStart(2, "0");
      if (cr(`#${g}${g}${g}`, theme.fill) < 3) {
        out.push("This logo may be hard to see on your colour.");
      }
    }
  }
  return out;
}
