// Tabs that live in the URL (?tab=...). Pure parse/serialise; the hook that
// wires it to Next's router is in lib/use-url-tab.ts.

export function parseTab<T extends string>(raw: string | null | undefined, valid: readonly T[], fallback: T): T {
  return raw && (valid as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** href for a tab link: the default tab has a clean URL, others get ?tab=. Other params are kept. */
export function tabHref<T extends string>(pathname: string, current: URLSearchParams | string, tab: T, fallback: T): string {
  const params = new URLSearchParams(typeof current === "string" ? current : current.toString());
  if (tab === fallback) params.delete("tab");
  else params.set("tab", tab);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
