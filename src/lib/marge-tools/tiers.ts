import { PORTCO_TOOL_TIERS, COMPANY_TOOL_TIERS, MARGE_PORTCO_FLAG, MARGE_COMPANY_CREATE_FLAG } from "@/lib/marge-tools/portco-contract";

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

// Part 45 (WS150, JC-FU-J). Founder-update tools: five behind MARGE_PORTCO_TOOLS=on, and company_create
// only when MARGE_COMPANY_CREATE=on as well. MARGE_TOOLS and MARGE_MEMO_TOOLS are untouched. The tiers
// are the contract's (portco-contract.ts); they are restated here with `satisfies Tier` so a typo fails typecheck.
export const MARGE_PORTCO_TOOLS = PORTCO_TOOL_TIERS satisfies Record<string, Tier>;
export const MARGE_COMPANY_TOOLS = COMPANY_TOOL_TIERS satisfies Record<string, Tier>;
export type MargePortcoToolName = keyof typeof MARGE_PORTCO_TOOLS;
export type MargeCompanyToolName = keyof typeof MARGE_COMPANY_TOOLS;
export const margePortcoToolsEnabled = (): boolean => process.env[MARGE_PORTCO_FLAG] === "on";
/** company_create needs BOTH flags: MARGE_COMPANY_CREATE alone does nothing. */
export const margeCompanyCreateEnabled = (): boolean => margePortcoToolsEnabled() && process.env[MARGE_COMPANY_CREATE_FLAG] === "on";
export const isPortcoToolName = (name: unknown): name is MargePortcoToolName =>
  typeof name === "string" && Object.prototype.hasOwnProperty.call(MARGE_PORTCO_TOOLS, name);
export const isCompanyToolName = (name: unknown): name is MargeCompanyToolName =>
  typeof name === "string" && Object.prototype.hasOwnProperty.call(MARGE_COMPANY_TOOLS, name);
