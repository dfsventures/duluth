// Which visual surface a path belongs to. Direction B (rounded corners, soft
// shadows, warmer tints) applies to "founder" (founder, LP, auth and public
// pages); "admin" keeps Direction A+. Pure so it can be unit-tested.
export type Surface = "founder" | "admin";

export function surfaceForPath(pathname: string | null | undefined): Surface {
  return pathname?.startsWith("/admin") ? "admin" : "founder";
}

/**
 * The founder pages that sit in the app shell (sidebar and all). Stage 2 of the new look (PLAN-1,
 * WS165) reaches these; the LP portal, sign-in pages, the home page and investor share links do not.
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
 * True for the paths the new look reaches: every /admin page and the founder app pages above. CSS
 * decides the same thing with [data-v2-scope], which only AppShell (and <body>, through SurfaceSync)
 * carries.
 */
export function inNewLookScope(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (surfaceForPath(pathname) === "admin") return true;
  // /updates/[id]/download is a bare print page outside the shell.
  if (/^\/updates\/[^/]+\/download(\/|$)/.test(pathname)) return false;
  return FOUNDER_APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
