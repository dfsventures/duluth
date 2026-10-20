// Part 39 (WS121). The sensitivity tier of every Marge tool (Q108-A, locked 2026-10-16).
//   team  = may answer a DM or a team channel
//   dm    = DM only (deal terms, amounts, valuations, portfolio totals)
//   write = a dry run is a read; an apply needs a write-scope token bound to the exact arguments
//   dm_write (Part 40, Q115-A) = a write whose dry run AND apply both need a DM
export type Tier = "team" | "dm" | "write" | "dm_write";
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

// Part 40 (WS129, JC-MM-G). The memo tools live in their own map and are registered only when
// MARGE_MEMO_TOOLS=on, so MARGE_TOOLS (and its tests) stay as they were and, with the flag off,
// tools/list is exactly the 13 above.
export const MARGE_MEMO_TOOLS = {
  memo_template_get: "team",
  memo_list: "dm",
  memo_get: "dm",
  memo_create: "dm_write",
  memo_update_section: "dm_write",
  memo_link_company: "dm_write",
} as const satisfies Record<string, Tier>;
export type MargeMemoToolName = keyof typeof MARGE_MEMO_TOOLS;
/** Read at call time, so flipping the variable and redeploying is the whole off switch. */
export const margeMemoToolsEnabled = (): boolean => process.env.MARGE_MEMO_TOOLS === "on";
export const isMemoToolName = (name: unknown): name is MargeMemoToolName =>
  typeof name === "string" && Object.prototype.hasOwnProperty.call(MARGE_MEMO_TOOLS, name);
