/** Row-removal animation (spec 5.6 #3): height collapses over 200ms. Instant under reduced motion. */
export const COLLAPSE_MS = 200;

export function collapseDelay(reducedMotion: boolean): number {
  return reducedMotion ? 0 : COLLAPSE_MS;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}
