// Part 45 (WS149). The only code that creates a company without a founder (Part 45 decision 5) or files
// an update from email. Sends no email of any kind: nothing here imports the mail or publish modules
// (portco-contract.test.ts reads this file's source to prove it). Shape: validated input in, { ok, value | error } out, a `via` marker,
// audits written right after the commit (logAdminAction never throws and never runs inside a transaction).
// Audit metadata carries ids, counts and keys; NEVER a title, body, quote, figure prose or a person's name.
//
// Callers: the Marge tools (src/lib/marge-tools/portco.ts) and, for removal, the web (WS151).
// Every planX() function is READ ONLY and returns what a dry run shows; each apply recomputes the same
// thing inside its own transaction, so a confirmed click can never act on a stale picture.
import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/audit";
import type { Actor, Via } from "@/lib/board-actions";
import { plainToDigestHtml } from "@/lib/digest-html";
import { htmlToPlainText } from "@/lib/plain-text";
import { normalizeCompanyName, nameTokens, tokensContain } from "@/lib/portco-match";
import {
  emailDateToInstant,
  periodWindow,
  valueSource,
  websiteHost,
  type ValueSource,
} from "@/lib/founder-updates";
import type { FileUpdateInput, MetricInput, MetricValueSetInput, NewCompanyInput } from "@/lib/founder-update-validate";
import {
  DEFAULT_COMPANY_CREATE_PER_DAY,
  MARGE_COMPANY_CREATE_PER_DAY_ENV,
  MATCH_TIER_OF,
  PORTCO_SENTENCES as S,
  UPDATE_SOURCE_EMAIL,
  type BlockedBy,
  type CompanyPlan,
  type MatchReasonCode,
  type MetricCheck,
  type SamePeriodRow,
} from "@/lib/marge-tools/portco-contract";
import { isoDate, updateUrl } from "@/lib/marge-tools/types";

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof db;

export type FounderUpdateResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string; blockedBy?: BlockedBy[] };

/** A refusal raised inside a transaction: it rolls everything back and becomes an `ok: false` result. */
export class FounderUpdateError extends Error {
  constructor(
    message: string,
    readonly detail: { status?: 400 | 403 | 404 | 409; blockedBy?: BlockedBy[] } = {}
  ) {
    super(message);
    this.name = "FounderUpdateError";
  }
}
const toFailure = (e: FounderUpdateError): { ok: false; status: 400 | 403 | 404 | 409; error: string; blockedBy?: BlockedBy[] } => ({
  ok: false,
  status: e.detail.status ?? 400,
  error: e.message,
  ...(e.detail.blockedBy ? { blockedBy: e.detail.blockedBy } : {}),
});

const viaMeta = (v?: Via) => (v ? { via: v.via, margeActionId: v.margeActionId } : {});
const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const num = (v: unknown) => Number(v);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** JC-FU-F: the 24-hour creation fuse. MARGE_COMPANY_CREATE_PER_DAY overrides the default 60. */
export function creationFuse(): number {
  const n = Number(process.env[MARGE_COMPANY_CREATE_PER_DAY_ENV]);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_COMPANY_CREATE_PER_DAY;
}

// ── company: the duplicate guard (JC-FU-G) ────────────────────────────────────────────────
/**
 * Companies (any state) whose normalised name or alias equals the new name, whose website host equals the
 * new website's host, or whose name shares tokens with it (WEAK blocks too); and, when no ledger row is
 * given, an UNLINKED ledger row with an equal normalised name. Read only. Used by the dry run and again
 * inside the apply's transaction.
 */
export async function duplicateGuard(client: Client, input: { name: string; website: string | null; ledgerId: string | null }): Promise<BlockedBy[]> {
  const wantName = normalizeCompanyName(input.name);
  const wantTokens = nameTokens(wantName);
  const wantHost = websiteHost(input.website);
  const out: BlockedBy[] = [];

  const companies = await client.company.findMany({ select: { id: true, name: true, aliases: true, website: true } });
  for (const c of companies) {
    const reasons: MatchReasonCode[] = [];
    const cName = normalizeCompanyName(c.name);
    if (wantName && cName === wantName) reasons.push("NAME_EXACT");
    if (wantName && c.aliases.some((a) => normalizeCompanyName(a) === wantName)) reasons.push("ALIAS_EXACT");
    if (wantHost && websiteHost(c.website) === wantHost) reasons.push("WEBSITE_DOMAIN");
    if (
      !reasons.includes("NAME_EXACT") &&
      !reasons.includes("ALIAS_EXACT") &&
      (tokensContain(wantTokens, nameTokens(cName)) || tokensContain(nameTokens(cName), wantTokens) ||
        c.aliases.some((a) => {
          const at = nameTokens(normalizeCompanyName(a));
          return tokensContain(wantTokens, at) || tokensContain(at, wantTokens);
        }))
    ) {
      reasons.push("NAME_TOKENS");
    }
    if (reasons.length) out.push({ kind: "company", id: c.id, name: c.name, tier: tierOf(reasons), reasons });
  }

  if (!input.ledgerId) {
    const rows = await client.portfolioCompany.findMany({ select: { id: true, name: true, companyId: true } });
    for (const r of rows) {
      if (r.companyId) continue;
      if (wantName && normalizeCompanyName(r.name) === wantName) {
        out.push({ kind: "ledger", id: r.id, name: r.name, tier: "STRONG", reasons: ["NAME_EXACT"] });
      }
    }
  }
  const rank = { STRONG: 0, MEDIUM: 1, WEAK: 2 } as const;
  return out.sort((a, b) => rank[a.tier] - rank[b.tier] || a.name.localeCompare(b.name));
}

function tierOf(reasons: MatchReasonCode[]): "STRONG" | "MEDIUM" | "WEAK" {
  const rank = { STRONG: 0, MEDIUM: 1, WEAK: 2 } as const;
  return reasons.reduce<"STRONG" | "MEDIUM" | "WEAK">((best, r) => (rank[MATCH_TIER_OF[r]] < rank[best] ? MATCH_TIER_OF[r] : best), "WEAK");
}

export interface PlannedCompany {
  plan: CompanyPlan;
  /** The same createKey already made a company: an apply returns it and writes nothing. */
  duplicate: { companyId: string; linkedLedgerId: string | null } | null;
  ledger: { id: string; name: string; country: string | null; companyId: string | null } | null;
}

/** READ ONLY. What a dry run of company_create (or of update_create's newCompany) shows. */
export async function planCompany(actor: Actor, input: NewCompanyInput, client: Client = db): Promise<PlannedCompany> {
  const createKey = sha256(`${actor.id}:${input.idempotencyKey}`);
  const dup = await client.company.findUnique({
    where: { createKey },
    select: { id: true, portfolioCompany: { select: { id: true } } },
  });
  const ledger = input.ledgerId
    ? await client.portfolioCompany.findUnique({ where: { id: input.ledgerId }, select: { id: true, name: true, country: true, companyId: true } })
    : null;
  const blockedBy = dup ? [] : await duplicateGuard(client, input);
  const plan: CompanyPlan = {
    willCreate: !dup && blockedBy.length === 0 && (!input.ledgerId || (!!ledger && !ledger.companyId)),
    name: input.name,
    geography: ledger?.country ?? null,
    website: input.website,
  };
  if (input.ledgerId) {
    plan.ledger = ledger
      ? { id: ledger.id, name: ledger.name, willLink: !ledger.companyId, ...(ledger.companyId ? { reason: "linked" as const } : {}) }
      : { id: input.ledgerId, name: "", willLink: false, reason: "gone" };
  }
  if (blockedBy.length) plan.blockedBy = blockedBy;
  return {
    plan,
    duplicate: dup ? { companyId: dup.id, linkedLedgerId: dup.portfolioCompany?.id ?? null } : null,
    ledger,
  };
}

export interface CreatedCompany {
  companyId: string;
  duplicate: boolean;
  linkedLedgerId: string | null;
}

/**
 * Creates a company with NO membership, no reminder, no diligence row, no alias, no contact and no share
 * link, and links it to its ledger row when one is given. Must run inside a transaction: the advisory lock
 * (JC-FU-D) is transaction-scoped, and any refusal throws so the whole transaction rolls back.
 */
export async function createUnclaimedCompany(tx: Tx, actor: Actor, input: NewCompanyInput): Promise<CreatedCompany> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('marge-company-create'))`;
  const createKey = sha256(`${actor.id}:${input.idempotencyKey}`);
  const dup = await tx.company.findUnique({ where: { createKey }, select: { id: true, portfolioCompany: { select: { id: true } } } });
  if (dup) return { companyId: dup.id, duplicate: true, linkedLedgerId: dup.portfolioCompany?.id ?? null };

  const blockedBy = await duplicateGuard(tx, input);
  if (blockedBy.length) {
    throw new FounderUpdateError(S.companyExists(input.name, blockedBy.map((b) => b.name)), { status: 409, blockedBy });
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if ((await tx.company.count({ where: { createdVia: "marge", createdAt: { gt: since } } })) >= creationFuse()) {
    throw new FounderUpdateError(S.fuse, { status: 409 }); // JC-FU-F: fails closed (a database error also fails the create)
  }
  const ledger = input.ledgerId
    ? await tx.portfolioCompany.findUnique({ where: { id: input.ledgerId }, select: { id: true, country: true } })
    : null;
  if (input.ledgerId && !ledger) throw new FounderUpdateError(S.ledgerUnknown, { status: 404 });

  const company = await tx.company.create({
    data: {
      name: input.name,
      website: input.website,
      geography: ledger?.country ?? null,
      createdById: actor.id,
      createdVia: "marge",
      createKey,
    },
    select: { id: true },
  });
  if (ledger) {
    const r = await tx.portfolioCompany.updateMany({ where: { id: ledger.id, companyId: null }, data: { companyId: company.id } });
    if (r.count !== 1) {
      const row = await tx.portfolioCompany.findUnique({ where: { id: ledger.id }, select: { company: { select: { name: true } } } });
      throw new FounderUpdateError(S.ledgerLinked(row?.company?.name ?? "another company"), { status: 409 }); // rolls everything back (Marge J-109)
    }
  }
  return { companyId: company.id, duplicate: false, linkedLedgerId: ledger?.id ?? null };
}

async function auditCompanyCreated(actor: Actor, c: CreatedCompany, name: string, withUpdate: boolean, via?: Via) {
  if (c.duplicate) return;
  await logAdminAction(actor, "COMPANY_CREATED", {
    targetType: "Company",
    targetId: c.companyId,
    metadata: { name, companyId: c.companyId, createdVia: "marge", portfolioCompanyId: c.linkedLedgerId, withUpdate, ...viaMeta(via) },
  });
  if (c.linkedLedgerId) {
    await logAdminAction(actor, "PORTCO_LINKED", {
      targetType: "PortfolioCompany",
      targetId: c.linkedLedgerId,
      metadata: { companyId: c.companyId, previousCompanyId: null, ...viaMeta(via) },
    });
  }
}

/** company_create apply: one one-statement-group transaction around createUnclaimedCompany, then the audits. */
export async function createCompany(actor: Actor, input: NewCompanyInput, via?: Via): Promise<FounderUpdateResult<CreatedCompany>> {
  try {
    const created = await db.$transaction((tx) => createUnclaimedCompany(tx, actor, input));
    await auditCompanyCreated(actor, created, input.name, false, via);
    return { ok: true, value: created };
  } catch (e) {
    if (e instanceof FounderUpdateError) return toFailure(e);
    throw e;
  }
}

// ── metrics: the kept / replace rule ──────────────────────────────────────────────────────
interface DefRow {
  id: string;
  name: string;
  unit: string | null;
}
interface ExistingValue {
  id: string;
  metricDefinitionId: string;
  value: number;
  date: Date;
  source: ValueSource;
  via: string | null;
}

/** Existing values of the given definitions, each with its derived source. */
async function loadValues(client: Client, definitionIds: string[]): Promise<ExistingValue[]> {
  if (!definitionIds.length) return [];
  const rows = await client.metricValue.findMany({
    where: { metricDefinitionId: { in: definitionIds } },
    select: {
      id: true,
      metricDefinitionId: true,
      value: true,
      date: true,
      via: true,
      enteredById: true,
      update: { select: { createdBy: { select: { roles: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    metricDefinitionId: r.metricDefinitionId,
    value: num(r.value),
    date: r.date,
    via: r.via,
    source: valueSource({
      via: r.via,
      enteredById: r.enteredById,
      updateCreatorIsAdmin: r.update ? r.update.createdBy.roles.includes("ADMIN") : null,
    }),
  }));
}

export interface MetricDecision {
  index: number;
  name: string;
  /** null when the definition will be created. */
  definitionId: string | null;
  createDefinition: { name: string; unit: string | null } | null;
  action: MetricCheck["action"];
  existing?: MetricCheck["existing"];
  /** the figure is written (created, or replacing `replaceValueId`). */
  write: boolean;
  replaceValueId: string | null;
  replacedOld?: { value: number; date: string; enteredById: string | null };
}

/**
 * The shared kept / replace evaluation (READ ONLY), for update_create and metric_value_set.
 * `window` is the date range existing figures are compared in (the update's period; the value's calendar
 * month for metric_value_set). Throws FounderUpdateError for refusals that fail the whole call.
 */
async function evaluateMetrics(
  client: Client,
  companyId: string | null,
  window: { start: Date; end: Date },
  metrics: MetricInput[]
): Promise<MetricDecision[]> {
  const defs: DefRow[] = companyId
    ? await client.metricDefinition.findMany({ where: { companyId }, select: { id: true, name: true, unit: true } })
    : [];
  const byId = new Map(defs.map((d) => [d.id, d]));
  const byName = new Map(defs.map((d) => [d.name.toLowerCase(), d]));
  const values = await loadValues(client, defs.map((d) => d.id));
  const createdInCall = new Map<string, string>(); // lower-cased new name -> display name

  const decisions: MetricDecision[] = [];
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    let def: DefRow | null = null;
    let viaName = false;
    if (m.definitionId) {
      def = byId.get(m.definitionId) ?? null;
      if (!def) {
        const other = await client.metricDefinition.findUnique({ where: { id: m.definitionId }, select: { id: true } });
        throw new FounderUpdateError(other ? S.otherCompanyMetric : S.unknownMetric, { status: other ? 403 : 404 });
      }
    } else {
      def = byName.get(m.name!.toLowerCase()) ?? null;
      viaName = !!def;
    }
    const display = def?.name ?? m.name!;

    if (!def) {
      const key = m.name!.toLowerCase();
      const again = createdInCall.has(key);
      createdInCall.set(key, m.name!);
      decisions.push({
        index: i,
        name: m.name!,
        definitionId: null,
        createDefinition: again ? null : { name: m.name!, unit: m.unit },
        action: again ? "existing" : "new_metric",
        write: true,
        replaceValueId: null,
      });
      // A name repeated within one call must not create a second definition: the apply reuses the first.
      continue;
    }

    const inWindow = values.filter((v) => v.metricDefinitionId === def!.id && v.date >= window.start && v.date <= window.end);
    if (m.replaceValueId) {
      const target = values.find((v) => v.id === m.replaceValueId && v.metricDefinitionId === def!.id);
      if (!target) throw new FounderUpdateError(S.replaceUnknown, { status: 404 });
      if (target.source !== "marge") throw new FounderUpdateError(S.keptFigure, { status: 409 });
      const old = await client.metricValue.findUnique({ where: { id: target.id }, select: { enteredById: true } });
      decisions.push({
        index: i,
        name: display,
        definitionId: def.id,
        createDefinition: null,
        action: "replace",
        existing: { valueId: target.id, value: target.value, date: ymd(target.date), source: "marge" },
        write: true,
        replaceValueId: target.id,
        replacedOld: { value: target.value, date: ymd(target.date), enteredById: old?.enteredById ?? null },
      });
      continue;
    }
    const protectedValue = inWindow.find((v) => v.source === "founder" || v.source === "admin");
    if (protectedValue) {
      decisions.push({
        index: i,
        name: display,
        definitionId: def.id,
        createDefinition: null,
        action: "kept_founder",
        existing: { valueId: protectedValue.id, value: protectedValue.value, date: ymd(protectedValue.date), source: protectedValue.source },
        write: false,
        replaceValueId: null,
      });
      continue;
    }
    decisions.push({
      index: i,
      name: display,
      definitionId: def.id,
      createDefinition: null,
      action: viaName ? "existing" : "new", // JC-FU-I: a Marge value in the window without replaceValueId is written as an extra value
      write: true,
      replaceValueId: null,
    });
  }
  return decisions;
}

const toChecks = (ds: MetricDecision[]): MetricCheck[] =>
  ds.map((d) => ({ name: d.name, action: d.action, ...(d.existing ? { existing: d.existing } : {}) }));

// ── update_create ─────────────────────────────────────────────────────────────────────────
export interface PlannedUpdate {
  duplicate: { updateId: string; title: string; companyId: string } | null;
  company: PlannedCompany | null; // newCompany given
  companyId: string | null;
  companyName: string;
  samePeriod: SamePeriodRow[];
  metricChecks: MetricCheck[];
  replacingMarge: number;
}

const sourceKeyOf = (i: FileUpdateInput) => `slack:${i.source.channelId}:${i.source.messageTs}`;

async function findExistingUpdate(client: Client, actor: Actor, input: FileUpdateInput) {
  const sourceKey = sourceKeyOf(input);
  const createKey = sha256(`${actor.id}:${input.idempotencyKey}`);
  return client.update.findFirst({
    where: { OR: [{ sourceKey }, { createKey }] },
    select: { id: true, title: true, companyId: true },
  });
}

export async function loadSamePeriod(client: Client, companyId: string, period: string): Promise<SamePeriodRow[]> {
  const rows = await client.update.findMany({
    where: { companyId, period },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, title: true, sentAt: true, source: true, body: true, createdBy: { select: { name: true } } },
  });
  return rows.map((u) => ({
    id: u.id,
    title: u.title,
    sentAt: isoDate(u.sentAt),
    source: u.source,
    createdBy: u.createdBy?.name?.trim() || "Unnamed",
    bodyPreview: htmlToPlainText(u.body, 300),
    url: updateUrl(u.id),
  }));
}

/** READ ONLY. Everything a dry run of update_create shows. */
export async function planFileUpdate(actor: Actor, input: FileUpdateInput): Promise<FounderUpdateResult<PlannedUpdate>> {
  try {
    const existing = await findExistingUpdate(db, actor, input); // checked first: a duplicate creates no company
    const window = periodWindow(input.period)!;
    let company: PlannedCompany | null = null;
    let companyId: string | null = null;
    let companyName = "";
    if (input.newCompany) {
      company = await planCompany(actor, input.newCompany);
      companyName = input.newCompany.name;
      companyId = company.duplicate?.companyId ?? null;
    } else {
      const c = await db.company.findUnique({ where: { id: input.companyId! }, select: { id: true, name: true } });
      if (!c) return { ok: false, status: 404, error: S.noCompany(input.companyId!, []) };
      companyId = c.id;
      companyName = c.name;
    }
    const decisions = await evaluateMetrics(db, companyId, window, input.metrics);
    return {
      ok: true,
      value: {
        duplicate: existing ? { updateId: existing.id, title: existing.title, companyId: existing.companyId } : null,
        company,
        companyId,
        companyName,
        samePeriod: companyId ? await loadSamePeriod(db, companyId, input.period) : [],
        metricChecks: toChecks(decisions),
        replacingMarge: decisions.filter((d) => d.action === "replace").length,
      },
    };
  } catch (e) {
    if (e instanceof FounderUpdateError) return toFailure(e);
    throw e;
  }
}

export interface FiledUpdate {
  updateId: string;
  companyId: string;
  duplicate: boolean;
  metricsWritten: number;
  definitionsCreated: number;
  companyCreated: boolean;
  linkedLedgerId: string | null;
  keptFounder: number;
  /** Set only when duplicate is true: the update this email was filed as earlier. */
  existingTitle?: string;
}

/**
 * Files an emailed founder update as a SENT update dated to the email (createdAt = sentAt, JC-FU-C;
 * the real time goes in filedAt). One transaction: the company (and its ledger link) when newCompany is
 * given, the update, its definitions and its values. Nothing is emailed and publishUpdate is never called.
 */
export async function fileEmailUpdate(actor: Actor, input: FileUpdateInput, via?: Via): Promise<FounderUpdateResult<FiledUpdate>> {
  const sourceKey = sourceKeyOf(input);
  const createKey = sha256(`${actor.id}:${input.idempotencyKey}`);
  const existing = await findExistingUpdate(db, actor, input);
  if (existing) return { ok: true, value: dupResult(existing) };

  const window = periodWindow(input.period)!;
  const sentAt = emailDateToInstant(input.sentAt);
  try {
    const out = await db.$transaction(async (tx) => {
      // Re-check inside the transaction: a concurrent call with the same key loses to the unique index.
      const again = await tx.update.findFirst({ where: { OR: [{ sourceKey }, { createKey }] }, select: { id: true, title: true, companyId: true } });
      if (again) return { kind: "dup", dup: again } as const;

      let companyId: string;
      let created: CreatedCompany | null = null;
      if (input.newCompany) {
        created = await createUnclaimedCompany(tx, actor, input.newCompany);
        companyId = created.companyId;
      } else {
        const c = await tx.company.findUnique({ where: { id: input.companyId! }, select: { id: true } });
        if (!c) throw new FounderUpdateError(S.noCompany(input.companyId!, []), { status: 404 });
        companyId = c.id;
      }

      const decisions = await evaluateMetrics(tx, companyId, window, input.metrics);
      const sourceRef = {
        kind: input.source.kind,
        channelId: input.source.channelId,
        messageTs: input.source.messageTs,
        permalink: input.source.permalink,
        subject: input.source.subject,
        fromName: input.source.fromName,
        fromDomain: input.source.fromDomain,
        forwardedBy: input.source.forwardedBy,
        ...(input.source.attachmentCount !== undefined ? { attachmentCount: input.source.attachmentCount } : {}),
        ...(input.source.attachments ? { attachments: input.source.attachments } : {}),
      };
      const update = await tx.update.create({
        data: {
          companyId,
          createdById: actor.id,
          period: input.period,
          title: input.title,
          body: plainToDigestHtml(input.bodyText),
          status: "SENT",
          sentAt,
          createdAt: sentAt,
          filedAt: new Date(),
          source: UPDATE_SOURCE_EMAIL,
          sourceRef,
          sourceKey,
          createKey,
        },
        select: { id: true },
      });

      const createdDefs = new Map<string, string>(); // lower-cased name -> id
      const createdDefIds: string[] = [];
      const replaced: { valueId: string; old: NonNullable<MetricDecision["replacedOld"]> }[] = [];
      const valueIds: string[] = [];
      let written = 0;
      let kept = 0;
      for (const d of decisions) {
        const m = input.metrics[d.index];
        if (!d.write) {
          kept++;
          continue;
        }
        let definitionId = d.definitionId;
        if (!definitionId) {
          const key = d.name.toLowerCase();
          definitionId = createdDefs.get(key) ?? null;
          if (!definitionId) {
            const def = await tx.metricDefinition.create({ data: { companyId, name: d.name, unit: d.createDefinition?.unit ?? m.unit }, select: { id: true } });
            definitionId = def.id;
            createdDefs.set(key, def.id);
            createdDefIds.push(def.id);
          }
        }
        if (d.replaceValueId) {
          await tx.metricValue.update({
            where: { id: d.replaceValueId },
            data: { value: m.value, date: new Date(`${m.date}T00:00:00.000Z`), quote: m.quote, enteredById: actor.id, updateId: update.id },
          });
          replaced.push({ valueId: d.replaceValueId, old: d.replacedOld! });
          valueIds.push(d.replaceValueId);
        } else {
          const v = await tx.metricValue.create({
            data: { metricDefinitionId: definitionId, value: m.value, date: new Date(`${m.date}T00:00:00.000Z`), updateId: update.id, via: "marge", quote: m.quote, enteredById: actor.id },
            select: { id: true },
          });
          valueIds.push(v.id);
        }
        written++;
      }
      return { kind: "filed", update, companyId, created, createdDefIds, replaced, valueIds, written, kept } as const;
    });

    if (out.kind === "dup") return { ok: true, value: dupResult(out.dup) };

    if (out.created) await auditCompanyCreated(actor, out.created, input.newCompany!.name, true, via);
    for (const id of out.createdDefIds) {
      await logAdminAction(actor, "METRIC_DEFINITION_CREATED", { targetType: "MetricDefinition", targetId: id, metadata: { companyId: out.companyId, definitionId: id, ...viaMeta(via) } });
    }
    await logAdminAction(actor, "UPDATE_CREATED", {
      targetType: "Update",
      targetId: out.update.id,
      metadata: {
        companyId: out.companyId,
        updateId: out.update.id,
        source: UPDATE_SOURCE_EMAIL,
        period: input.period,
        metricCount: out.written,
        definitionsCreated: out.createdDefIds.length,
        keptFounder: out.kept,
        ...viaMeta(via),
      },
    });
    for (const r of out.replaced) {
      await logAdminAction(actor, "METRIC_VALUE_SET", {
        targetType: "MetricValue",
        targetId: r.valueId,
        metadata: { valueId: r.valueId, date: r.old.date, replaced: { value: r.old.value, date: r.old.date, enteredById: r.old.enteredById }, ...viaMeta(via) },
      });
    }
    return {
      ok: true,
      value: {
        updateId: out.update.id,
        companyId: out.companyId,
        duplicate: false,
        metricsWritten: out.written,
        definitionsCreated: out.createdDefIds.length,
        companyCreated: !!out.created && !out.created.duplicate,
        linkedLedgerId: out.created && !out.created.duplicate ? out.created.linkedLedgerId : null,
        keptFounder: out.kept,
      },
    };
  } catch (e) {
    if (e instanceof FounderUpdateError) return toFailure(e);
    throw e;
  }
}

const dupResult = (e: { id: string; title: string; companyId: string }): FiledUpdate => ({
  updateId: e.id,
  existingTitle: e.title,
  companyId: e.companyId,
  duplicate: true,
  metricsWritten: 0,
  definitionsCreated: 0,
  companyCreated: false,
  linkedLedgerId: null,
  keptFounder: 0,
});

// ── metric_value_set ──────────────────────────────────────────────────────────────────────
/** The calendar month of a YYYY-MM-DD date (the window metric_value_set compares in; no period is given). */
function monthWindow(date: string) {
  const start = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
  return periodWindow(date.slice(0, 7)) ?? { start, end: start };
}

export interface PlannedMetricValue {
  companyName: string;
  decision: MetricDecision;
  /** the figure that will be shown as "before": the existing value in the window, if any. */
  before: { value: number; date: string; source: ValueSource } | null;
}

/** READ ONLY. */
export async function planMetricValue(input: MetricValueSetInput): Promise<FounderUpdateResult<PlannedMetricValue>> {
  try {
    const company = await db.company.findUnique({ where: { id: input.companyId }, select: { id: true, name: true } });
    if (!company) return { ok: false, status: 404, error: S.noCompany(input.companyId, []) };
    const [d] = await evaluateMetrics(db, company.id, monthWindow(input.date), [input]);
    return { ok: true, value: { companyName: company.name, decision: d, before: d.existing ? { value: d.existing.value, date: d.existing.date, source: d.existing.source } : null } };
  } catch (e) {
    if (e instanceof FounderUpdateError) return toFailure(e);
    throw e;
  }
}

export interface SetValue {
  valueId: string;
  definitionId: string;
  companyId: string;
  keptFounder: boolean;
  definitionCreated: boolean;
  replaced?: string;
}

/** Records one figure. Same kept / replace rule as a filed update; a kept figure is reported, not written. */
export async function setMetricValue(actor: Actor, input: MetricValueSetInput, via?: Via): Promise<FounderUpdateResult<SetValue>> {
  try {
    const out = await db.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: input.companyId }, select: { id: true } });
      if (!company) throw new FounderUpdateError(S.noCompany(input.companyId, []), { status: 404 });
      const [d] = await evaluateMetrics(tx, company.id, monthWindow(input.date), [input]);
      if (!d.write) {
        // The figure in Molly stays; the caller sees keptFounder and the existing figure's id.
        return { companyId: company.id, valueId: d.existing!.valueId, definitionId: d.definitionId!, kept: true, created: false, replaced: undefined, old: undefined } as const;
      }
      let definitionId = d.definitionId;
      let created = false;
      if (!definitionId) {
        const def = await tx.metricDefinition.create({ data: { companyId: company.id, name: d.name, unit: input.unit }, select: { id: true } });
        definitionId = def.id;
        created = true;
      }
      const date = new Date(`${input.date}T00:00:00.000Z`);
      if (d.replaceValueId) {
        await tx.metricValue.update({ where: { id: d.replaceValueId }, data: { value: input.value, date, quote: input.quote, enteredById: actor.id } });
        return { companyId: company.id, valueId: d.replaceValueId, definitionId, kept: false, created, replaced: d.replaceValueId, old: d.replacedOld } as const;
      }
      const v = await tx.metricValue.create({
        data: { metricDefinitionId: definitionId, value: input.value, date, via: "marge", quote: input.quote, enteredById: actor.id },
        select: { id: true },
      });
      return { companyId: company.id, valueId: v.id, definitionId, kept: false, created, replaced: undefined, old: undefined } as const;
    });

    if (!out.kept) {
      if (out.created) {
        await logAdminAction(actor, "METRIC_DEFINITION_CREATED", { targetType: "MetricDefinition", targetId: out.definitionId, metadata: { companyId: out.companyId, definitionId: out.definitionId, ...viaMeta(via) } });
      }
      await logAdminAction(actor, "METRIC_VALUE_SET", {
        targetType: "MetricValue",
        targetId: out.valueId,
        metadata: {
          definitionId: out.definitionId,
          valueId: out.valueId,
          date: input.date,
          ...(out.replaced ? { replaced: { valueId: out.replaced, value: out.old?.value, date: out.old?.date, enteredById: out.old?.enteredById ?? null } } : {}),
          ...viaMeta(via),
        },
      });
    }
    return {
      ok: true,
      value: { valueId: out.valueId, definitionId: out.definitionId, companyId: out.companyId, keptFounder: out.kept, definitionCreated: out.created, ...(out.replaced ? { replaced: out.replaced } : {}) },
    };
  } catch (e) {
    if (e instanceof FounderUpdateError) return toFailure(e);
    throw e;
  }
}

// ── removal (Q142 A) ──────────────────────────────────────────────────────────────────────
/**
 * Removes an update that was filed from email, with the figures Marge filed with it. The CALLER must have
 * checked that `actor` is an admin (the web route uses requireAdmin; Marge never has this). Refuses any
 * update that was not filed from email, so founders' sent updates keep today's rule.
 */
export async function removeEmailUpdate(actor: Actor, updateId: string): Promise<FounderUpdateResult<{ removed: true; companyId: string; metricValuesRemoved: number }>> {
  try {
    const out = await db.$transaction(async (tx) => {
      const u = await tx.update.findUnique({ where: { id: updateId }, select: { id: true, companyId: true, source: true } });
      if (!u) throw new FounderUpdateError("Update not found", { status: 404 });
      if (u.source !== UPDATE_SOURCE_EMAIL) throw new FounderUpdateError("Only updates filed from email can be removed.", { status: 403 });
      const r = await tx.metricValue.deleteMany({ where: { updateId, via: "marge" } });
      await tx.update.delete({ where: { id: updateId } }); // comments, share selections cascade; documents' link is unset
      return { companyId: u.companyId, removed: r.count };
    });
    await logAdminAction(actor, "UPDATE_REMOVED", {
      targetType: "Update",
      targetId: updateId,
      metadata: { companyId: out.companyId, updateId, metricValuesRemoved: out.removed },
    });
    return { ok: true, value: { removed: true, companyId: out.companyId, metricValuesRemoved: out.removed } };
  } catch (e) {
    if (e instanceof FounderUpdateError) return toFailure(e);
    throw e;
  }
}
