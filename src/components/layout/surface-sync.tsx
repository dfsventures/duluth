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
 * It also mirrors the shell's new-look scope (data-v2-scope), so those layers get the new look on
 * every page the shell's own content does (admin and founder app pages), and nowhere else.
 */
export function SurfaceSync({ surface }: { surface: "founder" | "admin" }) {
  useEffect(() => {
    const body = document.body;
    body.setAttribute("data-surface", surface);
    body.setAttribute("data-v2-scope", "");
    return () => {
      if (body.getAttribute("data-surface") === surface) {
        body.removeAttribute("data-surface");
        body.removeAttribute("data-v2-scope");
      }
    };
  }, [surface]);
  return null;
}
