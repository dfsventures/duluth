"use client";

import { useEffect } from "react";

/**
 * Mirrors the page's visual surface ("founder" or "admin") onto <body>.
 *
 * Direction B tokens (radius scale, soft shadows) are scoped to
 * [data-surface="founder"]. Dialogs, sheets, menus and toasts portal to <body>,
 * outside the shell element that carries the attribute, so without this they
 * would always render with the admin (square) tokens. Setting the attribute on
 * <body> makes the portalled layers inherit the right tokens for the page that
 * opened them. /admin pages set "admin", which no B rule matches. The attribute
 * is removed on unmount so unmarked routes (e.g. investor share links) keep the
 * defaults.
 *
 * With `newLookScope`, it also mirrors the new-look scope (data-v2-scope), so those layers get the
 * new look on the pages whose own wrapper carries it: AppShell (admin and founder app pages) and,
 * since stage 2 (WS166), the LP portal and the sign-in pages. Pages that must never change (the
 * report preview frame) leave it off.
 */
export function SurfaceSync({ surface, newLookScope = false }: { surface: "founder" | "admin"; newLookScope?: boolean }) {
  useEffect(() => {
    const body = document.body;
    body.setAttribute("data-surface", surface);
    if (newLookScope) body.setAttribute("data-v2-scope", "");
    return () => {
      if (body.getAttribute("data-surface") === surface) {
        body.removeAttribute("data-surface");
        if (newLookScope) body.removeAttribute("data-v2-scope");
      }
    };
  }, [surface, newLookScope]);
  return null;
}
