import { Extension } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export const MAX_INDENT = 8;
export const REM_PER_LEVEL = 2;

/** Pure so it's testable without mounting an editor (house convention — see route-access.ts, sheet-sync.ts). */
export function nextIndentLevel(current: number, delta: number): number {
  return Math.min(MAX_INDENT, Math.max(0, current + delta));
}

/**
 * Inverse of renderHTML's margin-left, for parsing indentation back out of
 * stored HTML. `element.style.marginLeft` on a DOMParser-parsed (detached)
 * element preserves the unit as authored — "4rem", not resolved to px —
 * verified directly in headless Chrome against the exact parsing path
 * TipTap uses, since this differs from getComputedStyle() on a live,
 * attached element and is easy to get backwards.
 */
export function indentLevelFromMarginLeft(marginLeft: string): number {
  const rem = parseFloat(marginLeft || "0");
  return rem > 0 ? Math.round(rem / REM_PER_LEVEL) : 0;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

/**
 * Plain paragraph/heading indentation — distinct from bulletList/orderedList
 * (no <ul>/<li> semantics, just a left margin), because admins want to shift
 * a block of text inward without it becoming a list item. Renders as an
 * inline `style="margin-left: …rem"` (not a CSS class) so the indent
 * survives everywhere update/report/note bodies get rendered from raw
 * stored HTML — read views, the LP share page, emails — not just inside
 * the editor's own stylesheet. No sanitizer strips it (this app trusts its
 * own editor's HTML output; confirmed no DOMPurify/sanitize step exists).
 */
export const Indent = Extension.create({
  name: "indent",

  addOptions() {
    return { types: ["paragraph", "heading"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element: HTMLElement) => indentLevelFromMarginLeft(element.style.marginLeft),
            renderHTML: (attributes: { indent?: number }) => {
              const level = attributes.indent ?? 0;
              return level > 0 ? { style: `margin-left: ${level * REM_PER_LEVEL}rem` } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const step = (delta: number) => () => ({ tr, state, dispatch }: CommandProps) => {
      const { selection } = state;
      let changed = false;
      state.doc.nodesBetween(selection.from, selection.to, (node: ProseMirrorNode, pos: number) => {
        if (!this.options.types.includes(node.type.name)) return;
        const current = (node.attrs.indent as number | undefined) ?? 0;
        const next = nextIndentLevel(current, delta);
        if (next !== current) {
          tr.setNodeAttribute(pos, "indent", next);
          changed = true;
        }
      });
      if (changed && dispatch) dispatch(tr);
      return changed;
    };

    return {
      indent: step(1),
      outdent: step(-1),
    };
  },
});
