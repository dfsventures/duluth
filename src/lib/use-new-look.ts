"use client";

import { usePathname } from "next/navigation";
import { useLook } from "./use-look";
import { inNewLookScope } from "./surface";

/**
 * True only for the new look on a page it reaches: an admin page, or (stage 2, PLAN-1 WS165) a
 * founder page in the app shell. The server and the first client render are the old look (useLook's
 * server snapshot), so markup that exists only in the new look can be gated on this and hydration
 * still matches. Since WS166 the LP portal, sign-in pages and home count too; share pages and the report
 * preview frame are never "new look", whatever is saved in the browser.
 */
export function useNewLook(): boolean {
  const { look } = useLook();
  const pathname = usePathname(); // always called: a hook can't sit behind the && (hooks order)
  return look === "v2" && inNewLookScope(pathname);
}
