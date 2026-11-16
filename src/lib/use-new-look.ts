"use client";

import { usePathname } from "next/navigation";
import { useLook } from "./use-look";
import { surfaceForPath } from "./surface";

/**
 * True only for the new look on an admin page. The server and the first client render are the old
 * look (useLook's server snapshot), so markup that exists only in the new look can be gated on
 * this and hydration still matches. Founder, LP, auth and share pages are never "new look" in
 * stage 1, whatever is saved in the browser.
 */
export function useNewLook(): boolean {
  const { look } = useLook();
  const surface = surfaceForPath(usePathname());
  return look === "v2" && surface === "admin";
}
