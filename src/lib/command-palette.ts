// Command palette content (spec 6.9). Pure: turns the admin search index into
// the list of items; cmdk does the fuzzy matching and the UI is separate.

import { ALL_ADMIN_PAGES } from "./admin-nav";

export interface SearchIndex {
  companies: { id: string; name: string }[];
  funds: { id: string; name: string }[];
  portfolioCompanies: { id: string; name: string }[];
  lps: { id: string; name: string }[];
}

export const EMPTY_INDEX: SearchIndex = { companies: [], funds: [], portfolioCompanies: [], lps: [] };

export type PaletteGroup = "Go to" | "Actions" | "Companies" | "Funds" | "Deals" | "LPs";

export interface PaletteItem {
  /** Unique, also the cmdk value. */
  id: string;
  group: PaletteGroup;
  label: string;
  /** Small right-hand tag. */
  hint: string;
  href: string;
  keywords: string[];
  /** Set on items that do something in place instead of navigating (href is then empty). */
  action?: "toggle-theme" | "filter-list" | "prefill-filter" | "open-pane";
  /** filter-list: the text to filter the page's list by ("" clears it). */
  filterText?: string;
  /** open-pane: the record to open in the page's pane (?open=<id>). */
  openId?: string;
}

/** Sent to the page's list (DataTable) by "Filter: …" in the palette. detail: { text }. */
export const FILTER_LIST_EVENT = "molly:filter-list";
/** A list that can take FILTER_LIST_EVENT (new look, with its search box showing). */
export const FILTERABLE_LIST_SELECTOR = "[data-datatable][data-filterable]";

/** The text after "Filter:" when the query starts with it, else null. */
export function parseFilterQuery(query: string): string | null {
  const m = /^\s*filter:\s?(.*)$/i.exec(query);
  return m ? m[1].trim() : null;
}

/**
 * "Filter: …" on the current list (PLAN-1, WS164; new look only, and only when the page has a
 * list with a search box). A query starting "Filter:" offers one item that filters the list by
 * the rest of it; otherwise a "Filter this list" action that puts "Filter: " in the box.
 * The raw query is a keyword so cmdk always keeps the item.
 */
export function filterListItems(query: string, hasList: boolean): PaletteItem[] {
  if (!hasList) return [];
  const term = parseFilterQuery(query);
  if (term === null) {
    return [
      {
        id: "action:filter-list",
        group: "Actions",
        label: "Filter this list",
        hint: "F",
        href: "",
        keywords: ["filter", "search", "find"],
        action: "prefill-filter",
      },
    ];
  }
  return [
    {
      id: "action:filter-list-by",
      group: "Actions",
      label: term ? `Filter this list: “${term}”` : "Filter this list: type what to look for",
      hint: "Action",
      href: "",
      keywords: [query],
      action: "filter-list",
      filterText: term,
    },
  ];
}

/** The light/dark item (PLAN-1, WS156). The new-look switch that sat beside it went in WS168. */
export function themeActionItems(theme: "light" | "dark"): PaletteItem[] {
  return [
    {
      id: "action:toggle-theme",
      group: "Actions",
      label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
      hint: "Action",
      href: "",
      keywords: ["theme", "dark", "light", "mode"],
      action: "toggle-theme",
    },
  ];
}

export const GROUP_ORDER: PaletteGroup[] = ["Go to", "Actions", "Companies", "Funds", "Deals", "LPs"];

/** The page whose company rows open in a pane beside the list. */
export const COMPANIES_PATH = "/admin/companies";

export function buildPaletteItems(index: SearchIndex | null, pathname: string | null = null): PaletteItem[] {
  const ix = index ?? EMPTY_INDEX;
  // On Companies: a company opens in the pane beside the list instead of its page.
  const companyInPane = pathname === COMPANIES_PATH;
  const items: PaletteItem[] = [];

  for (const p of ALL_ADMIN_PAGES) {
    const label = p.labelV2 ?? p.label;
    items.push({ id: `page:${p.href}`, group: "Go to", label, hint: "Page", href: p.href, keywords: p.keywords ?? [] });
  }
  items.push({
    id: "action:add-company",
    group: "Actions",
    label: "Add company",
    hint: "Action",
    href: "/admin/companies/new",
    keywords: ["new", "create"],
  });
  for (const c of ix.companies) {
    if (companyInPane) {
      items.push({
        id: `company:${c.id}`,
        group: "Companies",
        label: `Open ${c.name}`,
        hint: "Pane",
        href: "",
        keywords: [c.name],
        action: "open-pane",
        openId: c.id,
      });
    } else {
      items.push({ id: `company:${c.id}`, group: "Companies", label: c.name, hint: "Company", href: `/admin/companies/${c.id}`, keywords: [] });
    }
  }
  for (const f of ix.funds) {
    items.push({ id: `fund:${f.id}`, group: "Funds", label: f.name, hint: "Fund", href: `/admin/funds/${f.id}`, keywords: [] });
  }
  for (const p of ix.portfolioCompanies) {
    items.push({ id: `deal:${p.id}`, group: "Deals", label: p.name, hint: "Deals", href: `/admin/portfolio/${p.id}`, keywords: ["portfolio", "ledger"] });
  }
  for (const l of ix.lps) {
    // LPs have no detail page: land on the list, filtered to them.
    items.push({
      id: `lp:${l.id}`,
      group: "LPs",
      label: l.name,
      hint: "LP",
      href: `/admin/lps?q=${encodeURIComponent(l.name)}`,
      keywords: [],
    });
  }
  return items;
}

/** "New update for X" actions, offered only once the query looks like a request for them. */
export function newUpdateItems(index: SearchIndex | null, query: string): PaletteItem[] {
  if (!/^\s*(new|add|write|update)/i.test(query)) return [];
  return (index ?? EMPTY_INDEX).companies.map((c) => ({
    id: `action:new-update:${c.id}`,
    group: "Actions" as const,
    label: `New update for ${c.name}`,
    hint: "Action",
    href: `/admin/companies/${c.id}/updates/new`,
    keywords: [],
  }));
}
