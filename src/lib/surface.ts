// Which visual surface a path belongs to. Direction B (rounded corners, soft
// shadows, warmer tints) applies to "founder" (founder, LP, auth and public
// pages); "admin" keeps Direction A+. Pure so it can be unit-tested.
export type Surface = "founder" | "admin";

export function surfaceForPath(pathname: string | null | undefined): Surface {
  return pathname?.startsWith("/admin") ? "admin" : "founder";
}
