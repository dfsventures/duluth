import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 39 (WS119): shared broadcast draft writes. F121 (publish race), F122 (unknown company
// id), and the `via` audit marker used by the Marge tools.

vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const m = vi.hoisted(() => ({
  companyBroadcast: {
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  companyBroadcastTarget: { createMany: vi.fn(), deleteMany: vi.fn() },
  portfolioCompany: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({
  db: { ...m, $transaction: (fn: (t: typeof m) => unknown) => fn(m) },
}));

import { logAdminAction } from "@/lib/audit";
import { createBroadcastDraft, updateBroadcastDraft } from "@/lib/broadcast-drafts";

const ACTOR = { id: "a1", email: "admin@example.com" };
const draft = { id: "b1", subject: "Hello", body: "", status: "DRAFT" };

beforeEach(() => {
  vi.clearAllMocks();
  m.companyBroadcast.create.mockResolvedValue({ ...draft });
  m.companyBroadcast.findUnique.mockResolvedValue({ ...draft });
  m.companyBroadcast.updateMany.mockResolvedValue({ count: 1 });
  m.portfolioCompany.findMany.mockResolvedValue([{ id: "p1" }]);
});

describe("createBroadcastDraft", () => {
  it("F122: an unknown company id is a 400, nothing is created", async () => {
    m.portfolioCompany.findMany.mockResolvedValue([]);
    const r = await createBroadcastDraft(ACTOR, { subject: "Hi", portfolioCompanyIds: ["nope"] });
    expect(r).toEqual({ ok: false, status: 400, error: "One or more selected companies could not be found." });
    expect(m.companyBroadcast.create).not.toHaveBeenCalled();
  });

  it("F122: a non-array or non-string entries are 400", async () => {
    const a = await createBroadcastDraft(ACTOR, { subject: "Hi", portfolioCompanyIds: "p1" });
    expect(a).toMatchObject({ ok: false, status: 400, error: "portfolioCompanyIds must be an array." });
    const b = await createBroadcastDraft(ACTOR, { subject: "Hi", portfolioCompanyIds: [1, 2] });
    expect(b).toMatchObject({ ok: false, status: 400, error: "One or more selected companies could not be found." });
    expect(m.companyBroadcast.create).not.toHaveBeenCalled();
  });

  it("creates a DRAFT with an empty body by default and today's audit metadata", async () => {
    const r = await createBroadcastDraft(ACTOR, { subject: " Hi ", portfolioCompanyIds: ["p1"] });
    expect(r.ok).toBe(true);
    expect(m.companyBroadcast.create).toHaveBeenCalledWith({
      data: { subject: "Hi", body: "", status: "DRAFT", createdById: "a1" },
    });
    expect(logAdminAction).toHaveBeenCalledWith(ACTOR, "BROADCAST_CREATED", {
      targetType: "CompanyBroadcast",
      targetId: "b1",
      metadata: { subject: "Hi", companyCount: 1 },
    });
  });

  it("accepts a body for the Marge path and records via", async () => {
    await createBroadcastDraft(ACTOR, { subject: "Hi", body: "<p>x</p>" }, { via: "marge", margeActionId: "act1" });
    expect(m.companyBroadcast.create.mock.calls[0][0].data.body).toBe("<p>x</p>");
    expect(logAdminAction).toHaveBeenCalledWith(
      ACTOR,
      "BROADCAST_CREATED",
      expect.objectContaining({ metadata: { subject: "Hi", companyCount: 0, via: "marge", margeActionId: "act1" } })
    );
  });

  it("requires a subject of at most 200 characters", async () => {
    expect(await createBroadcastDraft(ACTOR, { subject: "  " })).toMatchObject({ ok: false, status: 400 });
    expect(await createBroadcastDraft(ACTOR, { subject: "x".repeat(201) })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("updateBroadcastDraft", () => {
  it("F121: a publish landing after the pre-check loses; targets are untouched", async () => {
    m.companyBroadcast.updateMany.mockResolvedValue({ count: 0 }); // status flipped to PUBLISHED
    const r = await updateBroadcastDraft(ACTOR, "b1", { subject: "New", portfolioCompanyIds: ["p1"] });
    expect(r).toEqual({
      ok: false,
      status: 400,
      error: "Published broadcasts can't be edited. Duplicate it as a draft instead.",
    });
    expect(m.companyBroadcastTarget.deleteMany).not.toHaveBeenCalled();
    expect(m.companyBroadcastTarget.createMany).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
    expect(m.companyBroadcast.updateMany.mock.calls[0][0].where).toEqual({ id: "b1", status: "DRAFT" });
  });

  it("refuses an already published broadcast up front, same message", async () => {
    m.companyBroadcast.findUnique.mockResolvedValue({ ...draft, status: "PUBLISHED" });
    const r = await updateBroadcastDraft(ACTOR, "b1", { subject: "New" });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(m.companyBroadcast.updateMany).not.toHaveBeenCalled();
  });

  it("404 for a missing broadcast", async () => {
    m.companyBroadcast.findUnique.mockResolvedValue(null);
    expect(await updateBroadcastDraft(ACTOR, "x", { subject: "A" })).toMatchObject({ ok: false, status: 404 });
  });

  it("validates company ids", async () => {
    m.portfolioCompany.findMany.mockResolvedValue([]);
    const r = await updateBroadcastDraft(ACTOR, "b1", { portfolioCompanyIds: ["nope"] });
    expect(r).toMatchObject({ ok: false, status: 400, error: "One or more selected companies could not be found." });
    const s = await updateBroadcastDraft(ACTOR, "b1", { portfolioCompanyIds: "p1" });
    expect(s).toMatchObject({ ok: false, status: 400, error: "portfolioCompanyIds must be an array." });
  });

  it("replaces targets after the conditional update", async () => {
    const r = await updateBroadcastDraft(ACTOR, "b1", { portfolioCompanyIds: ["p1"] });
    expect(r.ok).toBe(true);
    expect(m.companyBroadcastTarget.deleteMany).toHaveBeenCalledWith({ where: { broadcastId: "b1" } });
    expect(m.companyBroadcastTarget.createMany).toHaveBeenCalled();
  });

  it("audit: no metadata without via (as today), via marker with it", async () => {
    await updateBroadcastDraft(ACTOR, "b1", { subject: "A" });
    expect(logAdminAction).toHaveBeenLastCalledWith(ACTOR, "BROADCAST_UPDATED", {
      targetType: "CompanyBroadcast",
      targetId: "b1",
    });
    await updateBroadcastDraft(ACTOR, "b1", { subject: "A" }, { via: "marge", margeActionId: "act1" });
    expect(logAdminAction).toHaveBeenLastCalledWith(ACTOR, "BROADCAST_UPDATED", {
      targetType: "CompanyBroadcast",
      targetId: "b1",
      metadata: { via: "marge", margeActionId: "act1" },
    });
  });

  it("passes the body through untouched (F123: editor path unchanged)", async () => {
    await updateBroadcastDraft(ACTOR, "b1", { body: "<p>hi</p>" });
    expect(m.companyBroadcast.updateMany.mock.calls[0][0].data.body).toBe("<p>hi</p>");
  });
});
