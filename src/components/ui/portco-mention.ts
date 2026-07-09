import Mention from "@tiptap/extension-mention";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";

export interface PortcoMentionItem {
  id: string;
  label: string;
}

/**
 * Portfolio-company mention for fund reports (Part 7, WS17.1). Deterministic
 * HTML so the server can extract mentioned ids with one regex:
 *   <span data-portco="<id>" class="portco-mention">Name</span>
 *
 * `.extend()` overrides the node's attribute parsing/serialization (so the
 * custom `data-portco` markup round-trips back into mention nodes when a
 * saved report is reopened for editing); `.configure()` sets the actual
 * render output and the suggestion behavior (the `@` picker).
 */
const PortcoMentionNode = Mention.extend({
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-portco"),
        renderHTML: (attributes: { id?: string | null }) => (attributes.id ? { "data-portco": attributes.id } : {}),
      },
      label: {
        default: null,
        parseHTML: (element: HTMLElement) => element.textContent,
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span.portco-mention" }];
  },
});

export function portcoMention(fetchItems: (query: string) => Promise<PortcoMentionItem[]>) {
  return PortcoMentionNode.configure({
    HTMLAttributes: {},
    renderHTML({ node }) {
      return ["span", { "data-portco": node.attrs.id, class: "portco-mention" }, node.attrs.label as string];
    },
    suggestion: {
      char: "@",
      items: async ({ query }) => fetchItems(query),
      render: createSuggestionRenderer,
    },
  });
}

// ─── Plain-DOM suggestion dropdown (no tippy.js / new UI dep) ──────────────

function createSuggestionRenderer() {
  let el: HTMLDivElement | null = null;
  let items: PortcoMentionItem[] = [];
  let selectedIndex = 0;
  let command: ((attrs: { id: string; label: string }) => void) | null = null;

  function renderList() {
    if (!el) return;
    el.innerHTML = "";
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "px-3 py-2 text-sm text-muted-foreground";
      empty.textContent = "No matching companies";
      el.appendChild(empty);
      return;
    }
    items.forEach((item, i) => {
      const row = document.createElement("button");
      row.type = "button";
      row.textContent = item.label;
      row.className = [
        "block w-full px-3 py-1.5 text-left text-sm",
        i === selectedIndex ? "bg-primary-50 text-primary-700" : "text-foreground hover:bg-muted",
      ].join(" ");
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        command?.({ id: item.id, label: item.label });
      });
      el?.appendChild(row);
    });
  }

  function positionAt(rect: DOMRect | null) {
    if (!el || !rect) return;
    el.style.position = "fixed";
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.bottom + 4}px`;
  }

  return {
    onStart: (props: SuggestionProps<PortcoMentionItem, { id: string; label: string }>) => {
      items = props.items;
      selectedIndex = 0;
      command = props.command;
      el = document.createElement("div");
      el.className = "z-50 max-h-56 w-56 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg";
      document.body.appendChild(el);
      positionAt(props.clientRect?.() ?? null);
      renderList();
    },
    onUpdate: (props: SuggestionProps<PortcoMentionItem, { id: string; label: string }>) => {
      items = props.items;
      selectedIndex = Math.min(selectedIndex, Math.max(items.length - 1, 0));
      command = props.command;
      positionAt(props.clientRect?.() ?? null);
      renderList();
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === "Escape") {
        el?.remove();
        el = null;
        return true;
      }
      if (props.event.key === "ArrowDown") {
        selectedIndex = items.length > 0 ? (selectedIndex + 1) % items.length : 0;
        renderList();
        return true;
      }
      if (props.event.key === "ArrowUp") {
        selectedIndex = items.length > 0 ? (selectedIndex - 1 + items.length) % items.length : 0;
        renderList();
        return true;
      }
      if (props.event.key === "Enter") {
        const item = items[selectedIndex];
        if (item) command?.({ id: item.id, label: item.label });
        return true;
      }
      return false;
    },
    onExit: () => {
      el?.remove();
      el = null;
    },
  };
}
