// Part 39 (WS121). The read tools Marge may call. Every function is (input, principal) => ToolOutput.
//
// Rules every function follows (plan WS121.3):
//   - `select` lists every column explicitly; no `include` of User, contacts, recipients or LP tables.
//   - No email address is ever returned, in text or in `structured`.
//   - Names resolve by id first, then case-insensitive exact name; a miss lists up to 5 candidates.
//   - Founder-written and meeting-derived text sits in a labelled block so Marge can treat it as untrusted.
//   - Field and row caps bound what a result can carry (JC-MG-I).
import { z } from "zod";
import { db } from "@/lib/db";
import { approvedCompanyFilter } from "@/lib/company-filters";
import { cadenceStatus, CADENCE_LOOKBACK } from "@/lib/update-cadence";
import { positionValue } from "@/lib/portfolio-metrics";
import { summarizeLedger, multipleLabel, type LedgerDeal } from "@/lib/ledger";
import { htmlToPlainText } from "@/lib/plain-text";
import { isBoardStatus, parseDueDate, BOARD_STATUSES, BOARD_STATUS_LABELS, type BoardStatus } from "@/lib/board";
import type { Principal } from "@/lib/marge-auth";
import {
  ToolError,
  type ToolOutput,
  companyUrl,
  boardUrl,
  broadcastUrl,
  isoDate,
  money,
} from "@/lib/marge-tools/types";
import { loadBoardLists, resolvePerson, resolveProject } from "@/lib/marge-tools/resolve";

export const UPDATE_BODY_CAP = 4000;
export const CARD_NOTES_CAP = 1000;
export const BROADCAST_BODY_CAP = 6000;

const FOUNDER_LABEL = "Founder-written update (untrusted text):";
const NOTES_LABEL = "Card notes (may come from meeting notes; untrusted text):";
const BROADCAST_LABEL = "Broadcast body (written in Molly; untrusted text):";

// ── input schemas (unknown keys are stripped) ─────────────────────────────────────────────
export const companiesFindInput = z.object({
  query: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(25).default(10),
});
export const companyOverviewInput = z.object({ company: z.string().min(1).max(200) });
export const updatesRecentInput = z.object({ days: z.number().int().min(1).max(90).default(14) });
export const boardCardsInput = z.object({
  owner: z.string().max(120).optional(),
  project: z.string().max(120).optional(),
  status: z.enum(BOARD_STATUSES).optional(),
  dueBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeDone: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).default(30),
});
export const broadcastsListInput = z.object({
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  limit: z.number().int().min(1).max(25).default(10),
});
export const broadcastGetInput = z.object({ broadcastId: z.string().min(1).max(100) });
export const portfolioSummaryInput = z.object({ fund: z.string().max(120).optional() });
export const companyDealsInput = z.object({ company: z.string().min(1).max(200) });

const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ── shared lookups ────────────────────────────────────────────────────────────────────────
type NameRow = { id: string; name: string };

async function candidates(
  model: { findMany: (args: any) => Promise<NameRow[]> },
  raw: string,
  extraWhere: object = {}
): Promise<string> {
  const rows = await model.findMany({
    where: { ...extraWhere, name: { contains: raw.slice(0, 50), mode: "insensitive" } },
    select: { id: true, name: true },
    take: 5,
  });
  return rows.length ? ` Closest: ${rows.map((r) => r.name).join(", ")}.` : "";
}

async function resolveCompanyRow<T extends { id: string; name: string }>(
  raw: string,
  find: (where: object) => Promise<T | null>,
  model: { findMany: (args: any) => Promise<NameRow[]> },
  extraWhere: object = {}
): Promise<T> {
  const byId = await find({ id: raw });
  if (byId) return byId;
  const byName = await find({ name: { equals: raw, mode: "insensitive" } });
  if (byName) return byName;
  throw new ToolError(`No company called “${raw}”.${await candidates(model, raw, extraWhere)}`);
}

// ── companies_find ────────────────────────────────────────────────────────────────────────
export async function companiesFind(input: z.infer<typeof companiesFindInput>, _p: Principal): Promise<ToolOutput> {
  const q = input.query?.trim();
  const rows = await db.company.findMany({
    where: { AND: [approvedCompanyFilter, ...(q ? [{ name: { contains: q, mode: "insensitive" as const } }] : [])] },
    orderBy: { name: "asc" },
    take: input.limit,
    select: {
      id: true,
      name: true,
      sector: true,
      geography: true,
      fundingStage: true,
      createdAt: true,
      updates: {
        where: { status: "SENT" },
        orderBy: { sentAt: "desc" },
        take: CADENCE_LOOKBACK,
        select: { sentAt: true },
      },
    },
  });
  const companies = rows.map((c) => ({
    id: c.id,
    name: c.name,
    sector: c.sector,
    geography: c.geography,
    stage: c.fundingStage,
    lastUpdate: isoDate(c.updates[0]?.sentAt),
    cadence: cadenceStatus({ createdAt: c.createdAt, publishedUpdates: c.updates }),
    url: companyUrl(c.id),
  }));
  const lines = companies.map(
    (c) =>
      `[${c.id}] ${c.name} · ${c.sector ?? "no sector"} · ${c.geography ?? "no geography"} · ${c.stage ?? "no stage"} · last update ${c.lastUpdate ?? "none"} · ${c.cadence} · ${c.url}`
  );
  return {
    text: lines.length ? lines.join("\n") : "No companies matched.",
    structured: { companies },
    count: companies.length,
  };
}

// ── company_overview ──────────────────────────────────────────────────────────────────────
export async function companyOverview(input: z.infer<typeof companyOverviewInput>, _p: Principal): Promise<ToolOutput> {
  const raw = input.company.trim();
  const company = await resolveCompanyRow(
    raw,
    (where) =>
      db.company.findFirst({
        where: { AND: [approvedCompanyFilter, where] },
        select: {
          id: true,
          name: true,
          description: true,
          website: true,
          sector: true,
          geography: true,
          fundingStage: true,
          createdAt: true,
        },
      }),
    db.company,
    approvedCompanyFilter
  );
  const [updates, metricDefs, cadenceRows] = await Promise.all([
    db.update.findMany({
      where: { companyId: company.id, status: "SENT" },
      orderBy: { sentAt: "desc" },
      take: 3,
      select: { id: true, title: true, period: true, sentAt: true, body: true },
    }),
    db.metricDefinition.findMany({
      where: { companyId: company.id },
      orderBy: { name: "asc" },
      select: {
        name: true,
        unit: true,
        values: { orderBy: { date: "desc" }, take: 1, select: { value: true, date: true } },
      },
    }),
    db.update.findMany({
      where: { companyId: company.id, status: "SENT" },
      orderBy: { sentAt: "desc" },
      take: CADENCE_LOOKBACK,
      select: { sentAt: true },
    }),
  ]);
  const cadence = cadenceStatus({ createdAt: company.createdAt, publishedUpdates: cadenceRows });
  const metrics = metricDefs
    .filter((m) => m.values.length)
    .map((m) => ({ name: m.name, unit: m.unit, value: num(m.values[0].value), date: isoDate(m.values[0].date) }));
  const updateRows = updates.map((u) => ({
    id: u.id,
    title: u.title,
    period: u.period,
    sentAt: isoDate(u.sentAt),
    body: htmlToPlainText(u.body, UPDATE_BODY_CAP),
  }));

  const lines = [
    `[${company.id}] ${company.name} · ${company.sector ?? "no sector"} · ${company.geography ?? "no geography"} · ${company.fundingStage ?? "no stage"} · ${cadence}`,
    `Link: ${companyUrl(company.id)}`,
  ];
  if (company.website) lines.push(`Website: ${company.website}`);
  if (company.description) lines.push(`About: ${htmlToPlainText(company.description, 500)}`);
  lines.push("", "Latest metrics:");
  lines.push(
    ...(metrics.length
      ? metrics.map((m) => `- ${m.name}: ${m.value.toLocaleString("en-US")}${m.unit ? ` ${m.unit}` : ""} (${m.date})`)
      : ["- none recorded"])
  );
  lines.push("", `Latest updates (${updateRows.length}):`);
  if (!updateRows.length) lines.push("- none sent");
  for (const u of updateRows) lines.push(`- ${u.title} · ${u.period} · sent ${u.sentAt}`, FOUNDER_LABEL, u.body, "---");

  return {
    text: lines.join("\n"),
    structured: {
      company: {
        id: company.id,
        name: company.name,
        sector: company.sector,
        geography: company.geography,
        stage: company.fundingStage,
        website: company.website,
        cadence,
        url: companyUrl(company.id),
      },
      metrics,
      updates: updateRows,
    },
    count: updateRows.length + metrics.length,
  };
}

// ── updates_recent ────────────────────────────────────────────────────────────────────────
export async function updatesRecent(input: z.infer<typeof updatesRecentInput>, _p: Principal): Promise<ToolOutput> {
  const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
  const rows = await db.update.findMany({
    where: { status: "SENT", sentAt: { gte: since } },
    orderBy: { sentAt: "desc" },
    take: 100,
    select: { id: true, title: true, period: true, sentAt: true, company: { select: { id: true, name: true } } },
  });
  const updates = rows.map((u) => ({
    id: u.id,
    company: u.company.name,
    companyId: u.company.id,
    title: u.title,
    period: u.period,
    sentAt: isoDate(u.sentAt),
  }));
  const lines = updates.map((u) => `[${u.id}] ${u.company} · ${u.title} · ${u.period} · sent ${u.sentAt}`);
  return {
    text: lines.length ? `Updates sent in the last ${input.days} days:\n${lines.join("\n")}` : `No updates were sent in the last ${input.days} days.`,
    structured: { days: input.days, updates },
    count: updates.length,
  };
}

// ── board_cards ───────────────────────────────────────────────────────────────────────────
export async function boardCards(input: z.infer<typeof boardCardsInput>, p: Principal): Promise<ToolOutput> {
  const lists = await loadBoardLists();
  const where: Record<string, unknown> = { archivedAt: null };

  if (input.owner) {
    const person = await resolvePerson(input.owner, p, lists);
    where.owners = { some: { personId: person.id } };
  }
  if (input.project) {
    where.projectId = resolveProject(input.project, lists).id;
  }
  if (input.status !== undefined) {
    if (!isBoardStatus(input.status)) throw new ToolError("Unknown status.");
    where.status = input.status;
  } else if (!input.includeDone) {
    where.status = { not: "DONE" };
  }
  if (input.dueBefore) {
    const d = parseDueDate(input.dueBefore);
    if (!d) throw new ToolError("dueBefore must be a date like 2026-10-23.");
    where.dueDate = { lt: d };
  }

  const rows = await db.boardCard.findMany({
    where,
    orderBy: [{ status: "asc" }, { position: "asc" }],
    take: input.limit,
    select: {
      id: true,
      title: true,
      status: true,
      notes: true,
      dueDate: true,
      needsReview: true,
      updatedAt: true,
      project: { select: { name: true } },
      owners: { select: { person: { select: { displayName: true, user: { select: { name: true } } } } } },
      _count: { select: { links: true } },
    },
  });

  const cards = rows.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    owners: c.owners.map((o) => o.person.user?.name ?? o.person.displayName),
    project: c.project?.name ?? null,
    due: isoDate(c.dueDate),
    linkCount: c._count.links,
    needsReview: c.needsReview,
    updatedAt: c.updatedAt.toISOString(),
    notes: c.notes ? htmlToPlainText(c.notes, CARD_NOTES_CAP) : null,
  }));

  const lines: string[] = [];
  for (const c of cards) {
    lines.push(
      `[${c.id}] ${c.title} · ${BOARD_STATUS_LABELS[c.status as BoardStatus] ?? c.status} · owners: ${c.owners.join(", ") || "none"} · project: ${c.project ?? "none"} · due ${c.due ?? "none"} · ${c.linkCount} link${c.linkCount === 1 ? "" : "s"}${c.needsReview ? " · needs review" : ""}`
    );
    if (c.notes) lines.push(NOTES_LABEL, c.notes, "---");
  }
  const people = lists.people.map((x) => x.name);
  const projects = lists.projects.map((x) => x.name);
  const text = [
    cards.length ? lines.join("\n") : "No cards matched.",
    "",
    `Board: ${boardUrl()}`,
    `People: ${people.join(", ") || "none"}`,
    `Projects: ${projects.join(", ") || "none"}`,
  ].join("\n");
  return { text, structured: { cards, people, projects, url: boardUrl() }, count: cards.length };
}

// ── broadcasts ────────────────────────────────────────────────────────────────────────────
/** "By" labels from names only (never falls back to an email, unlike senderLabels). */
async function senderNames(
  broadcasts: { id: string; status: string; createdById: string }[]
): Promise<Record<string, string | null>> {
  const sentIds = broadcasts.filter((b) => b.status === "PUBLISHED").map((b) => b.id);
  const entries = sentIds.length
    ? await db.auditLog.findMany({
        where: { action: "BROADCAST_PUBLISHED", targetType: "CompanyBroadcast", targetId: { in: sentIds } },
        orderBy: { createdAt: "asc" },
        select: { targetId: true, actorId: true },
      })
    : [];
  const publisher = new Map<string, string>();
  for (const e of entries) if (e.targetId && e.actorId && !publisher.has(e.targetId)) publisher.set(e.targetId, e.actorId);
  const ids = Array.from(new Set(broadcasts.map((b) => publisher.get(b.id) ?? b.createdById)));
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u.name?.trim() || null]));
  return Object.fromEntries(broadcasts.map((b) => [b.id, byId.get(publisher.get(b.id) ?? b.createdById) ?? null]));
}

async function recipientCounts(ids: string[]): Promise<Record<string, { sent: number; failed: number }>> {
  const out: Record<string, { sent: number; failed: number }> = {};
  if (!ids.length) return out;
  const groups = await db.companyBroadcastRecipient.groupBy({
    by: ["broadcastId", "status"],
    where: { broadcastId: { in: ids } },
    _count: { _all: true },
  });
  for (const g of groups) {
    const e = (out[g.broadcastId] ??= { sent: 0, failed: 0 });
    if (g.status === "SENT") e.sent += g._count._all;
    if (g.status === "FAILED") e.failed += g._count._all;
  }
  return out;
}

export async function broadcastsList(input: z.infer<typeof broadcastsListInput>, _p: Principal): Promise<ToolOutput> {
  const rows = await db.companyBroadcast.findMany({
    where: input.status ? { status: input.status } : {},
    orderBy: { createdAt: "desc" },
    take: input.limit,
    select: {
      id: true,
      subject: true,
      status: true,
      publishedAt: true,
      createdById: true,
      _count: { select: { targets: true, recipients: true } },
    },
  });
  const [by, counts] = await Promise.all([senderNames(rows), recipientCounts(rows.map((r) => r.id))]);
  const broadcasts = rows.map((b) => ({
    id: b.id,
    subject: b.subject,
    status: b.status,
    publishedAt: isoDate(b.publishedAt),
    targetCount: b._count.targets,
    recipientCount: b._count.recipients,
    sent: counts[b.id]?.sent ?? 0,
    failed: counts[b.id]?.failed ?? 0,
    by: by[b.id] ?? null,
    url: broadcastUrl(b.id),
  }));
  const lines = broadcasts.map(
    (b) =>
      `[${b.id}] ${b.subject} · ${b.status}${b.publishedAt ? ` ${b.publishedAt}` : ""} · ${b.targetCount} companies · ${b.recipientCount} recipients (${b.sent} sent, ${b.failed} failed) · by ${b.by ?? "unknown"}`
  );
  return { text: lines.length ? lines.join("\n") : "No broadcasts matched.", structured: { broadcasts }, count: broadcasts.length };
}

export async function broadcastGet(input: z.infer<typeof broadcastGetInput>, _p: Principal): Promise<ToolOutput> {
  const b = await db.companyBroadcast.findUnique({
    where: { id: input.broadcastId },
    select: {
      id: true,
      subject: true,
      status: true,
      body: true,
      publishedAt: true,
      updatedAt: true,
      createdById: true,
      targets: { select: { portfolioCompany: { select: { name: true } } } },
      _count: { select: { recipients: true } },
    },
  });
  if (!b) throw new ToolError("No broadcast with that id.");
  const [by, counts] = await Promise.all([senderNames([b]), recipientCounts([b.id])]);
  const body = htmlToPlainText(b.body, BROADCAST_BODY_CAP);
  const companies = b.targets.map((t) => t.portfolioCompany.name).sort();
  const sent = counts[b.id]?.sent ?? 0;
  const failed = counts[b.id]?.failed ?? 0;
  const text = [
    `[${b.id}] ${b.subject} · ${b.status}${b.publishedAt ? ` ${isoDate(b.publishedAt)}` : ""} · by ${by[b.id] ?? "unknown"}`,
    `Audience (${companies.length}): ${companies.join(", ") || "none"}`,
    `Recipients: ${b._count.recipients} (${sent} sent, ${failed} failed)`,
    `Link: ${broadcastUrl(b.id)}`,
    BROADCAST_LABEL,
    body || "(empty)",
  ].join("\n");
  return {
    text,
    structured: {
      broadcast: {
        id: b.id,
        subject: b.subject,
        status: b.status,
        body,
        companies,
        updatedAt: b.updatedAt.toISOString(),
        recipientCount: b._count.recipients,
        sent,
        failed,
        by: by[b.id] ?? null,
        url: broadcastUrl(b.id),
      },
    },
    count: 1,
  };
}

// ── deal ledger (DM only) ─────────────────────────────────────────────────────────────────
export async function portfolioSummary(input: z.infer<typeof portfolioSummaryInput>, _p: Principal): Promise<ToolOutput> {
  const raw = input.fund?.trim();
  let fund: { id: string; name: string } | null = null;
  if (raw) {
    fund =
      (await db.fund.findFirst({
        where: { OR: [{ id: raw }, { slug: { equals: raw, mode: "insensitive" } }, { name: { equals: raw, mode: "insensitive" } }] },
        select: { id: true, name: true },
      })) ?? null;
    if (!fund) {
      const near = await db.fund.findMany({
        where: { name: { contains: raw.slice(0, 50), mode: "insensitive" } },
        select: { id: true, name: true },
        take: 5,
      });
      throw new ToolError(`No fund called “${raw}”.${near.length ? ` Closest: ${near.map((f) => f.name).join(", ")}.` : ""}`);
    }
  }
  const deals = await db.deal.findMany({
    where: fund ? { fundId: fund.id } : {},
    select: {
      amountUsd: true,
      entryValuation: true,
      currentValuation: true,
      ownershipPct: true,
      fund: { select: { id: true, name: true } },
      portfolioCompany: { select: { id: true } },
    },
  });
  const ledger: (LedgerDeal & { fundName: string })[] = deals.map((d) => {
    const amountUsd = num(d.amountUsd);
    const currentValuation = numOrNull(d.currentValuation);
    const pv = positionValue(
      { amountUsd, entryValuation: numOrNull(d.entryValuation), currentValuation, ownershipPct: numOrNull(d.ownershipPct) },
      currentValuation
    );
    return { amountUsd, positionValue: pv.value, dilutionAware: pv.dilutionAware, fund: { id: d.fund.id }, portfolioCompany: d.portfolioCompany, fundName: d.fund.name };
  });
  const row = (label: string, rows: LedgerDeal[]) => ({ label, ...summarizeLedger(rows) });
  const overall = row(fund ? fund.name : "All funds", ledger);
  const perFund = fund
    ? []
    : Array.from(new Set(ledger.map((d) => d.fund.id))).map((id) => {
        const rows = ledger.filter((d) => d.fund.id === id);
        return row(rows[0].fundName, rows);
      });
  const fmt = (r: ReturnType<typeof row>) =>
    `${r.label}: ${r.dealCount} deals · ${r.companyCount} companies · invested ${money(r.totalInvested)} · blended implied value ${money(r.blendedImpliedValue)}${r.anyDilutionAware ? " (some dilution-aware)" : ""}`;
  return {
    text: [fmt(overall), ...perFund.map(fmt)].join("\n"),
    structured: { overall, perFund },
    count: ledger.length,
  };
}

export async function companyDeals(input: z.infer<typeof companyDealsInput>, _p: Principal): Promise<ToolOutput> {
  const raw = input.company.trim();
  const pc = await resolveCompanyRow(
    raw,
    (where) => db.portfolioCompany.findFirst({ where, select: { id: true, name: true } }),
    db.portfolioCompany
  );
  const rows = await db.deal.findMany({
    where: { portfolioCompanyId: pc.id },
    orderBy: { dealDate: "desc" },
    select: {
      id: true,
      dealDate: true,
      investmentType: true,
      amountUsd: true,
      instrument: true,
      entryValuation: true,
      currentValuation: true,
      ownershipPct: true,
      fund: { select: { name: true } },
    },
  });
  const deals = rows.map((d) => {
    const amountUsd = num(d.amountUsd);
    const entry = numOrNull(d.entryValuation);
    const current = numOrNull(d.currentValuation);
    const own = numOrNull(d.ownershipPct);
    const pv = positionValue({ amountUsd, entryValuation: entry, currentValuation: current, ownershipPct: own }, current);
    return {
      id: d.id,
      fund: d.fund.name,
      date: isoDate(d.dealDate),
      type: d.investmentType,
      amountUsd,
      instrument: d.instrument,
      entryValuation: entry,
      currentValuation: current,
      ownershipPct: own,
      multiple: multipleLabel({ amountUsd, positionValue: pv.value }),
    };
  });
  const lines = deals.map(
    (d) =>
      `${d.date} · ${d.fund} · ${d.type} · ${money(d.amountUsd)}${d.instrument ? ` · ${d.instrument}` : ""} · entry ${d.entryValuation === null ? "n/a" : money(d.entryValuation)} · current ${d.currentValuation === null ? "n/a" : money(d.currentValuation)}${d.ownershipPct === null ? "" : ` · ownership ${d.ownershipPct}%`} · multiple ${d.multiple}`
  );
  return {
    text: lines.length ? `${pc.name} deals:\n${lines.join("\n")}` : `${pc.name} has no deals recorded.`,
    structured: { company: { id: pc.id, name: pc.name }, deals },
    count: deals.length,
  };
}
