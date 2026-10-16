// Part 39 (WS121). The sensitivity tier of every Marge tool (Q108-A, locked 2026-10-16).
//   team  = may answer a DM or a team channel
//   dm    = DM only (deal terms, amounts, valuations, portfolio totals)
//   write = a dry run is a read; an apply needs a write-scope token bound to the exact arguments
export type Tier = "team" | "dm" | "write";
export const MARGE_TOOLS = {
  companies_find: "team",
  company_overview: "team",
  updates_recent: "team",
  board_cards: "team",
  broadcasts_list: "team",
  broadcast_get: "team",
  portfolio_summary: "dm",
  company_deals: "dm",
  board_card_create: "write",
  board_card_update: "write",
  board_card_move: "write",
  board_card_add_link: "write",
  broadcast_draft_save: "write",
} as const satisfies Record<string, Tier>;
export type MargeToolName = keyof typeof MARGE_TOOLS;
