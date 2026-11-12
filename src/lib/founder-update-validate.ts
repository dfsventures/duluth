// Part 45 (WS149). Pure validators for the founder-update tools and shared actions: every bound that has
// a sentence lives here (F160), not in zod. No database access, no email. Inputs arrive as already
// zod-typed objects from Marge, but nothing here trusts them: values are re-checked and rebuilt field by
// field (an allowlist), so an unknown key can never reach a write.
import { PERIOD_RE } from "@/lib/founder-updates";
import { PORTCO_LIMITS as L, PORTCO_SENTENCES as S } from "@/lib/marge-tools/portco-contract";

export type Valid<T> = { ok: true; value: T } | { ok: false; error: string };
const bad = (error: string): { ok: false; error: string } => ({ ok: false, error });
const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

export function parseDateOnly(raw: unknown): Date | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw ? null : d;
}

export function validateKey(raw: unknown): Valid<string> {
  return typeof raw === "string" && KEY_RE.test(raw) ? ok(raw) : bad(S.badIdempotency);
}

function httpUrl(raw: string, max: number): string | null {
  const v = raw.trim();
  if (!v || v.length > max || /\s/.test(v) || !/^https?:\/\//i.test(v)) return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

// ── company ───────────────────────────────────────────────────────────────────────────────
export interface NewCompanyInput {
  name: string;
  ledgerId: string | null;
  website: string | null;
  idempotencyKey: string;
}

export function validateCompanyName(raw: unknown): Valid<string> {
  if (typeof raw !== "string") return bad(S.badName);
  const v = raw.trim();
  if (!v || v.length > L.nameMax || !/\p{L}/u.test(v) || /[\r\n<>]/.test(v)) return bad(S.badName);
  return ok(v);
}

export function validateNewCompany(raw: unknown): Valid<NewCompanyInput> {
  if (!isObj(raw)) return bad(S.badName);
  const name = validateCompanyName(raw.name);
  if (!name.ok) return name;
  let website: string | null = null;
  if (raw.website !== undefined && raw.website !== null && raw.website !== "") {
    if (typeof raw.website !== "string") return bad(S.badWebsite);
    const u = httpUrl(raw.website, L.websiteMax);
    if (!u) return bad(S.badWebsite);
    website = u;
  }
  let ledgerId: string | null = null;
  if (raw.ledgerId !== undefined && raw.ledgerId !== null && raw.ledgerId !== "") {
    if (typeof raw.ledgerId !== "string" || raw.ledgerId.length > 100) return bad(S.ledgerUnknown);
    ledgerId = raw.ledgerId;
  }
  const key = validateKey(raw.idempotencyKey);
  if (!key.ok) return key;
  return ok({ name: name.value, ledgerId, website, idempotencyKey: key.value });
}

// ── metrics ───────────────────────────────────────────────────────────────────────────────
export interface MetricInput {
  definitionId: string | null;
  name: string | null;
  unit: string | null;
  value: number;
  date: string; // YYYY-MM-DD
  quote: string | null;
  replaceValueId: string | null;
}

export function validateMetric(raw: unknown, opts: { quoteRequired: boolean }): Valid<MetricInput> {
  if (!isObj(raw)) return bad(S.badValue);
  const hasId = typeof raw.definitionId === "string" && raw.definitionId.length > 0;
  const hasName = raw.name !== undefined && raw.name !== null && raw.name !== "";
  if (hasId === hasName) return bad(S.metricXor);
  let name: string | null = null;
  if (hasName) {
    if (typeof raw.name !== "string") return bad(S.badMetricName);
    const n = raw.name.trim();
    if (!n || n.length > L.metricNameMax || /[\r\n]/.test(n)) return bad(S.badMetricName);
    name = n;
  }
  let unit: string | null = null;
  if (raw.unit !== undefined && raw.unit !== null) {
    if (typeof raw.unit !== "string") return bad(S.badUnit);
    const u = raw.unit.trim();
    if (u.length > 40) return bad(S.badUnit);
    unit = u || null;
  }
  if (typeof raw.value !== "number" || !Number.isFinite(raw.value) || Math.abs(raw.value) >= L.valueAbsMax) return bad(S.badValue);
  if (!parseDateOnly(raw.date)) return bad(S.badDate);
  let quote: string | null = null;
  if (raw.quote !== undefined && raw.quote !== null) {
    if (typeof raw.quote !== "string") return bad(S.badQuote);
    const q = raw.quote.trim();
    if (!q || q.length > L.quoteMax) return bad(S.badQuote);
    quote = q;
  } else if (opts.quoteRequired) return bad(S.badQuote);
  let replaceValueId: string | null = null;
  if (raw.replaceValueId !== undefined && raw.replaceValueId !== null && raw.replaceValueId !== "") {
    if (typeof raw.replaceValueId !== "string" || raw.replaceValueId.length > 100) return bad(S.replaceUnknown);
    replaceValueId = raw.replaceValueId;
  }
  return ok({
    definitionId: hasId ? (raw.definitionId as string) : null,
    name,
    unit,
    value: raw.value,
    date: raw.date as string,
    quote,
    replaceValueId,
  });
}

export interface MetricValueSetInput extends MetricInput {
  companyId: string;
}
export function validateMetricValueSet(raw: unknown): Valid<MetricValueSetInput> {
  if (!isObj(raw)) return bad(S.badValue);
  if (typeof raw.companyId !== "string" || !raw.companyId || raw.companyId.length > 100) return bad(S.noCompany(String(raw.companyId ?? ""), []));
  const m = validateMetric(raw, { quoteRequired: false });
  if (!m.ok) return m;
  return ok({ ...m.value, companyId: raw.companyId });
}

// ── update ────────────────────────────────────────────────────────────────────────────────
export interface SourceInput {
  kind: "slack_email";
  channelId: string;
  messageTs: string;
  permalink: string;
  subject: string;
  fromName: string;
  fromDomain: string;
  forwardedBy: string;
  attachmentCount?: number;
  attachments?: { filename: string; mimetype?: string; size?: number }[];
}

const ID_PART = /^[A-Za-z0-9._-]{1,40}$/;

export function validateSource(raw: unknown): Valid<SourceInput> {
  if (!isObj(raw) || raw.kind !== "slack_email") return bad(S.badSource);
  const str = (v: unknown, max: number, noAt: boolean): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t.length > max) return null;
    if (noAt && t.includes("@")) return null;
    return t;
  };
  if (typeof raw.channelId !== "string" || !ID_PART.test(raw.channelId)) return bad(S.badSource);
  if (typeof raw.messageTs !== "string" || !ID_PART.test(raw.messageTs)) return bad(S.badSource);
  const permalink = typeof raw.permalink === "string" ? httpUrl(raw.permalink, 500) : null;
  if (!permalink) return bad(S.badSource);
  for (const k of ["subject", "fromName", "forwardedBy"] as const) {
    if (typeof raw[k] === "string" && (raw[k] as string).includes("@")) return bad(S.sourceHasAddress);
  }
  const subject = str(raw.subject, L.sourceTextMax, true);
  const fromName = str(raw.fromName, L.personMax, true);
  const forwardedBy = str(raw.forwardedBy, L.personMax, true);
  const fromDomain = str(raw.fromDomain, L.fromDomainMax, true);
  if (subject === null || fromName === null || forwardedBy === null || fromDomain === null) return bad(S.badSource);
  const out: SourceInput = { kind: "slack_email", channelId: raw.channelId, messageTs: raw.messageTs, permalink, subject, fromName, fromDomain, forwardedBy };
  if (raw.attachmentCount !== undefined) {
    if (typeof raw.attachmentCount !== "number" || !Number.isInteger(raw.attachmentCount) || raw.attachmentCount < 0) return bad(S.badSource);
    out.attachmentCount = raw.attachmentCount;
  }
  if (raw.attachments !== undefined) {
    if (!Array.isArray(raw.attachments)) return bad(S.badSource);
    if (raw.attachments.length > L.attachmentsMax) return bad(S.tooManyAttachments);
    const list: NonNullable<SourceInput["attachments"]> = [];
    for (const a of raw.attachments) {
      if (!isObj(a) || typeof a.filename !== "string" || !a.filename.trim() || a.filename.length > 300) return bad(S.badSource);
      const item: { filename: string; mimetype?: string; size?: number } = { filename: a.filename.trim() };
      if (a.mimetype !== undefined) {
        if (typeof a.mimetype !== "string" || a.mimetype.length > 200) return bad(S.badSource);
        item.mimetype = a.mimetype;
      }
      if (a.size !== undefined) {
        if (typeof a.size !== "number" || !Number.isInteger(a.size) || a.size < 0) return bad(S.badSource);
        item.size = a.size;
      }
      list.push(item);
    }
    out.attachments = list;
  }
  return ok(out);
}

export interface FileUpdateInput {
  companyId: string | null;
  newCompany: NewCompanyInput | null;
  period: string;
  title: string;
  bodyText: string;
  sentAt: string; // YYYY-MM-DD
  source: SourceInput;
  metrics: MetricInput[];
  idempotencyKey: string;
}

export function validateFileUpdate(raw: unknown): Valid<FileUpdateInput> {
  if (!isObj(raw)) return bad(S.badSource);
  const hasCompany = typeof raw.companyId === "string" && raw.companyId.length > 0;
  const hasNew = raw.newCompany !== undefined && raw.newCompany !== null;
  if (hasCompany === hasNew) return bad(S.companyXor);
  let newCompany: NewCompanyInput | null = null;
  if (hasNew) {
    const c = validateNewCompany(raw.newCompany);
    if (!c.ok) return c;
    newCompany = c.value;
  }
  if (typeof raw.period !== "string" || !PERIOD_RE.test(raw.period)) return bad(S.badPeriod);
  if (typeof raw.title !== "string") return bad(S.badTitle);
  const title = raw.title.trim();
  if (!title || title.length > L.titleMax) return bad(S.badTitle);
  if (typeof raw.bodyText !== "string") return bad(S.badBody);
  const bodyText = raw.bodyText.replace(/\r\n?/g, "\n").trim();
  if (!bodyText) return bad(S.badBody);
  if (bodyText.length > L.bodyMax) return bad(S.bodyTooLong);
  if (!parseDateOnly(raw.sentAt)) return bad(S.badDate);
  const source = validateSource(raw.source);
  if (!source.ok) return source;
  const metricsRaw = raw.metrics === undefined ? [] : raw.metrics;
  if (!Array.isArray(metricsRaw)) return bad(S.tooManyMetrics);
  if (metricsRaw.length > L.metricsMax) return bad(S.tooManyMetrics);
  const metrics: MetricInput[] = [];
  for (const m of metricsRaw) {
    const v = validateMetric(m, { quoteRequired: true });
    if (!v.ok) return v;
    metrics.push(v.value);
  }
  const key = validateKey(raw.idempotencyKey);
  if (!key.ok) return key;
  return ok({
    companyId: hasCompany ? (raw.companyId as string) : null,
    newCompany,
    period: raw.period,
    title,
    bodyText,
    sentAt: raw.sentAt as string,
    source: source.value,
    metrics,
    idempotencyKey: key.value,
  });
}

// ── reads ─────────────────────────────────────────────────────────────────────────────────
export function validateLimit(raw: unknown, fallback: number, max: number): Valid<number> {
  if (raw === undefined) return ok(fallback);
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= max ? ok(raw) : bad(S.badLimit(max));
}
export function validateValuesCount(raw: unknown): Valid<number> {
  if (raw === undefined) return ok(L.valuesDefault);
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= L.valuesMax ? ok(raw) : bad(S.badValuesCount);
}
export function validateMatchInput(raw: { names?: unknown; domain?: unknown }): Valid<{ names: string[]; domain: string | null }> {
  if (!Array.isArray(raw.names) || raw.names.length < 1 || raw.names.length > L.namesMax) return bad(S.badNames);
  const names: string[] = [];
  for (const n of raw.names) {
    if (typeof n !== "string") return bad(S.badNames);
    const t = n.trim();
    if (!t || t.length > L.nameCandidateMax) return bad(S.badNames);
    names.push(t);
  }
  let domain: string | null = null;
  if (raw.domain !== undefined && raw.domain !== null && raw.domain !== "") {
    if (typeof raw.domain !== "string") return bad(S.badDomain);
    const d = raw.domain.trim().toLowerCase();
    if (!d || d.length > L.domainMax || d.includes("@") || /\s/.test(d)) return bad(S.badDomain);
    domain = d;
  }
  return ok({ names, domain });
}
