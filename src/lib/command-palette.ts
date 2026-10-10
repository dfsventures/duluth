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
}

export const GROUP_ORDER: PaletteGroup[] = ["Go to", "Actions", "Companies", "Funds", "Deals", "LPs"];

export function buildPaletteItems(index: SearchIndex | null): PaletteItem[] {
  const ix = index ?? EMPTY_INDEX;
  const items: PaletteItem[] = [];

  for (const p of ALL_ADMIN_PAGES) {
    items.push({ id: `page:${p.href}`, group: "Go to", label: p.label, hint: "Page", href: p.href, keywords: p.keywords ?? [] });
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
    items.push({ id: `company:${c.id}`, group: "Companies", label: c.name, hint: "Company", href: `/admin/companies/${c.id}`, keywords: [] });
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
