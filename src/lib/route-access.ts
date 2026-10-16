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
//
// "/lp" and "/api/lp" (Part 7, WS18) are the fifth member of this family —
// LPs have no NextAuth session BY DESIGN (see JC4 in docs/IMPLEMENTATION_PLAN.md
// Part 7): the real gate is the `lp_session` cookie checked in `lp-auth.ts`'s
// getLp(), read directly by Server Components (JC5) or the three auth
// mutation routes under /api/lp/auth. Per this same F15-family lesson, no
// authenticated route may ever be created under a path starting with "/lp".
//
// "/api/webhooks/granola" (Part 37, WS110) is public because Granola's webhook
// deliveries carry no user session; the route verifies the Standard Webhooks
// HMAC signature as the real gate. Without this, middleware 307-redirects every
// delivery to /login and Granola records a permanent failure (3xx is never
// retried). It is matched as an EXACT path, not a prefix, so nothing else under
// /api/webhooks (or a lookalike such as /api/webhooks/granola-x) becomes public.
//
// "/api/mcp/marge" (Part 39, WS123) is public because Marge's tool calls carry no user
// session; the route authenticates every request itself with a short-lived Ed25519-signed
// assertion (src/lib/marge-auth.ts) and returns 404 until MARGE_MCP_MODE is set. It is
// matched as an EXACT path, so nothing else under /api/mcp (or a lookalike such as
// /api/mcp/marge-x) becomes public.
//
// "/api/logo/" (company update theming) serves company logo derivatives to
// sessionless investors and email clients. It is a prefix WITH a trailing
// slash because the path carries two dynamic segments (company id and a
// content-hashed file name), so an exact match is impossible; the route itself
// only serves keys that match companies/{id}/logo/{hash16}-{web|email}.png
// (src/lib/company-logo.ts). No authenticated route may ever live under it.
const PUBLIC_EXACT = ["/api/webhooks/granola", "/api/mcp/marge"];
const PUBLIC_PREFIXES = ["/login", "/signup", "/set-password", "/api/auth", "/share", "/api/share", "/api/cron", "/investors", "/brand", "/lp", "/api/lp", "/api/logo/"];

export function decideRoute(pathname: string, search: string, s: SessionInfo): RouteDecision {
  const isAdmin = s.roles.includes("ADMIN");
  const isFounder = s.roles.includes("FOUNDER");

  const isPublic = pathname === "/" || PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
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
