export interface SessionInfo {
  isLoggedIn: boolean;
  roles: string[]; // e.g. ["ADMIN"], ["FOUNDER"]
  status?: string; // "PENDING" | "APPROVED" | "REJECTED"
}

export type RouteDecision =
  | { type: "next" }
  | { type: "redirect"; to: string; callbackUrl?: string };

// "/" must be an exact match: every pathname starts with "/", so a prefix
// match here would make every route public. (This exact bug shipped in
// February and survived until July — see the regression tests.)
//
// "/api/cron" is public because Vercel Cron invocations carry no user
// session — the route itself enforces CRON_SECRET as its real gate.
// Without this, middleware redirects every cron invocation to /login
// before the route's own secret check ever runs (found 2026-07-03: the
// reminder cron had never actually sent an email despite the app
// believing it had a working daily job).
//
// "/brand" is public for the same reason: email clients fetch the logo
// images under /brand with no session, so gating them breaks every
// email header (found 2026-07-06).
//
// "/api/share" (found 2026-07-06, F15, during WS12 live verification) is
// public because investor share links are the platform's one no-account
// surface — the page at "/share/[token]" was already public, but the data
// API it fetches client-side, "/api/share/[token]" (and its "/view" email
// gate), was not, so every investor's browser fetch was 307-redirected to
// /login and the share page never rendered. The route itself has no
// CRON_SECRET-style gate because none is needed: a share link's own token
// is the authorization, exactly like "/share" itself.
const PUBLIC_PREFIXES = ["/login", "/signup", "/set-password", "/api/auth", "/api/dev", "/share", "/api/share", "/api/cron", "/investors", "/brand"];

export function decideRoute(pathname: string, search: string, s: SessionInfo): RouteDecision {
  const isAdmin = s.roles.includes("ADMIN");
  const isFounder = s.roles.includes("FOUNDER");

  const isPublic = pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPublic) return { type: "next" };

  if (!s.isLoggedIn) {
    return { type: "redirect", to: "/login", callbackUrl: pathname + search };
  }

  if (isFounder && !isAdmin && s.status !== "APPROVED" && pathname !== "/setup-wizard") {
    return { type: "redirect", to: "/login" };
  }

  if (pathname.startsWith("/admin") && !isAdmin) {
    return { type: "redirect", to: "/dashboard" };
  }

  if (pathname === "/dashboard" && isAdmin && !isFounder) {
    return { type: "redirect", to: "/admin" };
  }

  return { type: "next" };
}
