// The admin navigation, as data. One source for the sidebar, the command
// palette ("Go to ...") and the `g` keyboard shortcuts, so a page added here
// shows up in all three. Icons stay in the sidebar (this file is pure data).

export interface AdminPage {
  label: string;
  href: string;
  /** Extra words the palette matches on ("lp" finds Investors, etc.). */
  keywords?: string[];
  /** `g` then this key jumps here. Unique across the list. */
  goto?: string;
}

export interface AdminNavGroup {
  label: string;
  items: AdminPage[];
}

export const ADMIN_DASHBOARD: AdminPage = { label: "Dashboard", href: "/admin", goto: "d", keywords: ["home", "overview"] };

// Part 11, WS28 (Q28-A): three labelled clusters plus Admin Tools. "Sync" is a
// tab on /admin/funds and "Update Templates" a tab on /admin/updates, so
// neither appears here (see the notes that used to live in sidebar.tsx).
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Company Operations",
    items: [
      { label: "Approvals", href: "/admin/approvals", goto: "a", keywords: ["pending", "signups"] },
      { label: "Diligence", href: "/admin/diligence", goto: "i", keywords: ["dd", "review"] },
      { label: "Companies", href: "/admin/companies", goto: "c", keywords: ["portfolio", "startups"] },
      { label: "Updates", href: "/admin/updates", goto: "u", keywords: ["investor updates", "templates"] },
      { label: "Investor Links", href: "/admin/links", goto: "v", keywords: ["share", "links"] },
    ],
  },
  {
    label: "Funds & LPs",
    items: [
      { label: "Funds", href: "/admin/funds", goto: "f", keywords: ["sync", "sheet"] },
      { label: "Deal Ledger", href: "/admin/portfolio", goto: "p", keywords: ["deals", "portfolio", "investments"] },
      { label: "Portfolio Contacts", href: "/admin/portfolio-contacts", keywords: ["contacts"] },
      { label: "LPs", href: "/admin/lps", goto: "l", keywords: ["limited partners", "investors"] },
      { label: "Fund Reports", href: "/admin/reports", goto: "r", keywords: ["reports", "quarterly"] },
      { label: "Broadcasts", href: "/admin/broadcasts", goto: "o", keywords: ["email", "announce"] },
    ],
  },
  {
    label: "Team & Resources",
    items: [
      { label: "Team Board", href: "/admin/board", goto: "b", keywords: ["tasks", "kanban", "todo"] },
      { label: "Weekly Digest", href: "/admin/digest", goto: "w", keywords: ["digest", "meeting"] },
      { label: "Service Providers", href: "/admin/providers", keywords: ["vendors", "providers"] },
    ],
  },
  {
    label: "Admin Tools",
    items: [
      { label: "Audit Log", href: "/admin/audit", goto: "t", keywords: ["sign-ins", "history", "security"] },
      { label: "Settings", href: "/admin/settings", goto: "s", keywords: ["email", "storage", "integrations"] },
    ],
  },
];

export const ALL_ADMIN_PAGES: AdminPage[] = [ADMIN_DASHBOARD, ...ADMIN_NAV_GROUPS.flatMap((g) => g.items)];

/** key -> page, for `g` shortcuts. */
export function gotoTargets(): Record<string, AdminPage> {
  const out: Record<string, AdminPage> = {};
  for (const p of ALL_ADMIN_PAGES) if (p.goto) out[p.goto] = p;
  return out;
}
