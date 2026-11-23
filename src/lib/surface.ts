// Which visual surface a path belongs to. Direction B (rounded corners, soft
// shadows, warmer tints) applies to "founder" (founder, LP, auth and public
// pages); "admin" keeps Direction A+. Pure so it can be unit-tested.
export type Surface = "founder" | "admin";

export function surfaceForPath(pathname: string | null | undefined): Surface {
  return pathname?.startsWith("/admin") ? "admin" : "founder";
}

/**
 * The founder pages that sit in the app shell (sidebar and all). Stage 2 of the new look (PLAN-1,
 * WS165) reaches these.
 */
export const FOUNDER_APP_PREFIXES = [
  "/dashboard",
  "/updates",
  "/from-dfs",
  "/company",
  "/planner",
  "/links",
  "/team",
  "/providers",
  "/diligence",
  "/setup-wizard",
] as const;

/**
 * The pages outside the shell that the new look reaches since stage 2 (PLAN-1, WS166): the LP portal,
 * the sign-in pages and the home page ("/" exactly). Investor share links (/share/*, /investors) never do.
 */
export const PUBLIC_NEW_LOOK_PREFIXES = ["/lp", "/login", "/signup", "/set-password"] as const;

/**
 * True for the paths the app's look reaches (one look since WS168): every /admin page (the report
 * preview frame included, which shows the LP look since WS168), the founder app pages and the public
 * pages above. CSS decides the same thing with [data-v2-scope], which AppShell, the LP layout,
 * AuthLayout, the home page and the preview frame (and <body>, through SurfaceSync) carry. Investor
 * share links, /investors and the bare update download page keep their own look.
 */
export function inNewLookScope(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (surfaceForPath(pathname) === "admin") return true;
  if (pathname === "/") return true;
  if (PUBLIC_NEW_LOOK_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  // /updates/[id]/download is a bare print page outside the shell.
  if (/^\/updates\/[^/]+\/download(\/|$)/.test(pathname)) return false;
  return FOUNDER_APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
