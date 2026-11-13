// Part 45 (WS149/WS150, JC-FU-J). THE CONTRACT for Marge's founder-update tools: input schemas, sentences,
// reason codes, preview actions, flag names and the shapes of every structuredContent. This file imports
// only `zod` (no database, no Molly module), so Marge copies it verbatim into
// tests/helpers/molly-portco-contract.ts and builds her FakeMolly against it.
//
// Rules (Part 40's JC-MM-I, Part 45's F160):
//   - no zod default except `dryRun`;
//   - zod carries types and generous OUTER caps (so oversized junk dies early); every bound that has a
//     sentence is enforced by the validators in src/lib/founder-update-validate.ts, because a zod rejection
//     happens in the SDK before runTool, writes no audit row and returns zod's wording, not ours;
//   - nothing here ever carries an email address.
import { z } from "zod";

// ── flags ─────────────────────────────────────────────────────────────────────────────────
/** `on` registers updates_list, metrics_list, company_match, update_create, metric_value_set. */
export const MARGE_PORTCO_FLAG = "MARGE_PORTCO_TOOLS";
/** `on` (and only together with MARGE_PORTCO_TOOLS) registers company_create and lets update_create take newCompany. */
export const MARGE_COMPANY_CREATE_FLAG = "MARGE_COMPANY_CREATE";
/** Env name that raises or lowers the 24-hour creation fuse (default 60). */
export const MARGE_COMPANY_CREATE_PER_DAY_ENV = "MARGE_COMPANY_CREATE_PER_DAY";
export const DEFAULT_COMPANY_CREATE_PER_DAY = 60;

// ── tools and tiers ───────────────────────────────────────────────────────────────────────
// team = DM or team channel; dm = DM only; dm_write = dry run AND apply both need a DM.
export const PORTCO_TOOL_TIERS = {
  updates_list: "team",
  metrics_list: "team",
  company_match: "dm",
  update_create: "dm_write",
  metric_value_set: "dm_write",
} as const;
export const COMPANY_TOOL_TIERS = { company_create: "dm_write" } as const;

// ── limits (the validators enforce these; the sentences below describe them) ─────────────
export const PORTCO_LIMITS = {
  nameMax: 200,
  websiteMax: 300,
  titleMax: 200,
  bodyMax: 40_000,
  metricsMax: 20,
  attachmentsMax: 10,
  quoteMax: 300,
  metricNameMax: 80,
  namesMax: 5,
  nameCandidateMax: 200,
  domainMax: 120,
  listLimitMax: 50,
  listLimitDefault: 20,
  valuesMax: 24,
  valuesDefault: 6,
  sourceTextMax: 300, // subject
  personMax: 120, // fromName, forwardedBy
  fromDomainMax: 120,
  valueAbsMax: 1e15, // exclusive
} as const;

// ── enumerations ──────────────────────────────────────────────────────────────────────────
export const UPDATE_SOURCE_EMAIL = "EMAIL_VIA_MARGE" as const;
/** Reason codes of company_match, strongest first. Tiers: see MATCH_TIER_OF. */
export const MATCH_REASONS = ["NAME_EXACT", "ALIAS_EXACT", "WEBSITE_DOMAIN", "CONTACT_DOMAIN", "NAME_TOKENS"] as const;
export type MatchReasonCode = (typeof MATCH_REASONS)[number];
export type MatchTierCode = "STRONG" | "MEDIUM" | "WEAK";
/** Companies: NAME_EXACT/ALIAS_EXACT/WEBSITE_DOMAIN STRONG, NAME_TOKENS WEAK. Unlinked ledger rows: NAME_EXACT STRONG, CONTACT_DOMAIN MEDIUM, NAME_TOKENS WEAK. */
export const MATCH_TIER_OF: Record<MatchReasonCode, MatchTierCode> = {
  NAME_EXACT: "STRONG",
  ALIAS_EXACT: "STRONG",
  WEBSITE_DOMAIN: "STRONG",
  CONTACT_DOMAIN: "MEDIUM",
  NAME_TOKENS: "WEAK",
};
export const COMPANY_STATES = ["active", "pending_signup", "diligence"] as const;
export type CompanyStateCode = (typeof COMPANY_STATES)[number];
/**
 * metricChecks[].action: "new" = a new figure on a definition given by id; "existing" = a new figure on a
 * definition found by name (case-insensitive) or created earlier in the same call; "new_metric" = the
 * definition will be created; "kept_founder" = a figure already in Molly for that period stays (it is in
 * `existing`, and may have been entered by a founder or an admin); "replace" = a figure added via Marge
 * earlier is replaced (`replaceValueId` was given).
 */
export const METRIC_CHECK_ACTIONS = ["new", "new_metric", "existing", "kept_founder", "replace"] as const;
export type MetricCheckAction = (typeof METRIC_CHECK_ACTIONS)[number];
export const VALUE_SOURCES = ["founder", "admin", "marge"] as const;
/** Why a ledger row cannot be linked on a dry run. ("unsupported" from Marge's proposal cannot occur.) */
export const LEDGER_REASONS = ["gone", "linked"] as const;
export type LedgerReason = (typeof LEDGER_REASONS)[number];
export const BLOCKED_BY_KINDS = ["company", "ledger"] as const;

/** MargePreview.action values added by Part 45. */
export const PORTCO_PREVIEW_ACTIONS = {
  addUpdate: "Add update",
  recordMetric: "Record metric",
  createCompany: "Create company",
  createCompanyAndUpdate: "Create company and add update",
} as const;

// ── input schemas ─────────────────────────────────────────────────────────────────────────
const date = z.string().describe("YYYY-MM-DD");

const newCompany = z.object({
  name: z.string().max(500).describe("1-200 characters of plain text"),
  ledgerId: z.string().max(100).optional(),
  website: z.string().max(1000).optional().describe("up to 300 characters, http or https"),
  idempotencyKey: z.string().max(200).describe("8-100 letters, digits, - or _"),
});

export const updatesListInput = z.object({
  company: z.string().max(200).describe("company id or exact name"),
  period: z.string().max(20).optional(),
  since: date.optional(),
  until: date.optional(),
  limit: z.number().int().optional().describe("1-50; 20 when omitted"),
});
export const metricsListInput = z.object({
  company: z.string().max(200),
  values: z.number().int().optional().describe("0-24; 6 when omitted"),
});
export const companyMatchInput = z.object({
  names: z.array(z.string().max(500)).max(10).describe("1-5 name candidates"),
  domain: z.string().max(200).optional().describe("the sender's domain, never an address"),
});
export const companyCreateInput = newCompany.extend({ dryRun: z.boolean().default(true) });

const source = z.object({
  kind: z.literal("slack_email"),
  channelId: z.string().max(40),
  messageTs: z.string().max(40),
  permalink: z.string().max(500),
  subject: z.string().max(1000).describe("up to 300 characters; never contains @"),
  fromName: z.string().max(500).describe("up to 120 characters; never contains @"),
  fromDomain: z.string().max(200).describe("up to 120 characters"),
  forwardedBy: z.string().max(500).describe("up to 120 characters; never contains @"),
  attachmentCount: z.number().int().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().max(300),
        mimetype: z.string().max(200).optional(),
        size: z.number().int().optional(),
      })
    )
    .max(50)
    .optional()
    .describe("at most 10"),
});

const metric = z.object({
  definitionId: z.string().max(100).optional(),
  name: z.string().max(200).optional().describe("up to 80 characters; exactly one of definitionId / name"),
  unit: z.string().max(40).nullable().optional(),
  value: z.number(),
  date,
  quote: z.string().max(1000).describe("1-300 characters: the founder's words"),
  replaceValueId: z.string().max(100).optional(),
});

export const updateCreateInput = z.object({
  companyId: z.string().max(100).optional(),
  newCompany: newCompany.optional(),
  period: z.string().max(20).describe("2025, 2025-H1, 2025-Q3 or 2025-09"),
  title: z.string().max(1000).describe("1-200 characters"),
  bodyText: z.string().max(60_000).describe("plain text, 1-40,000 characters"),
  sentAt: date.describe("the day the email arrived, YYYY-MM-DD"),
  source,
  metrics: z.array(metric).max(50).optional().describe("at most 20"),
  idempotencyKey: z.string().max(200).describe("8-100 letters, digits, - or _"),
  dryRun: z.boolean().default(true),
});

export const metricValueSetInput = metric.omit({ quote: true }).extend({
  companyId: z.string().max(100),
  quote: z.string().max(1000).optional().describe("up to 300 characters"),
  dryRun: z.boolean().default(true),
});

// ── sentences (MCP tool errors: one sentence each) ────────────────────────────────────────
export const PORTCO_SENTENCES = {
  // company resolution (Part 39's wording)
  noCompany: (raw: string, closest: string[]) => `No company called “${raw}”.${closest.length ? ` Closest: ${closest.join(", ")}.` : ""}`,
  ambiguousCompany: (raw: string, names: string[]) => `“${raw}” matches ${names.length} companies: ${names.join(", ")}. Use the id.`,
  companyXor: "Give either a company id or a new company, not both.",
  // creation
  companyExists: (raw: string, names: string[]) => `Molly already has a company that matches “${raw}”: ${names.join(", ")}. Nothing was created.`,
  ledgerLinked: (linkedTo: string) => `That deal-ledger entry is already linked to ${linkedTo}. Nothing was created.`,
  ledgerUnknown: "No deal-ledger entry with that id. Nothing was created.",
  badName: "A company name must be 1 to 200 characters of plain text.",
  badWebsite: "A website must be a web address starting with http:// or https://, up to 300 characters.",
  notAccepting: "Molly isn't accepting new companies from Marge right now.",
  fuse: "Too many companies were created through Marge today. Try again tomorrow, or add it in Molly.",
  // updates
  badPeriod: "The period must look like 2025-Q3, 2025-H1, 2025-09 or 2025.",
  badTitle: "An update title must be 1 to 200 characters.",
  badBody: "An update needs some text.",
  bodyTooLong: "An update is limited to 40,000 characters.",
  badDate: "Dates must look like 2025-09-30.",
  badSource: "The source email details are not valid.",
  sourceHasAddress: "The source details must not contain an email address.",
  tooManyAttachments: "An update can list at most 10 attachments.",
  tooManyMetrics: "An update can carry at most 20 figures.",
  // metrics
  otherCompanyMetric: "That metric belongs to another company.",
  keptFigure: "That figure was entered in Molly, so I left it as it is.",
  replaceUnknown: "No figure with that id.",
  metricXor: "Give either a metric id or a new metric name, not both.",
  badMetricName: "A metric name must be 1 to 80 characters.",
  badUnit: "A unit must be up to 40 characters.",
  badValue: "A figure must be a number below 1,000,000,000,000,000.",
  badQuote: "A quote must be 1 to 300 characters.",
  unknownMetric: "No metric with that id.",
  // reads
  badLimit: (max: number) => `limit must be a whole number from 1 to ${max}.`,
  badValuesCount: "values must be a whole number from 0 to 24.",
  badNames: "Give 1 to 5 names of 1 to 200 characters.",
  badDomain: "The domain must be up to 120 characters and never an email address.",
  // shared with Part 40
  badIdempotency: "idempotencyKey must be 8-100 letters, digits, - or _.",
  // after-commit text
  alreadyCreated: (name: string) => `Already created: ${name}.`,
  alreadyFiled: (title: string, url: string) => `Already filed from this email as “${title}”: ${url}`,
  samePeriod: (period: string, title: string, sent: string, by: string, preview: string) =>
    `Already an update for ${period}: “${title}” (sent ${sent}, by ${by}): ${preview}`,
  replacesMarge: (n: number) => `Replaces ${n} ${n === 1 ? "figure" : "figures"} added via Marge earlier.`,
  replacesMargeOn: (date: string) => `Replaces a figure added via Marge on ${date}.`,
  visibleToFounders: "Visible to the company's founders in Molly.",
  createsNoFounder: "Creates a company page in Molly with no founder.",
  laterAccess: (name: string) => `Anyone later given access to ${name} will see the updates filed for it.`,
  founderFigureLabel: "Founder-written update (untrusted text):",
} as const;

// ── structuredContent shapes (TypeScript only; erased at runtime) ─────────────────────────
export interface PortcoPreviewField {
  label: string;
  before?: string;
  after: string;
}
export interface PortcoPreview {
  action: (typeof PORTCO_PREVIEW_ACTIONS)[keyof typeof PORTCO_PREVIEW_ACTIONS];
  target?: string;
  fields: PortcoPreviewField[];
  warnings: string[];
}
export interface BlockedBy {
  kind: (typeof BLOCKED_BY_KINDS)[number];
  id: string;
  name: string;
  tier: MatchTierCode;
  reasons: MatchReasonCode[];
}
export interface CompanyPlan {
  willCreate: boolean;
  name: string;
  geography: string | null;
  website: string | null;
  ledger?: { id: string; name: string; willLink: boolean; reason?: LedgerReason };
  blockedBy?: BlockedBy[];
}
export interface MetricCheck {
  name: string;
  action: MetricCheckAction;
  existing?: { valueId: string; value: number; date: string; source: (typeof VALUE_SOURCES)[number] };
}
export interface SamePeriodRow {
  id: string;
  title: string;
  sentAt: string | null;
  source: string;
  createdBy: string; // a name, never an address
  bodyPreview: string;
  url: string; // the update's own page, /updates/<id>
}
/** The update an email was already filed as (same sourceKey or idempotency key). */
export interface ExistingUpdate {
  id: string;
  title: string;
  url: string; // the update's own page, /updates/<id>
}
/** structuredContent of a dry run of company_create / update_create / metric_value_set. */
export interface PortcoDryRunStructured {
  preview: PortcoPreview;
  company?: CompanyPlan; // company_create, and update_create with newCompany
  samePeriod?: SamePeriodRow[]; // update_create, metric_value_set (companyId given)
  metricChecks?: MetricCheck[]; // update_create, metric_value_set
  duplicate?: boolean; // update_create / company_create: already filed or created
  existingUpdate?: ExistingUpdate; // update_create only, present exactly when duplicate is true
}
/** structuredContent of an apply. */
export interface CompanyCreateApplied {
  companyId: string;
  url: string;
  duplicate: boolean;
  linkedLedgerId: string | null;
}
export interface UpdateCreateApplied {
  updateId: string;
  url: string; // the update's own page, /updates/<id> (was the company page before the Part 45 follow-up)
  duplicate: boolean;
  existingUpdate?: ExistingUpdate; // present exactly when duplicate is true (id equals updateId, url equals url)
  metricsWritten: number;
  definitionsCreated: number;
  companyId: string;
  companyCreated: boolean;
  linkedLedgerId: string | null;
}
export interface MetricValueSetApplied {
  valueId: string; // when keptFounder is true: the id of the existing figure that was left as it is
  definitionId: string;
  url: string;
  replaced?: string;
  keptFounder?: boolean; // true: nothing was written (a figure already in Molly stays)
}
export interface UpdatesListStructured {
  updates: {
    id: string;
    title: string;
    period: string;
    status: "SENT" | "DRAFT";
    sentAt: string | null;
    source: string;
    sourceKey: string | null;
    createdBy: string;
    bodyPreview: string;
    metricCount: number;
    url: string;
  }[];
}
export interface MetricsListStructured {
  metrics: {
    id: string;
    name: string;
    unit: string | null;
    values: { id: string; value: number; date: string; source: (typeof VALUE_SOURCES)[number]; updateId: string | null }[];
  }[];
}
export interface CompanyMatchStructured {
  companies: {
    id: string;
    name: string;
    tier: MatchTierCode;
    reasons: MatchReasonCode[];
    state: CompanyStateCode;
    hasFounder: boolean;
    ledgerId: string | null;
    url: string;
  }[];
  ledger: {
    id: string;
    name: string;
    country: string | null;
    tier: MatchTierCode;
    reasons: MatchReasonCode[];
    linkedCompanyId: string | null;
    contactCount: number;
    contactAtDomain: boolean;
  }[];
}
