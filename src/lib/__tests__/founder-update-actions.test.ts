import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emptyState, makeFakeDb, type FakeState } from "./fake-founder-db";

// Part 45, WS149. Mocked db (in-memory, with rollback), mocked audit, mocked email. Synthetic names only.

const h = vi.hoisted(() => ({ holder: { db: null as any }, audit: vi.fn(), emailCalls: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: (_t, k) => h.holder.db[k as string] }) }));
vi.mock("@/lib/audit", () => ({ logAdminAction: (...a: unknown[]) => h.audit(...a) }));
vi.mock("@/lib/email", () => new Proxy({}, { get: () => h.emailCalls }));

import {
  createCompany,
  createUnclaimedCompany,
  duplicateGuard,
  fileEmailUpdate,
  planCompany,
  planFileUpdate,
  planMetricValue,
  removeEmailUpdate,
  setMetricValue,
} from "@/lib/founder-update-actions";
import { validateFileUpdate, validateMetricValueSet, validateNewCompany } from "@/lib/founder-update-validate";

let state: FakeState;
let counts: Record<string, number>;
const ADMIN = { id: "admin1", email: "admin@dfs.example" };
const VIA = { via: "marge" as const, margeActionId: "act1" };

const newCo = (over: Record<string, unknown> = {}) => {
  const v = validateNewCompany({ name: "Zeta Labs", idempotencyKey: "pc_key_00001", ...over });
  if (!v.ok) throw new Error(v.error);
  return v.value;
};
const source = { kind: "slack_email", channelId: "C123", messageTs: "1700000000.0001", permalink: "https://slack.example/p1", subject: "Q3 update", fromName: "Pat Founder", fromDomain: "zeta.example", forwardedBy: "Sam" };
const fileInput = (over: Record<string, unknown> = {}) => {
  const v = validateFileUpdate({
    companyId: "co1",
    period: "2025-Q3",
    title: "Q3 update",
    bodyText: "Hello <b>team</b>\n\nSecond paragraph",
    sentAt: "2025-10-03",
    source,
    metrics: [],
    idempotencyKey: "upd_key_0001",
    ...over,
  });
  if (!v.ok) throw new Error(v.error);
  return v.value;
};
const writeCalls = () => Object.entries(counts).filter(([k]) => /\.(create|update|updateMany|delete|deleteMany)$/.test(k) && !k.startsWith("auditLog"));

beforeEach(() => {
  state = emptyState();
  const fake = makeFakeDb(state);
  counts = fake.counts;
  h.holder.db = fake.db;
  h.audit.mockReset();
  h.emailCalls.mockReset();
  state.users.push({ id: "admin1", roles: ["ADMIN"], name: "Ada Admin" }, { id: "f1", roles: ["FOUNDER"], name: "Pat Founder" });
  state.company.push({ id: "co1", name: "Acme Robotics", aliases: ["Acme"], website: "https://www.acme.example", stage: "ACTIVE", createdAt: new Date("2025-01-01") });
  delete process.env.MARGE_COMPANY_CREATE_PER_DAY;
});
afterEach(() => {
  delete process.env.MARGE_COMPANY_CREATE_PER_DAY;
});

describe("duplicate guard (JC-FU-G)", () => {
  it("blocks on name, alias, website host and weak tokens, for any state", async () => {
    state.company.push(
      { id: "pend", name: "Pending Signup Co", aliases: [], website: null, stage: "ACTIVE" },
      { id: "dd", name: "Diligence Target", aliases: [], website: null, stage: "DILIGENCE" }
    );
    const g = (name: string, website: string | null = null) => duplicateGuard(h.holder.db, { name, website, ledgerId: null });
    expect((await g("acme robotics inc"))[0].reasons).toContain("NAME_EXACT");
    expect((await g("ACME"))[0].reasons).toContain("ALIAS_EXACT");
    expect((await g("Totally Different", "http://acme.example/about"))[0].reasons).toContain("WEBSITE_DOMAIN");
    expect((await g("Acme Robotics Africa"))[0]).toMatchObject({ tier: "WEAK", reasons: ["NAME_TOKENS"] });
    expect((await g("Pending Signup Co")).map((b) => b.id)).toEqual(["pend"]);
    expect((await g("Diligence Target")).map((b) => b.id)).toEqual(["dd"]);
    expect(await g("Unrelated Name")).toEqual([]);
  });
  it("blocks on an equal-named UNLINKED ledger row only when no ledgerId is given", async () => {
    state.portfolioCompany.push({ id: "L1", name: "Zeta Labs Inc", companyId: null }, { id: "L2", name: "Zeta Labs", companyId: "co1" });
    const blocked = await duplicateGuard(h.holder.db, { name: "Zeta Labs", website: null, ledgerId: null });
    expect(blocked.map((b) => [b.kind, b.id])).toEqual([["ledger", "L1"]]);
    expect(await duplicateGuard(h.holder.db, { name: "Zeta Labs", website: null, ledgerId: "L1" })).toEqual([]);
  });
});

describe("createCompany / createUnclaimedCompany", () => {
  it("creates a company with no founder, links the ledger row, audits, and sends nothing", async () => {
    state.portfolioCompany.push({ id: "L1", name: "Zeta Labs", country: "Kenya", companyId: null });
    const r = await createCompany(ADMIN, newCo({ ledgerId: "L1", website: "https://zeta.example" }), VIA);
    expect(r.ok).toBe(true);
    const c = state.company.find((x) => x.name === "Zeta Labs")!;
    expect(c).toMatchObject({ createdVia: "marge", createdById: "admin1", geography: "Kenya", website: "https://zeta.example" });
    expect(c.createKey).toMatch(/^[0-9a-f]{64}$/);
    expect(state.portfolioCompany[0].companyId).toBe(c.id);
    const actions = h.audit.mock.calls.map((c) => c[1]);
    expect(actions).toEqual(["COMPANY_CREATED", "PORTCO_LINKED"]);
    expect(h.audit.mock.calls[0][2].metadata).toMatchObject({ name: "Zeta Labs", createdVia: "marge", portfolioCompanyId: "L1", withUpdate: false, via: "marge", margeActionId: "act1" });
    expect(h.audit.mock.calls[1][2]).toMatchObject({ targetType: "PortfolioCompany", metadata: { previousCompanyId: null, companyId: c.id } });
    expect(h.emailCalls).not.toHaveBeenCalled();
    // no membership table exists in the fake: nothing else was created
    expect(counts["company.create"]).toBe(1);
  });
  it("the same key returns the existing company and writes nothing", async () => {
    const first = await createCompany(ADMIN, newCo());
    h.audit.mockClear();
    const before = state.company.length;
    const again = await createCompany(ADMIN, newCo());
    expect(again).toMatchObject({ ok: true, value: { duplicate: true, companyId: (first as any).value.companyId } });
    expect(state.company.length).toBe(before);
    expect(h.audit).not.toHaveBeenCalled();
  });
  it("refuses a name that matches an existing company, naming it", async () => {
    const r = await createCompany(ADMIN, newCo({ name: "Acme Robotics" }));
    expect(r).toMatchObject({ ok: false, status: 409, error: "Molly already has a company that matches “Acme Robotics”: Acme Robotics. Nothing was created." });
    expect((r as any).blockedBy[0]).toMatchObject({ kind: "company", id: "co1" });
  });
  it("refuses a ledger row linked meanwhile and leaves no company behind", async () => {
    state.portfolioCompany.push({ id: "L1", name: "Zeta Labs", companyId: null });
    // Simulate the row being linked between plan and apply: guard sees it unlinked, updateMany matches 0.
    const real = h.holder.db.portfolioCompany.updateMany;
    h.holder.db.portfolioCompany.updateMany = async () => ({ count: 0 });
    const r = await createCompany(ADMIN, newCo({ ledgerId: "L1" }));
    h.holder.db.portfolioCompany.updateMany = real;
    expect(r.ok).toBe(false);
    expect((r as any).error).toMatch(/already linked to .*Nothing was created\.$/);
    expect(state.company.map((c) => c.id)).toEqual(["co1"]);
  });
  it("refuses an unknown ledger id", async () => {
    const r = await createCompany(ADMIN, newCo({ ledgerId: "nope" }));
    expect(r).toMatchObject({ ok: false, error: "No deal-ledger entry with that id. Nothing was created." });
    expect(state.company.length).toBe(1);
  });
  it("the fuse stops creation at the daily limit (default 60, env override) and fails closed", async () => {
    for (let i = 0; i < 60; i++) state.company.push({ id: `m${i}`, name: `Seeded ${i}x${i}`, aliases: [], website: null, createdVia: "marge", createdAt: new Date() });
    const r = await createCompany(ADMIN, newCo({ name: "Zzz Brand New" }));
    expect(r).toMatchObject({ ok: false, error: "Too many companies were created through Marge today. Try again tomorrow, or add it in Molly." });
    // old rows do not count
    state.company.forEach((c) => c.createdVia === "marge" && (c.createdAt = new Date(Date.now() - 25 * 3600 * 1000)));
    expect((await createCompany(ADMIN, newCo({ name: "Zzz Brand New" }))).ok).toBe(true);
    process.env.MARGE_COMPANY_CREATE_PER_DAY = "1";
    expect((await createCompany(ADMIN, newCo({ name: "Qqq Another One", idempotencyKey: "pc_key_00002" }))).ok).toBe(false);
  });
  it("a plan never writes", async () => {
    state.portfolioCompany.push({ id: "L1", name: "Zeta Labs", country: "Ghana", companyId: null });
    const p = await planCompany(ADMIN, newCo({ ledgerId: "L1" }));
    expect(p.plan).toMatchObject({ willCreate: true, geography: "Ghana", ledger: { id: "L1", willLink: true } });
    const gone = await planCompany(ADMIN, newCo({ ledgerId: "zzz" }));
    expect(gone.plan.ledger).toMatchObject({ willLink: false, reason: "gone" });
    expect(gone.plan.willCreate).toBe(false);
    state.portfolioCompany[0].companyId = "co1";
    expect((await planCompany(ADMIN, newCo({ ledgerId: "L1" }))).plan.ledger).toMatchObject({ willLink: false, reason: "linked" });
    expect(writeCalls()).toEqual([]);
  });
  it("createUnclaimedCompany works inside a caller's transaction and rolls back with it", async () => {
    await expect(
      h.holder.db.$transaction(async (tx: any) => {
        await createUnclaimedCompany(tx, ADMIN, newCo());
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(state.company.map((c) => c.id)).toEqual(["co1"]);
  });
});

describe("fileEmailUpdate", () => {
  it("files a SENT update dated to the email, escaped, with provenance and no email", async () => {
    const r = await fileEmailUpdate(ADMIN, fileInput(), VIA);
    expect(r).toMatchObject({ ok: true, value: { duplicate: false, metricsWritten: 0, companyCreated: false } });
    const u = state.update[0];
    expect(u).toMatchObject({
      companyId: "co1",
      createdById: "admin1",
      status: "SENT",
      source: "EMAIL_VIA_MARGE",
      sourceKey: "slack:C123:1700000000.0001",
      period: "2025-Q3",
    });
    expect(u.sentAt.toISOString()).toBe("2025-10-03T12:00:00.000Z");
    expect(u.createdAt.toISOString()).toBe("2025-10-03T12:00:00.000Z"); // JC-FU-C
    expect(u.filedAt).toBeInstanceOf(Date);
    expect(u.body).toBe("<p>Hello &lt;b&gt;team&lt;/b&gt;</p><p>Second paragraph</p>");
    expect(u.sourceRef).toMatchObject({ kind: "slack_email", fromDomain: "zeta.example" });
    expect(JSON.stringify(u.sourceRef)).not.toContain("@");
    expect(h.audit.mock.calls.map((c) => c[1])).toEqual(["UPDATE_CREATED"]);
    expect(h.audit.mock.calls[0][2].metadata).toEqual({ companyId: "co1", updateId: u.id, source: "EMAIL_VIA_MARGE", period: "2025-Q3", metricCount: 0, definitionsCreated: 0, keptFounder: 0, via: "marge", margeActionId: "act1" });
    expect(h.emailCalls).not.toHaveBeenCalled();
  });
  it("a repeated sourceKey or createKey returns the update and writes nothing, creating no company", async () => {
    await fileEmailUpdate(ADMIN, fileInput(), VIA);
    h.audit.mockClear();
    const n = state.update.length;
    const bySource = await fileEmailUpdate(ADMIN, fileInput({ idempotencyKey: "other_key_01", companyId: undefined, newCompany: { name: "Brand New Co", idempotencyKey: "pc_new_00001" } }), VIA);
    expect(bySource).toMatchObject({ ok: true, value: { duplicate: true, companyCreated: false } });
    const byKey = await fileEmailUpdate(ADMIN, fileInput({ source: { ...source, messageTs: "1700000000.9999" } }), VIA);
    expect(byKey).toMatchObject({ ok: true, value: { duplicate: true } });
    expect(state.update.length).toBe(n);
    expect(state.company.length).toBe(1);
    expect(h.audit).not.toHaveBeenCalled();
  });
  it("creates definitions (case-insensitive name match first) and Marge-sourced values", async () => {
    state.metricDefinition.push({ id: "d1", companyId: "co1", name: "MRR", unit: "USD" });
    const r = await fileEmailUpdate(
      ADMIN,
      fileInput({
        metrics: [
          { name: "mrr", value: 42000, date: "2025-09-30", quote: "MRR was 42k" },
          { name: "Active merchants", unit: "count", value: 1240, date: "2025-09-30", quote: "1,240 merchants" },
          { definitionId: "d1", value: 43000, date: "2025-09-30", quote: "again" },
        ],
      }),
      VIA
    );
    expect(r).toMatchObject({ ok: true, value: { metricsWritten: 3, definitionsCreated: 1 } });
    expect(state.metricDefinition.map((d) => d.name)).toEqual(["MRR", "Active merchants"]);
    expect(state.metricValue.map((v) => [v.metricDefinitionId === "d1", v.via, v.enteredById, v.updateId === state.update[0].id])).toEqual([
      [true, "marge", "admin1", true],
      [false, "marge", "admin1", true],
      [true, "marge", "admin1", true],
    ]);
    expect(h.audit.mock.calls.map((c) => c[1])).toEqual(["METRIC_DEFINITION_CREATED", "UPDATE_CREATED"]);
  });
  it("never writes over a founder or admin figure in the period (kept_founder), the rest still apply", async () => {
    state.metricDefinition.push({ id: "d1", companyId: "co1", name: "Churn", unit: "%" }, { id: "d2", companyId: "co1", name: "MRR", unit: "USD" });
    state.update.push({ id: "fu1", companyId: "co1", createdById: "f1", source: "FOUNDER", period: "2025-Q3", title: "Mine", body: "<p>x</p>", sentAt: new Date("2025-10-01") });
    state.metricValue.push({ id: "v1", metricDefinitionId: "d1", value: 2.1, date: new Date("2025-09-30"), updateId: "fu1", via: null, enteredById: null });
    const input = fileInput({
      metrics: [
        { definitionId: "d1", value: 2.3, date: "2025-09-30", quote: "churn 2.3" },
        { definitionId: "d2", value: 5, date: "2025-09-30", quote: "mrr 5" },
      ],
    });
    const plan = await planFileUpdate(ADMIN, input);
    expect((plan as any).value.metricChecks).toEqual([
      { name: "Churn", action: "kept_founder", existing: { valueId: "v1", value: 2.1, date: "2025-09-30", source: "founder" } },
      { name: "MRR", action: "new" },
    ]);
    expect((plan as any).value.samePeriod).toHaveLength(1);
    const r = await fileEmailUpdate(ADMIN, input, VIA);
    expect(r).toMatchObject({ ok: true, value: { metricsWritten: 1, keptFounder: 1 } });
    expect(state.metricValue.filter((v) => v.metricDefinitionId === "d1")).toHaveLength(1);
    expect(state.metricValue.find((v) => v.id === "v1")!.value).toBe(2.1);
  });
  it("treats a web value entered by an admin as protected too", async () => {
    state.metricDefinition.push({ id: "d1", companyId: "co1", name: "GMV", unit: null });
    state.metricValue.push({ id: "v9", metricDefinitionId: "d1", value: 9, date: new Date("2025-08-31"), updateId: null, via: null, enteredById: "admin1" });
    const p = await planFileUpdate(ADMIN, fileInput({ metrics: [{ definitionId: "d1", value: 10, date: "2025-09-30", quote: "q" }] }));
    expect((p as any).value.metricChecks[0]).toMatchObject({ action: "kept_founder", existing: { source: "admin" } });
  });
  it("replaces a Marge value in place; refuses (whole call) to replace a founder value, at plan and at apply", async () => {
    state.metricDefinition.push({ id: "d1", companyId: "co1", name: "GMV", unit: null });
    state.metricValue.push(
      { id: "vm", metricDefinitionId: "d1", value: 1700000, date: new Date("2025-07-31"), updateId: null, via: "marge", enteredById: "admin1" },
      { id: "vf", metricDefinitionId: "d1", value: 5, date: new Date("2025-08-31"), updateId: null, via: null, enteredById: null }
    );
    const refused = fileInput({ metrics: [{ definitionId: "d1", value: 1, date: "2025-09-30", quote: "q", replaceValueId: "vf" }] });
    expect(await planFileUpdate(ADMIN, refused)).toMatchObject({ ok: false, error: "That figure was entered in Molly, so I left it as it is." });
    expect(await fileEmailUpdate(ADMIN, refused, VIA)).toMatchObject({ ok: false, error: "That figure was entered in Molly, so I left it as it is." });
    expect(state.update).toHaveLength(0);

    const input = fileInput({ metrics: [{ definitionId: "d1", value: 1900000, date: "2025-09-30", quote: "q", replaceValueId: "vm" }] });
    // vf (founder) sits in the window too, but replaceValueId names a Marge value, so the replace goes ahead.
    const r = await fileEmailUpdate(ADMIN, input, VIA);
    expect(r).toMatchObject({ ok: true, value: { metricsWritten: 1 } });
    const vm = state.metricValue.find((v) => v.id === "vm")!;
    expect(vm.value).toBe(1900000);
    expect(vm.updateId).toBe(state.update[0].id);
    const set = h.audit.mock.calls.find((c) => c[1] === "METRIC_VALUE_SET")!;
    expect(set[2].metadata.replaced).toEqual({ value: 1700000, date: "2025-07-31", enteredById: "admin1" });
  });
  it("unknown replace id and another company's definition are refused", async () => {
    state.company.push({ id: "co2", name: "Other Org", aliases: [] });
    state.metricDefinition.push({ id: "dA", companyId: "co1", name: "A", unit: null }, { id: "dB", companyId: "co2", name: "B", unit: null });
    expect(await fileEmailUpdate(ADMIN, fileInput({ metrics: [{ definitionId: "dA", value: 1, date: "2025-09-30", quote: "q", replaceValueId: "ghost" }] }), VIA)).toMatchObject({ ok: false, error: "No figure with that id." });
    expect(await fileEmailUpdate(ADMIN, fileInput({ metrics: [{ definitionId: "dB", value: 1, date: "2025-09-30", quote: "q" }] }), VIA)).toMatchObject({ ok: false, error: "That metric belongs to another company." });
    expect(state.update).toHaveLength(0);
  });
  it("newCompany is atomic: a failing metric leaves no company, no link, no update", async () => {
    state.portfolioCompany.push({ id: "L1", name: "Zeta Labs", country: "Kenya", companyId: null });
    // force a failure after the company and update are written: the metric write throws
    const real = h.holder.db.metricValue.create;
    h.holder.db.metricValue.create = async () => {
      throw new Error("disk full");
    };
    await expect(
      fileEmailUpdate(
        ADMIN,
        fileInput({ companyId: undefined, newCompany: { name: "Zeta Labs", ledgerId: "L1", idempotencyKey: "pc_L1_00002" }, idempotencyKey: "upd_key_0002", source: { ...source, messageTs: "17.2" }, metrics: [{ name: "MRR", value: 1, date: "2025-09-30", quote: "q" }] }),
        VIA
      )
    ).rejects.toThrow("disk full");
    h.holder.db.metricValue.create = real;
    expect(state.company.map((c) => c.id)).toEqual(["co1"]);
    expect(state.portfolioCompany[0].companyId).toBeNull();
    expect(state.update).toHaveLength(0);
    expect(state.metricDefinition).toHaveLength(0);
  });
  it("update_create with newCompany files the update on the new company in one go", async () => {
    state.portfolioCompany.push({ id: "L1", name: "Zeta Labs", country: "Kenya", companyId: null });
    const r = await fileEmailUpdate(
      ADMIN,
      fileInput({ companyId: undefined, newCompany: { name: "Zeta Labs", ledgerId: "L1", idempotencyKey: "pc_L1_00001" }, metrics: [{ name: "MRR", unit: "USD", value: 5, date: "2025-09-30", quote: "q" }] }),
      VIA
    );
    expect(r).toMatchObject({ ok: true, value: { companyCreated: true, linkedLedgerId: "L1", metricsWritten: 1, definitionsCreated: 1 } });
    expect(state.update[0].companyId).toBe(state.company.find((c) => c.name === "Zeta Labs")!.id);
    expect(h.audit.mock.calls.map((c) => c[1])).toEqual(["COMPANY_CREATED", "PORTCO_LINKED", "METRIC_DEFINITION_CREATED", "UPDATE_CREATED"]);
    expect(h.audit.mock.calls[0][2].metadata.withUpdate).toBe(true);
    expect(h.emailCalls).not.toHaveBeenCalled();
  });
  it("a plan never writes, including for a duplicate and for newCompany", async () => {
    await planFileUpdate(ADMIN, fileInput({ companyId: undefined, newCompany: { name: "Brand New Co", idempotencyKey: "pc_new_00001" } }));
    await planFileUpdate(ADMIN, fileInput());
    expect(writeCalls()).toEqual([]);
  });
  it("audit metadata never carries titles, bodies, quotes or names", async () => {
    await fileEmailUpdate(ADMIN, fileInput({ metrics: [{ name: "MRR", value: 1, date: "2025-09-30", quote: "a founder quote" }] }), VIA);
    const blob = JSON.stringify(h.audit.mock.calls);
    expect(blob).not.toContain("a founder quote");
    expect(blob).not.toContain("Hello");
    expect(blob).not.toContain("Q3 update");
    expect(blob).not.toContain("Pat Founder");
  });
});

describe("setMetricValue", () => {
  const set = (over: Record<string, unknown> = {}) => {
    const v = validateMetricValueSet({ companyId: "co1", name: "MRR", unit: "USD", value: 10, date: "2025-09-30", ...over });
    if (!v.ok) throw new Error(v.error);
    return v.value;
  };
  it("creates the definition and the value; a founder figure in the same month is kept", async () => {
    const r = await setMetricValue(ADMIN, set({ quote: "q" }), VIA);
    expect(r).toMatchObject({ ok: true, value: { keptFounder: false, definitionCreated: true } });
    expect(state.metricValue[0]).toMatchObject({ via: "marge", enteredById: "admin1", quote: "q" });
    state.metricValue.push({ id: "vf", metricDefinitionId: state.metricDefinition[0].id, value: 7, date: new Date("2025-09-15"), via: null, enteredById: null, updateId: null });
    const p = await planMetricValue(set({ value: 11 }));
    expect((p as any).value.decision.action).toBe("kept_founder");
    expect((p as any).value.before).toMatchObject({ source: "founder", value: 7 });
    state.metricValue.shift(); // remove the Marge value; the founder figure stays
    const kept = await setMetricValue(ADMIN, set({ value: 11 }), VIA);
    expect(kept).toMatchObject({ ok: true, value: { keptFounder: true, valueId: "vf" } });
    expect(state.metricValue).toHaveLength(1);
    expect(state.metricValue[0].value).toBe(7);
  });
  it("replaces a Marge value", async () => {
    await setMetricValue(ADMIN, set(), VIA);
    const id = state.metricValue[0].id;
    h.audit.mockClear();
    const r = await setMetricValue(ADMIN, set({ name: undefined, definitionId: state.metricDefinition[0].id, value: 12, replaceValueId: id }), VIA);
    expect(r).toMatchObject({ ok: true, value: { replaced: id } });
    expect(state.metricValue[0].value).toBe(12);
    expect(h.audit.mock.calls[0][2].metadata.replaced).toMatchObject({ valueId: id, value: 10 });
  });
});

describe("removeEmailUpdate (Q142 A)", () => {
  it("removes an email-filed update and only the Marge figures, audited", async () => {
    await fileEmailUpdate(ADMIN, fileInput({ metrics: [{ name: "MRR", value: 1, date: "2025-09-30", quote: "q" }] }), VIA);
    const id = state.update[0].id;
    state.metricValue.push({ id: "keep", metricDefinitionId: state.metricDefinition[0].id, value: 3, date: new Date("2025-06-30"), updateId: id, via: null, enteredById: null });
    h.audit.mockClear();
    const r = await removeEmailUpdate(ADMIN, id);
    expect(r).toMatchObject({ ok: true, value: { removed: true, metricValuesRemoved: 1 } });
    expect(state.update).toHaveLength(0);
    expect(state.metricValue.map((v) => v.id)).toEqual(["keep"]);
    expect(h.audit.mock.calls[0]).toEqual([ADMIN, "UPDATE_REMOVED", { targetType: "Update", targetId: id, metadata: { companyId: "co1", updateId: id, metricValuesRemoved: 1 } }]);
  });
  it("refuses a founder's update and an unknown id", async () => {
    state.update.push({ id: "fu1", companyId: "co1", createdById: "f1", source: "FOUNDER", status: "SENT" });
    expect(await removeEmailUpdate(ADMIN, "fu1")).toMatchObject({ ok: false, status: 403 });
    expect(await removeEmailUpdate(ADMIN, "nope")).toMatchObject({ ok: false, status: 404 });
    expect(state.update).toHaveLength(1);
  });
});
