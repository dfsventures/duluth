/**
 * Shared SWR fetcher. Throws on a non-2xx so SWR reports `error`, carrying the
 * server's `{ error }` message when there is one. Always bypasses the HTTP cache:
 * freshness is SWR's job, not the browser's.
 */
export class FetchError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "FetchError";
  }
}

export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new FetchError(body?.error ?? `Server error (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

/** The sidebar and the dashboard share this key, so one fetch feeds both and either can refresh it. */
export const NAV_COUNTS_KEY = "/api/admin/nav-counts";
