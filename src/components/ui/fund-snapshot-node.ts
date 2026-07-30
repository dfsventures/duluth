import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Part 14, WS34.1 — a plain TipTap block atom node, the same "marker now,
 * real render later" plumbing shape as portco-mention.ts, but block-level
 * and always-visible with no Suggestion/picker machinery (a report is
 * always scoped to exactly one fund — Q43/finding #4 — so there's only one
 * fund to insert).
 *
 * No ReactNodeViewRenderer/NodeViewWrapper here (finding #5 — no precedent
 * exists anywhere in this codebase yet): editor-time content is a static
 * placeholder rendered via plain renderHTML, same posture as Image/Link/the
 * portco mention. JC-A: the real stat-strip-plus-table only ever renders in
 * ReportView (Preview + published/LP pages), never inside the editing
 * surface itself.
 *
 * Deterministic HTML so the publish route can detect it with one regex
 * (report-snapshot.ts's hasFundSnapshotMarker):
 *   <div data-fund-snapshot="true" data-fund-id="<id>" data-fund-name="<name>" class="fund-snapshot-block">…</div>
 */
export const FundSnapshotNode = Node.create({
  name: "fundSnapshot",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      fundId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-fund-id"),
        renderHTML: (attrs: { fundId?: string | null }) => ({ "data-fund-id": attrs.fundId }),
      },
      fundName: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-fund-name"),
        renderHTML: (attrs: { fundName?: string | null }) => ({ "data-fund-name": attrs.fundName }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-fund-snapshot]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-fund-snapshot": "true", class: "fund-snapshot-block" }),
      `Fund performance snapshot — ${HTMLAttributes["data-fund-name"] ?? "this fund"} (updates when published)`,
    ];
  },
});
