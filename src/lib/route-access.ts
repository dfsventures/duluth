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
const PUBLIC_PREFIXES = ["/login", "/signup", "/set-password", "/api/auth", "/api/dev", "/share"];

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
