// Part 45 (WS150). The founder-update tools Marge may call: updates_list, metrics_list, company_match,
// update_create, metric_value_set (MARGE_PORTCO_TOOLS=on) and company_create (also MARGE_COMPANY_CREATE=on).
// Same shape as memos.ts: every function is (input, principal, opts) => ToolOutput. A write is plan
// (validation and lookups, READS ONLY) then apply (founder-update-actions.ts). A dry run returns after plan,
// so it cannot write. The input schemas, sentences and result shapes are in portco-contract.ts.
//
// What Marge can never do here, by design: change an update's visibility or status, publish, edit or
// delete an update, upload documents, make share links, touch memberships, invitations, reminders, or
// rename/unlink/delete a company. Those inputs do not exist. Company CREATION is the one exception to
// JC-MG-J / Q100 (owner-approved 2026-11-12): company_create and update_create.newCompany only.
//
// Founder-written text is returned in a labelled block (untrusted). No email address is ever returned,
// in text or in `structured`, and nothing here sends email.
import type { z } from "zod";
import { db } from "@/lib/db";
import { htmlToPlainText } from "@/lib/plain-text";
import { emailDomain, nameTokens, normalizeCompanyName, tokensContain } from "@/lib/portco-match";
import { isAdminEmailDomain } from "@/lib/org";
import { companyHasFounder, valueSource, websiteHost } from "@/lib/founder-updates";
import {
  createCompany,
  fileEmailUpdate,
  planCompany,
  planFileUpdate,
  planMetricValue,
  setMetricValue,
  type MetricDecision,
} from "@/lib/founder-update-actions";
import {
  parseDateOnly,
  validateFileUpdate,
  validateLimit,
  validateMatchInput,
  validateMetricValueSet,
  validateNewCompany,
  validateValuesCount,
} from "@/lib/founder-update-validate";
import {
  PORTCO_LIMITS as L,
  PORTCO_PREVIEW_ACTIONS as A,
  PORTCO_SENTENCES as S,
  MATCH_TIER_OF,
  type CompanyMatchStructured,
  type CompanyPlan,
  type CompanyCreateApplied,
  type MatchReasonCode,
  type MatchTierCode,
  type MetricCheck,
  type MetricsListStructured,
  type MetricValueSetApplied,
  type PortcoDryRunStructured,
  type PortcoPreview,
  type UpdateCreateApplied,
  type UpdatesListStructured,
  companyCreateInput,
  companyMatchInput,
  metricsListInput,
  metricValueSetInput,
  updateCreateInput,
  updatesListInput,
} from "@/lib/marge-tools/portco-contract";
import { margeCompanyCreateEnabled } from "@/lib/marge-tools/tiers";
import type { Principal } from "@/lib/marge-auth";
import { ToolError, companyUrl, isoDate, updateUrl, type ToolOutput } from "@/lib/marge-tools/types";
import type { WriteOpts } from "@/lib/marge-tools/write";
import type { Via } from "@/lib/board-actions";

export {
  companyCreateInput,
  companyMatchInput,
  metricsListInput,
  metricValueSetInput,
  updateCreateInput,
  updatesListInput,
};

const BODY_PREVIEW = 1500;
const LIST_PREVIEW = 300;
const n = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 6 });
const day = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max).trimEnd()}…` : s);

function requireVia(opts: WriteOpts): Via {
  if (!opts.via) throw new Error("apply without via"); // a programming error, not a user error
  return opts.via;
}

function preview(p: PortcoPreview, extra: Omit<PortcoDryRunStructured, "preview">): ToolOutput {
  const lines = [`Preview (nothing has been changed): ${p.action}${p.target ? ` — ${p.target}` : ""}`];
  for (const f of p.fields) lines.push(f.before !== undefined ? `${f.label}: ${f.before} → ${f.after}` : `${f.label}: ${f.after}`);
  for (const w of p.warnings) lines.push(`Note: ${w}`);
  const structured: PortcoDryRunStructured = { preview: p, ...extra };
  return { text: lines.join("\n"), structured: structured as unknown as Record<string, unknown>, count: 1 };
}

// ── company resolution for the reads (every company, in any state) ───────────────────────
async function resolveCompany(raw: string): Promise<{ id: string; name: string }> {
  const byId = await db.company.findFirst({ where: { id: raw }, select: { id: true, name: true } });
  if (byId) return byId;
  const exact = await db.company.findMany({ where: { name: { equals: raw, mode: "insensitive" } }, select: { id: true, name: true }, take: 6 });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new ToolError(S.ambiguousCompany(raw, exact.map((c) => c.name)));
  const close = await db.company.findMany({ where: { name: { contains: raw.slice(0, 50), mode: "insensitive" } }, select: { id: true, name: true }, take: 5 });
  throw new ToolError(S.noCompany(raw, close.map((c) => c.name)));
}

const unwrap = <T>(v: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!v.ok) throw new ToolError(v.error);
  return v.value;
};

// ── updates_list ──────────────────────────────────────────────────────────────────────────
export async function updatesList(input: z.infer<typeof updatesListInput>, _p: Principal): Promise<ToolOutput> {
  const limit = unwrap(validateLimit(input.limit, L.listLimitDefault, L.listLimitMax));
  const company = await resolveCompany(input.company.trim());
  const or: object[] = [];
  const period = input.period?.trim();
  if (period) or.push({ period });
  if (input.since !== undefined || input.until !== undefined) {
    const range: { gte?: Date; lte?: Date } = {};
    if (input.since !== undefined) {
      const d = parseDateOnly(input.since);
      if (!d) throw new ToolError(S.badDate);
      range.gte = d;
    }
    if (input.until !== undefined) {
      const d = parseDateOnly(input.until);
      if (!d) throw new ToolError(S.badDate);
      range.lte = new Date(d.getTime() + 24 * 3600 * 1000 - 1);
    }
    or.push({ sentAt: range });
  }
  const rows = await db.update.findMany({
    where: { companyId: company.id, ...(or.length ? { OR: or } : {}) },
    orderBy: { createdAt: "desc" }, // a filed update's createdAt is its sentAt (JC-FU-C), so this is date order
    take: limit,
    select: {
      id: true,
      title: true,
      period: true,
      status: true,
      sentAt: true,
      source: true,
      sourceKey: true,
      body: true,
      createdBy: { select: { name: true } },
      _count: { select: { metricValues: true } },
    },
  });
  const url = companyUrl(company.id);
  const updates: UpdatesListStructured["updates"] = rows.map((u) => ({
    id: u.id,
    title: u.title,
    period: u.period,
    status: u.status as "SENT" | "DRAFT",
    sentAt: isoDate(u.sentAt),
    source: u.source,
    sourceKey: u.sourceKey,
    createdBy: u.createdBy?.name?.trim() || "Unnamed",
    bodyPreview: htmlToPlainText(u.body, LIST_PREVIEW),
    metricCount: u._count.metricValues,
    url,
  }));
  const lines = updates.map(
    (u) =>
      `[${u.id}] ${u.title} · ${u.period} · ${u.status === "DRAFT" ? "DRAFT" : `sent ${u.sentAt ?? "?"}`} · ${u.source === "EMAIL_VIA_MARGE" ? "from email via Marge" : "written in Molly"} · by ${u.createdBy} · ${u.metricCount} ${u.metricCount === 1 ? "figure" : "figures"} · ${u.url}\n${S.founderFigureLabel}\n${u.bodyPreview || "(empty)"}`
  );
  return {
    text: lines.length ? `${company.name}\n\n${lines.join("\n\n")}` : `No updates matched for ${company.name}.`,
    structured: { updates } as unknown as Record<string, unknown>,
    count: updates.length,
  };
}

// ── metrics_list ──────────────────────────────────────────────────────────────────────────
export async function metricsList(input: z.infer<typeof metricsListInput>, _p: Principal): Promise<ToolOutput> {
  const take = unwrap(validateValuesCount(input.values));
  const company = await resolveCompany(input.company.trim());
  const defs = await db.metricDefinition.findMany({
    where: { companyId: company.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      unit: true,
      values: {
        orderBy: { date: "desc" },
        take,
        select: { id: true, value: true, date: true, via: true, enteredById: true, updateId: true, update: { select: { createdBy: { select: { roles: true } } } } },
      },
    },
  });
  const metrics: MetricsListStructured["metrics"] = defs.map((d) => ({
    id: d.id,
    name: d.name,
    unit: d.unit,
    values: (take === 0 ? [] : d.values).map((v) => ({
      id: v.id,
      value: Number(v.value),
      date: v.date.toISOString().slice(0, 10),
      source: valueSource({ via: v.via, enteredById: v.enteredById, updateCreatorIsAdmin: v.update ? v.update.createdBy.roles.includes("ADMIN") : null }),
      updateId: v.updateId,
    })),
  }));
  const lines = metrics.map(
    (m) => `[${m.id}] ${m.name}${m.unit ? ` (${m.unit})` : ""}: ${m.values.length ? m.values.map((v) => `${n(v.value)} on ${v.date} [${v.id}, ${v.source}]`).join("; ") : "no figures"}`
  );
  return {
    text: lines.length ? `${company.name}\n${lines.join("\n")}` : `${company.name} has no metrics yet.`,
    structured: { metrics } as unknown as Record<string, unknown>,
    count: metrics.length,
  };
}

// ── company_match ─────────────────────────────────────────────────────────────────────────
const TIER_RANK: Record<MatchTierCode, number> = { STRONG: 0, MEDIUM: 1, WEAK: 2 };
const tierOf = (reasons: MatchReasonCode[]): MatchTierCode =>
  reasons.reduce<MatchTierCode>((best, r) => (TIER_RANK[MATCH_TIER_OF[r]] < TIER_RANK[best] ? MATCH_TIER_OF[r] : best), "WEAK");
const REASON_ORDER: MatchReasonCode[] = ["NAME_EXACT", "ALIAS_EXACT", "WEBSITE_DOMAIN", "CONTACT_DOMAIN", "NAME_TOKENS"];

export async function companyMatch(input: z.infer<typeof companyMatchInput>, _p: Principal): Promise<ToolOutput> {
  const v = unwrap(validateMatchInput(input));
  // A free-mail or DFS domain says nothing about the company: ignore it.
  const domain = v.domain && emailDomain(`x@${v.domain}`) && !isAdminEmailDomain(`x@${v.domain}`) ? v.domain : null;
  const wants = v.names.map((raw) => {
    const norm = normalizeCompanyName(raw);
    return { norm, tokens: nameTokens(norm) };
  }).filter((w) => w.norm);

  const [companyRows, ledgerRows] = await Promise.all([
    db.company.findMany({
      select: {
        id: true,
        name: true,
        aliases: true,
        website: true,
        stage: true,
        createdBy: { select: { status: true, approvalToken: true } },
        memberships: { select: { user: { select: { roles: true } } } },
        portfolioCompany: { select: { id: true } },
      },
    }),
    db.portfolioCompany.findMany({
      where: { companyId: null }, // a linked ledger row folds into its company
      select: { id: true, name: true, country: true, contacts: { select: { email: true } } },
    }),
  ]);

  const companies: CompanyMatchStructured["companies"] = [];
  for (const c of companyRows) {
    const reasons = new Set<MatchReasonCode>();
    const cNorm = normalizeCompanyName(c.name);
    const aliasNorms = c.aliases.map(normalizeCompanyName).filter(Boolean);
    const cTokens = nameTokens(cNorm);
    for (const w of wants) {
      if (cNorm && cNorm === w.norm) reasons.add("NAME_EXACT");
      if (aliasNorms.includes(w.norm)) reasons.add("ALIAS_EXACT");
      const exact = cNorm === w.norm || aliasNorms.includes(w.norm);
      if (!exact && (tokensContain(w.tokens, cTokens) || tokensContain(cTokens, w.tokens) || aliasNorms.some((a) => tokensContain(w.tokens, nameTokens(a)) || tokensContain(nameTokens(a), w.tokens)))) {
        reasons.add("NAME_TOKENS");
      }
    }
    if (domain && websiteHost(c.website) === domain) reasons.add("WEBSITE_DOMAIN");
    if (!reasons.size) continue;
    const ordered = REASON_ORDER.filter((r) => reasons.has(r));
    companies.push({
      id: c.id,
      name: c.name,
      tier: tierOf(ordered),
      reasons: ordered,
      state: c.stage === "DILIGENCE" ? "diligence" : c.createdBy?.status === "PENDING" && !c.createdBy.approvalToken ? "pending_signup" : "active",
      hasFounder: companyHasFounder(c.memberships),
      ledgerId: c.portfolioCompany?.id ?? null,
      url: companyUrl(c.id),
    });
  }

  const ledger: CompanyMatchStructured["ledger"] = [];
  for (const l of ledgerRows) {
    const reasons = new Set<MatchReasonCode>();
    const lNorm = normalizeCompanyName(l.name);
    const lTokens = nameTokens(lNorm);
    for (const w of wants) {
      if (lNorm && lNorm === w.norm) reasons.add("NAME_EXACT");
      else if (tokensContain(w.tokens, lTokens) || tokensContain(lTokens, w.tokens)) reasons.add("NAME_TOKENS");
    }
    // Contact emails are read ONLY to compute these two values; they are never returned.
    const contactAtDomain = !!domain && l.contacts.some((c) => emailDomain(c.email) === domain);
    if (contactAtDomain) reasons.add("CONTACT_DOMAIN");
    if (!reasons.size) continue;
    const ordered = REASON_ORDER.filter((r) => reasons.has(r));
    ledger.push({
      id: l.id,
      name: l.name,
      country: l.country,
      tier: tierOf(ordered),
      reasons: ordered,
      linkedCompanyId: null, // linked rows are folded into `companies`, so a listed row is never linked
      contactCount: l.contacts.length,
      contactAtDomain,
    });
  }

  const sort = <T extends { tier: MatchTierCode; name: string }>(rows: T[]) =>
    rows.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.name.localeCompare(b.name)).slice(0, 10);
  const out: CompanyMatchStructured = { companies: sort(companies), ledger: sort(ledger) };
  const lines = [
    ...out.companies.map(
      (c) => `Company [${c.id}] ${c.name} · ${c.tier} ${c.reasons.join("+")} · ${c.state.replace("_", " ")} · ${c.hasFounder ? "has a founder" : "no founder yet"}${c.ledgerId ? ` · ledger ${c.ledgerId}` : ""} · ${c.url}`
    ),
    ...out.ledger.map(
      (l) => `Deal ledger [${l.id}] ${l.name}${l.country ? `, ${l.country}` : ""} · ${l.tier} ${l.reasons.join("+")} · ${l.contactCount} ${l.contactCount === 1 ? "contact" : "contacts"}${l.contactAtDomain ? " (one at the sender's domain)" : ""}`
    ),
  ];
  return {
    text: lines.length ? lines.join("\n") : "No companies or deal-ledger entries matched.",
    structured: out as unknown as Record<string, unknown>,
    count: out.companies.length + out.ledger.length,
  };
}

// ── company_create ────────────────────────────────────────────────────────────────────────
function companyFields(plan: CompanyPlan): PortcoPreview["fields"] {
  const ledger = plan.ledger
    ? plan.ledger.willLink
      ? `${plan.ledger.name}${plan.geography ? `, ${plan.geography}` : ""}: will be linked`
      : `${plan.ledger.name || "that entry"}: not linked (${plan.ledger.reason ?? "unavailable"})`
    : "none";
  return [
    { label: "New company", after: plan.name },
    { label: "Deal ledger", after: ledger },
    { label: "Website", after: plan.website ?? "none" },
    { label: "Geography", after: plan.geography ?? "none" },
    { label: "Founders", after: "none; nobody is emailed" },
  ];
}
function companyWarnings(plan: CompanyPlan): string[] {
  if (plan.blockedBy?.length) return [S.companyExists(plan.name, plan.blockedBy.map((b) => b.name))];
  return [S.createsNoFounder, S.laterAccess(plan.name)];
}

export async function companyCreate(input: z.infer<typeof companyCreateInput>, p: Principal, opts: WriteOpts): Promise<ToolOutput> {
  const c = unwrap(validateNewCompany(input));
  if (opts.dryRun) {
    const planned = await planCompany(p, c);
    const warnings = planned.duplicate ? [S.alreadyCreated(c.name)] : companyWarnings(planned.plan);
    return preview(
      { action: A.createCompany, target: `${c.name} (new)`, fields: companyFields(planned.plan), warnings },
      { company: planned.plan, duplicate: !!planned.duplicate }
    );
  }
  const r = await createCompany(p, c, requireVia(opts));
  if (!r.ok) throw new ToolError(r.error);
  const url = companyUrl(r.value.companyId);
  const structured: CompanyCreateApplied = { companyId: r.value.companyId, url, duplicate: r.value.duplicate, linkedLedgerId: r.value.linkedLedgerId };
  return {
    text: r.value.duplicate ? `That company was already created: ${url}` : `Created ${c.name} in Molly with no founder. ${url}`,
    structured: structured as unknown as Record<string, unknown>,
    count: 1,
  };
}

// ── update_create ─────────────────────────────────────────────────────────────────────────
const fmtValue = (v: number, unit: string | null | undefined) => `${n(v)}${unit ? ` ${unit}` : ""}`;

function metricLine(d: MetricDecision | { name: string; action: MetricCheck["action"]; existing?: MetricCheck["existing"] }, m: { value: number; unit: string | null; date: string }): string {
  switch (d.action) {
    case "kept_founder":
      return `${d.name}: kept the figure in Molly, ${n(d.existing?.value ?? 0)} (the email says ${n(m.value)})`;
    case "replace":
      return `${d.name}: ${fmtValue(m.value, null)} replaces ${n(d.existing?.value ?? 0)} (added via Marge on ${d.existing?.date ?? "?"})`;
    case "new_metric":
      return `${d.name}: ${fmtValue(m.value, null)} (new metric${m.unit ? `, ${m.unit}` : ""})`;
    default:
      return `${d.name}: ${fmtValue(m.value, m.unit)} (${m.date}), new`;
  }
}

export async function updateCreate(input: z.infer<typeof updateCreateInput>, p: Principal, opts: WriteOpts): Promise<ToolOutput> {
  const u = unwrap(validateFileUpdate(input));
  if (u.newCompany && !margeCompanyCreateEnabled()) throw new ToolError(S.notAccepting);

  if (opts.dryRun) {
    const planned = unwrap(await planFileUpdate(p, u));
    const company = planned.company?.plan;
    const warnings: string[] = [];
    const fields: PortcoPreview["fields"] = [];
    if (company) fields.push(...companyFields(company));
    fields.push(
      { label: "Company", after: planned.companyName + (company ? " (new)" : "") },
      { label: "Period", after: u.period },
      { label: "Title", after: u.title },
      { label: "Sent", after: day(`${u.sentAt}T12:00:00.000Z`) },
      { label: "Body", after: `${clip(u.bodyText, BODY_PREVIEW)} (${n(u.bodyText.length)} characters)` }
    );
    if (u.metrics.length) {
      fields.push({
        label: "Metrics",
        after: planned.metricChecks.map((c, i) => metricLine(c, u.metrics[i])).join("\n"),
      });
    }
    fields.push({
      label: "Source",
      after: `Slack email from ${u.source.fromName || "unknown"} (${u.source.fromDomain || "unknown domain"}), forwarded by ${u.source.forwardedBy || "unknown"}`,
    });
    const names = u.source.attachments?.map((a) => a.filename) ?? [];
    fields.push({ label: "Attachments", after: names.length ? names.join(", ") : u.source.attachmentCount ? `${u.source.attachmentCount} (names not given)` : "none" });

    if (company?.blockedBy?.length) warnings.push(S.companyExists(company.name, company.blockedBy.map((b) => b.name)));
    else {
      warnings.push(S.visibleToFounders);
      if (company) warnings.push(S.createsNoFounder, S.laterAccess(company.name));
    }
    for (const r of planned.samePeriod) warnings.push(S.samePeriod(u.period, r.title, r.sentAt ? day(r.sentAt) : "unsent", r.createdBy, r.bodyPreview));
    if (planned.replacingMarge) warnings.push(S.replacesMarge(planned.replacingMarge));
    const existingUpdate = planned.duplicate
      ? { id: planned.duplicate.updateId, title: planned.duplicate.title, url: updateUrl(planned.duplicate.updateId) }
      : null;
    if (existingUpdate) warnings.push(S.alreadyFiled(existingUpdate.title, existingUpdate.url));

    return preview(
      {
        action: company ? A.createCompanyAndUpdate : A.addUpdate,
        target: planned.companyName + (company ? " (new)" : ""),
        fields,
        warnings,
      },
      {
        ...(company ? { company } : {}),
        samePeriod: planned.samePeriod,
        metricChecks: planned.metricChecks,
        duplicate: !!planned.duplicate,
        ...(existingUpdate ? { existingUpdate } : {}),
      }
    );
  }

  const r = await fileEmailUpdate(p, u, requireVia(opts));
  if (!r.ok) throw new ToolError(r.error);
  const url = updateUrl(r.value.updateId);
  const structured: UpdateCreateApplied = {
    updateId: r.value.updateId,
    url,
    duplicate: r.value.duplicate,
    ...(r.value.duplicate ? { existingUpdate: { id: r.value.updateId, title: r.value.existingTitle ?? "", url } } : {}),
    metricsWritten: r.value.metricsWritten,
    definitionsCreated: r.value.definitionsCreated,
    companyId: r.value.companyId,
    companyCreated: r.value.companyCreated,
    linkedLedgerId: r.value.linkedLedgerId,
  };
  return {
    text: r.value.duplicate
      ? S.alreadyFiled(r.value.existingTitle ?? "", url)
      : `Filed “${u.title}” as a ${u.period} update${r.value.companyCreated ? " on a new company" : ""}. ${r.value.metricsWritten} ${r.value.metricsWritten === 1 ? "figure" : "figures"} recorded${r.value.keptFounder ? `, ${r.value.keptFounder} left as in Molly` : ""}. ${url}`,
    structured: structured as unknown as Record<string, unknown>,
    count: 1,
  };
}

// ── metric_value_set ──────────────────────────────────────────────────────────────────────
export async function metricValueSet(input: z.infer<typeof metricValueSetInput>, p: Principal, opts: WriteOpts): Promise<ToolOutput> {
  const m = unwrap(validateMetricValueSet(input));
  if (opts.dryRun) {
    const planned = unwrap(await planMetricValue(m));
    const d = planned.decision;
    const before = planned.before ? `${n(planned.before.value)} (${planned.before.date}, ${planned.before.source})` : "none";
    const warnings: string[] = [];
    if (d.action === "kept_founder") warnings.push(S.keptFigure);
    if (d.action === "replace") warnings.push(S.replacesMargeOn(d.existing?.date ?? m.date));
    return preview(
      {
        action: A.recordMetric,
        target: `${planned.companyName} — ${d.name}`,
        fields: [
          { label: "Value", before, after: d.action === "kept_founder" ? `${before} (kept)` : fmtValue(m.value, m.unit) },
          { label: "Date", after: m.date },
          { label: "Quote", after: m.quote ?? "none" },
        ],
        warnings,
      },
      { samePeriod: [], metricChecks: [{ name: d.name, action: d.action, ...(d.existing ? { existing: d.existing } : {}) }] }
    );
  }
  const r = await setMetricValue(p, m, requireVia(opts));
  if (!r.ok) throw new ToolError(r.error);
  const url = companyUrl(r.value.companyId);
  const structured: MetricValueSetApplied = {
    valueId: r.value.valueId,
    definitionId: r.value.definitionId,
    url,
    ...(r.value.replaced ? { replaced: r.value.replaced } : {}),
    ...(r.value.keptFounder ? { keptFounder: true } : {}),
  };
  return {
    text: r.value.keptFounder ? `${S.keptFigure} ${url}` : `Recorded the figure. ${url}`,
    structured: structured as unknown as Record<string, unknown>,
    count: 1,
  };
}
