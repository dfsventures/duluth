import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 30, WS73 — POST /api/admin/broadcasts/[id]/publish and
// /api/admin/broadcasts/[id]/retry. Mocks @/lib/auth-guard, @/lib/audit,
// @/lib/email, and @/lib/db (including a $transaction that invokes the
// callback with a tx stub), then imports the real routes. Synthetic data
// only (JC-BC-J).

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const mockSendCompanyBroadcastEmails = vi.fn();
vi.mock("@/lib/email", () => ({
  sendCompanyBroadcastEmails: (...args: unknown[]) => mockSendCompanyBroadcastEmails(...args),
}));

const mockBroadcastFindUnique = vi.fn();
const mockBroadcastUpdate = vi.fn();
const mockContactFindMany = vi.fn();
const mockRecipientCreateMany = vi.fn();
const mockRecipientUpdateMany = vi.fn();
const mockRecipientFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    companyBroadcast: {
      findUnique: (...args: unknown[]) => mockBroadcastFindUnique(...args),
      update: (...args: unknown[]) => mockBroadcastUpdate(...args),
    },
    portfolioCompanyContact: { findMany: (...args: unknown[]) => mockContactFindMany(...args) },
    companyBroadcastRecipient: {
      createMany: (...args: unknown[]) => mockRecipientCreateMany(...args),
      updateMany: (...args: unknown[]) => mockRecipientUpdateMany(...args),
      findMany: (...args: unknown[]) => mockRecipientFindMany(...args),
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        companyBroadcastRecipient: { createMany: (...args: unknown[]) => mockRecipientCreateMany(...args) },
        companyBroadcast: { update: (...args: unknown[]) => mockBroadcastUpdate(...args) },
      }),
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { POST as publishPOST } from "@/app/api/admin/broadcasts/[id]/publish/route";
import { POST as retryPOST } from "@/app/api/admin/broadcasts/[id]/retry/route";

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockLogAdminAction = vi.mocked(logAdminAction);

const ADMIN = { id: "admin-1", email: "admin@dfs.vc" };

function params(id = "broadcast-1") {
  return { params: Promise.resolve({ id }) };
}

function req() {
  return new Request("https://molly.dfslab.net/api/admin/broadcasts/broadcast-1/publish", { method: "POST" });
}

const draftBroadcast = {
  id: "broadcast-1",
  subject: "Hello portfolio",
  body: "<p>Some news</p>",
  status: "DRAFT",
  targets: [
    { portfolioCompanyId: "pc-1", portfolioCompany: { id: "pc-1", name: "Acme" } },
    { portfolioCompanyId: "pc-2", portfolioCompany: { id: "pc-2", name: "Northwind" } },
  ],
};

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockLogAdminAction.mockReset();
  mockSendCompanyBroadcastEmails.mockReset();
  mockBroadcastFindUnique.mockReset();
  mockBroadcastUpdate.mockReset();
  mockContactFindMany.mockReset();
  mockRecipientCreateMany.mockReset();
  mockRecipientUpdateMany.mockReset();
  mockRecipientFindMany.mockReset();

  mockRequireAdmin.mockResolvedValue({ user: ADMIN, error: null } as any);
  mockBroadcastFindUnique.mockResolvedValue(draftBroadcast);
  mockBroadcastUpdate.mockResolvedValue({ ...draftBroadcast, status: "PUBLISHED", publishedAt: new Date() });
  mockRecipientCreateMany.mockResolvedValue({ count: 0 });
  mockRecipientUpdateMany.mockResolvedValue({ count: 0 });
});

describe("POST /api/admin/broadcasts/[id]/publish", () => {
  it("produces exactly one recipient and one message for an address at two targeted companies (D7)", async () => {
    mockContactFindMany.mockResolvedValue([
      { id: "c-1", email: "founder@example.com", name: "Jane", portfolioCompany: { id: "pc-1", name: "Acme" } },
      { id: "c-2", email: "founder@example.com", name: "Jane", portfolioCompany: { id: "pc-2", name: "Northwind" } },
    ]);
    mockSendCompanyBroadcastEmails.mockResolvedValue([{ email: "founder@example.com", ok: true }]);

    const res = await publishPOST(req(), params());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockSendCompanyBroadcastEmails).toHaveBeenCalledTimes(1);
    expect(mockSendCompanyBroadcastEmails.mock.calls[0][0]).toHaveLength(1);
    expect(data.sendResult).toEqual({ recipientCount: 1, sent: 1, failed: 0 });
  });

  it("marks only the failed recipient row FAILED and still returns 200 PUBLISHED (F12 lesson)", async () => {
    mockContactFindMany.mockResolvedValue([
      { id: "c-1", email: "good@example.com", name: "Jane", portfolioCompany: { id: "pc-1", name: "Acme" } },
      { id: "c-2", email: "bad@example.com", name: "Bob", portfolioCompany: { id: "pc-2", name: "Northwind" } },
    ]);
    mockSendCompanyBroadcastEmails.mockResolvedValue([
      { email: "good@example.com", ok: true },
      { email: "bad@example.com", ok: false, error: "bounced" },
    ]);

    const res = await publishPOST(req(), params());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockBroadcastUpdate).toHaveBeenCalled();
    expect(data.sendResult).toEqual({ recipientCount: 2, sent: 1, failed: 1 });
    const failedCall = mockRecipientUpdateMany.mock.calls.find((c) => c[0].data.status === "FAILED");
    expect(failedCall![0].where.email.in).toEqual(["bad@example.com"]);
  });

  it("returns 400 with no status change and no send when zero contacts across all targets", async () => {
    mockContactFindMany.mockResolvedValue([]);

    const res = await publishPOST(req(), params());
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/Add contacts on the company's page first/);
    expect(mockBroadcastUpdate).not.toHaveBeenCalled();
    expect(mockSendCompanyBroadcastEmails).not.toHaveBeenCalled();
  });

  it("refuses to publish an already-published broadcast, with no send call", async () => {
    mockBroadcastFindUnique.mockResolvedValue({ ...draftBroadcast, status: "PUBLISHED" });

    const res = await publishPOST(req(), params());
    expect(res.status).toBe(400);
    expect(mockSendCompanyBroadcastEmails).not.toHaveBeenCalled();
  });

  it("400s on empty body with no send call", async () => {
    mockBroadcastFindUnique.mockResolvedValue({ ...draftBroadcast, body: "" });
    const res = await publishPOST(req(), params());
    expect(res.status).toBe(400);
    expect(mockSendCompanyBroadcastEmails).not.toHaveBeenCalled();
  });

  it("400s on zero targets with no send call", async () => {
    mockBroadcastFindUnique.mockResolvedValue({ ...draftBroadcast, targets: [] });
    const res = await publishPOST(req(), params());
    expect(res.status).toBe(400);
    expect(mockSendCompanyBroadcastEmails).not.toHaveBeenCalled();
  });

  it("writes a BROADCAST_PUBLISHED audit row carrying companyCount, recipientCount, sent, failed", async () => {
    mockContactFindMany.mockResolvedValue([
      { id: "c-1", email: "a@example.com", name: null, portfolioCompany: { id: "pc-1", name: "Acme" } },
    ]);
    mockSendCompanyBroadcastEmails.mockResolvedValue([{ email: "a@example.com", ok: true }]);

    await publishPOST(req(), params());

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      ADMIN,
      "BROADCAST_PUBLISHED",
      expect.objectContaining({
        metadata: expect.objectContaining({ companyCount: 2, recipientCount: 1, sent: 1, failed: 0 }),
      })
    );
  });

  it("never reads or mocks userCompanyMembership anywhere (D4's single path stays single)", async () => {
    mockContactFindMany.mockResolvedValue([
      { id: "c-1", email: "a@example.com", name: null, portfolioCompany: { id: "pc-1", name: "Acme" } },
    ]);
    mockSendCompanyBroadcastEmails.mockResolvedValue([{ email: "a@example.com", ok: true }]);
    await publishPOST(req(), params());
    // Structural guard: the mocked db module never even defines
    // userCompanyMembership, so any accidental read would throw.
  });
});

describe("POST /api/admin/broadcasts/[id]/retry", () => {
  const publishedBroadcast = { ...draftBroadcast, status: "PUBLISHED" };

  it("re-sends only PENDING/FAILED rows and never an already-SENT one", async () => {
    mockBroadcastFindUnique.mockResolvedValue(publishedBroadcast);
    mockRecipientFindMany.mockResolvedValue([
      { email: "pending@example.com", name: null, status: "PENDING" },
      { email: "failed@example.com", name: null, status: "FAILED" },
    ]);
    mockSendCompanyBroadcastEmails.mockResolvedValue([
      { email: "pending@example.com", ok: true },
      { email: "failed@example.com", ok: true },
    ]);

    const res = await retryPOST(req(), params());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockRecipientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: ["PENDING", "FAILED"] } }) })
    );
    expect(data).toEqual({ ok: true, attempted: 2, sent: 2, failed: 0 });
  });

  it("400s when the broadcast is not PUBLISHED", async () => {
    mockBroadcastFindUnique.mockResolvedValue(draftBroadcast); // DRAFT
    const res = await retryPOST(req(), params());
    expect(res.status).toBe(400);
    expect(mockSendCompanyBroadcastEmails).not.toHaveBeenCalled();
  });
});
