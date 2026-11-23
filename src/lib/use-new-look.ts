"use client";

import { usePathname } from "next/navigation";
import { inNewLookScope } from "./surface";

/**
 * True on a page the app's look reaches: every admin page, the founder app pages, the LP portal, the
 * sign-in pages and home. False on the pages that keep their own look (investor share links,
 * /investors, the bare update download page). Path only, so the server and the client agree.
 */
export function useNewLook(): boolean {
  return inNewLookScope(usePathname());
}
