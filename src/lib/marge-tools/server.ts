// Part 39 (WS123). The MCP handler and the one gate every tool passes (runTool).
// All tool logic is in plain functions (read.ts, write.ts); this file only registers them.
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { logAdminAction } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  margeMcpMode,
  argsHash,
  MARGE_LIMITS,
  type MargeClaims,
  type Principal,
} from "@/lib/marge-auth";
import { MARGE_TOOLS, type MargeToolName, type Tier } from "@/lib/marge-tools/tiers";
import { ToolError, type ToolOutput } from "@/lib/marge-tools/types";
import * as read from "@/lib/marge-tools/read";
import * as write from "@/lib/marge-tools/write";

/** Set by the route (from the verified assertion) for tools/call; undefined for discover/list. */
export type MargeCall = {
  claims: MargeClaims;
  principal: Principal;
};

type ToolFn = (input: any, p: Principal, opts: write.WriteOpts) => Promise<ToolOutput>;
interface ToolDef {
  name: MargeToolName;
  description: string;
  inputSchema: z.ZodObject<any>;
  tier: Tier;
  fn: ToolFn;
}

const readFn =
  <I,>(f: (input: I, p: Principal) => Promise<ToolOutput>): ToolFn =>
  (input, p) =>
    f(input, p);
const w = (f: (input: any, p: Principal, opts: write.WriteOpts) => Promise<ToolOutput>): ToolFn => f;

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "companies_find",
    description: "Find portfolio companies by name. Returns sector, geography, stage, last update date and update cadence.",
    inputSchema: read.companiesFindInput,
    tier: MARGE_TOOLS.companies_find,
    fn: readFn(read.companiesFind),
  },
  {
    name: "company_overview",
    description: "One company: profile, its latest 3 sent updates (founder-written text) and the latest value of each metric. Takes an id or an exact name.",
    inputSchema: read.companyOverviewInput,
    tier: MARGE_TOOLS.company_overview,
    fn: readFn(read.companyOverview),
  },
  {
    name: "updates_recent",
    description: "Founder updates sent in the last N days (default 14): company, title, period and date. No bodies.",
    inputSchema: read.updatesRecentInput,
    tier: MARGE_TOOLS.updates_recent,
    fn: readFn(read.updatesRecent),
  },
  {
    name: "board_cards",
    description: "Team board cards, filtered by owner (\"me\" or a name), project, status, or due before a date (exclusive). Done cards are hidden unless includeDone.",
    inputSchema: read.boardCardsInput,
    tier: MARGE_TOOLS.board_cards,
    fn: readFn(read.boardCards),
  },
  {
    name: "broadcasts_list",
    description: "Broadcasts to portfolio companies with status and delivery counts. No recipient addresses.",
    inputSchema: read.broadcastsListInput,
    tier: MARGE_TOOLS.broadcasts_list,
    fn: readFn(read.broadcastsList),
  },
  {
    name: "broadcast_get",
    description: "One broadcast: subject, status, plain-text body, target companies and delivery counts.",
    inputSchema: read.broadcastGetInput,
    tier: MARGE_TOOLS.broadcast_get,
    fn: readFn(read.broadcastGet),
  },
  {
    name: "portfolio_summary",
    description: "Deal ledger totals per fund and overall: deal count, companies, total invested, blended implied value. DM only.",
    inputSchema: read.portfolioSummaryInput,
    tier: MARGE_TOOLS.portfolio_summary,
    fn: readFn(read.portfolioSummary),
  },
  {
    name: "company_deals",
    description: "One portfolio company's deals: fund, date, type, amount, instrument, valuations, ownership, multiple. DM only.",
    inputSchema: read.companyDealsInput,
    tier: MARGE_TOOLS.company_deals,
    fn: readFn(read.companyDeals),
  },
  {
    name: "board_card_create",
    description: "Create a board card. dryRun defaults to true and returns a preview; nothing is written until the requester confirms.",
    inputSchema: write.boardCardCreateInput,
    tier: MARGE_TOOLS.board_card_create,
    fn: w(write.boardCardCreate),
  },
  {
    name: "board_card_update",
    description: "Edit a board card (title, notes, owners, project, due date). Needs expectedUpdatedAt from the preview. dryRun defaults to true.",
    inputSchema: write.boardCardUpdateInput,
    tier: MARGE_TOOLS.board_card_update,
    fn: w(write.boardCardUpdate),
  },
  {
    name: "board_card_move",
    description: "Move a board card to another column (end of the column). Needs expectedUpdatedAt from the preview. dryRun defaults to true.",
    inputSchema: write.boardCardMoveInput,
    tier: MARGE_TOOLS.board_card_move,
    fn: w(write.boardCardMove),
  },
  {
    name: "board_card_add_link",
    description: "Add a proof-of-work link to a board card. dryRun defaults to true.",
    inputSchema: write.boardCardAddLinkInput,
    tier: MARGE_TOOLS.board_card_add_link,
    fn: w(write.boardCardAddLink),
  },
  {
    name: "broadcast_draft_save",
    description: "Create or edit a DRAFT broadcast from plain text. Never publishes or sends. dryRun defaults to true.",
    inputSchema: write.broadcastDraftSaveInput,
    tier: MARGE_TOOLS.broadcast_draft_save,
    fn: w(write.broadcastDraftSave),
  },
];

type McpResult = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const errorResult = (text: string): McpResult => ({ content: [{ type: "text", text }], isError: true });

export const DENIED = {
  off: "Molly isn't available right now.",
  noCall: "Molly couldn't verify who is asking.",
  dmOnly: "That's DM-only. Ask me in a DM.",
  readOnly: "Molly is in read-only mode for Marge.",
  notConfirmed: "That change wasn't confirmed, so nothing was changed.",
  rateLimit: "That's more requests than allowed this hour. Try again later.",
  problem: "Molly had a problem; nothing was changed.",
} as const;

/** Audit a refusal after a valid signature. Ids, tool name, reason and context only: never arguments. */
export async function auditDenied(
  actor: { id?: string; email?: string | null },
  claims: Pick<MargeClaims, "ctx">,
  tool: string,
  reason: string
) {
  await logAdminAction(actor, "MARGE_DENIED", {
    targetType: "MargeTool",
    targetId: tool,
    metadata: { via: "marge", tool, reason, ctx: claims.ctx },
  });
}

/** The one gate every tool passes (plan WS123.1, in this order). */
export async function runTool(def: ToolDef, input: Record<string, unknown>, call: MargeCall | undefined): Promise<McpResult> {
  // 1. The route must have verified the assertion and resolved the person.
  if (!call) return errorResult(DENIED.noCall);
  const { claims, principal } = call;
  const deny = async (reason: string, text: string) => {
    await auditDenied(principal, claims, def.name, reason);
    return errorResult(text);
  };

  // 2. Kill switch, tier, and the write contract.
  const mode = margeMcpMode();
  if (mode === "off") return deny("off", DENIED.off);
  if (def.tier === "dm" && claims.ctx !== "private") return deny("tier", DENIED.dmOnly);
  const isApply = def.tier === "write" && input.dryRun === false;
  if (isApply) {
    if (mode !== "write") return deny("read_only", DENIED.readOnly);
    if (claims.scope !== "write" || claims.act?.tool !== def.name || claims.act.h !== argsHash(input)) {
      return deny("not_confirmed", DENIED.notConfirmed);
    }
  }

  // 3. Rate limits (fail open, like every other bucket; JC-MG-H).
  const withinGlobal = await checkRateLimit("marge", "global", MARGE_LIMITS.globalPerHour);
  const withinUser = isApply
    ? await checkRateLimit("marge-write", principal.id, MARGE_LIMITS.writePerHour)
    : await checkRateLimit("marge-read", principal.id, MARGE_LIMITS.readPerHour);
  if (!withinGlobal || !withinUser) return deny("rate_limit", DENIED.rateLimit);

  // 4. Run. A ToolError is a user-facing sentence; anything else is logged by tool name only.
  try {
    const out = await def.fn(input, principal, {
      dryRun: !isApply,
      via: isApply ? { via: "marge", margeActionId: claims.act!.aid } : undefined,
    });
    // 5. Audit. An apply is audited inside the WS119 function under the existing action name (JC-MG-F).
    if (!isApply) {
      await logAdminAction(principal, "MARGE_READ", {
        targetType: "MargeTool",
        targetId: def.name,
        metadata: { via: "marge", ctx: claims.ctx, count: out.count, dryRun: def.tier === "write" },
      });
    }
    return { content: [{ type: "text", text: out.text }], structuredContent: out.structured };
  } catch (err) {
    if (err instanceof ToolError) {
      if (isApply) await auditDenied(principal, claims, def.name, err.code === "conflict" ? "conflict" : "apply_refused");
      else {
        await logAdminAction(principal, "MARGE_READ", {
          targetType: "MargeTool",
          targetId: def.name,
          metadata: { via: "marge", ctx: claims.ctx, count: 0, dryRun: def.tier === "write", refused: true },
        });
      }
      return errorResult(err.message);
    }
    console.error(`marge tool ${def.name} failed`); // tool name only: error text can echo arguments
    if (isApply) await auditDenied(principal, claims, def.name, "apply_failed");
    return errorResult(DENIED.problem);
  }
}

/** Built once per server instance; each request gets a fresh McpServer (stateless, JSON responses). */
export const margeHandler = createMcpHandler(
  ({ authInfo }) => {
    const s = new McpServer({ name: "molly", version: "1" });
    const call = authInfo?.extra as MargeCall | undefined; // set by the route; undefined for discover/list
    for (const def of TOOL_DEFS) {
      s.registerTool(def.name, { description: def.description, inputSchema: def.inputSchema }, async (input: Record<string, unknown>) =>
        runTool(def, input, call)
      );
    }
    return s;
  },
  { responseMode: "json", maxRequestBodySize: 64_000 }
);
