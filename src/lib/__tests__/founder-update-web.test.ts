import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 45, WS151 — the web side of companies with no founder and email-filed
// updates: Remind refuses with nobody to send to, the linkable list never
// offers an admin's address as a contact, admins can remove an email-filed
// update, founders cannot, and non-admins never see sourceRef. Mocked db/auth,
// synthetic data only.

vi.mock("@/lib/auth-guard", () => ({
  requireAdmin: vi.fn(),
  requireCompanyAccess: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));
const sendReminder = vi.fn();
vi.mock("@/lib/email", () => ({
  sendUpdateReminderEmail: (...a: unknown[]) => sendReminder(...a),
  sendUpdatePublishedEmail: vi.fn(),
}));
vi.mock("@/lib/publish-update", () => ({ publishUpdate: vi.fn() }));
const removeEmailUpdate = vi.fn();
vi.mock("@/lib/founder-update-actions", () => ({
  removeEmailUpdate: (...a: unknown[]) => removeEmailUpdate(...a),
}));

const companyFindUnique = vi.fn();
const companyFindMany = vi.fn();
const companyUpdate = vi.fn();
const updateFindUnique = vi.fn();
const updateFindMany = vi.fn();
const updateDelete = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    company: {
      findUnique: (...a: unknown[]) => companyFindUnique(...a),
      findMany: (...a: unknown[]) => companyFindMany(...a),
      update: (...a: unknown[]) => companyUpdate(...a),
    },
    update: {
      findUnique: (...a: unknown[]) => updateFindUnique(...a),
      findMany: (...a: unknown[]) => updateFindMany(...a),
      delete: (...a: unknown[]) => updateDelete(...a),
    },
  },
}));

import { requireAdmin, requireCompanyAccess } from "@/lib/auth-guard";
import { POST as remind } from "@/app/api/companies/[id]/remind/route";
import { GET as listAdminCompanies } from "@/app/api/admin/companies/route";
import { DELETE as deleteUpdate } from "@/app/api/updates/[id]/route";
import { GET as listUpdates } from "@/app/api/companies/[id]/updates/route";

const admin = { id: "admin1", email: "admin@example.com", roles: ["ADMIN"] };
const founder = { id: "f1", email: "f@example.com", roles: ["FOUNDER"] };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ user: admin, error: null } as never);
  vi.mocked(requireCompanyAccess).mockResolvedValue({ user: admin, error: null } as never);
});

describe("POST /api/companies/[id]/remind (Q141 A)", () => {
  it("409s and stamps nothing when the company has no OWNER/MEMBER recipients", async () => {
    companyFindUnique.mockResolvedValue({ id: "c1", name: "Acme", createdAt: new Date(), updates: [], memberships: [] });
    const res = await remind(new Request("http://x", { method: "POST" }), params("c1"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Nobody to remind: this company has no founder in Molly.");
    expect(companyUpdate).not.toHaveBeenCalled();
    expect(sendReminder).not.toHaveBeenCalled();
  });

  it("is unchanged for a company with a member", async () => {
    companyFindUnique.mockResolvedValue({
      id: "c1",
      name: "Acme",
      createdAt: new Date(),
      updates: [],
      memberships: [{ user: { email: "f@example.com", name: "F" } }],
    });
    companyUpdate.mockResolvedValue({});
    const res = await remind(new Request("http://x", { method: "POST" }), params("c1"));
    expect(res.status).toBe(200);
    expect(companyUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/admin/companies?linkable=1 (F149)", () => {
  it("returns no owner address when an admin created the company, and keeps it for a founder", async () => {
    companyFindMany.mockResolvedValue([
      { id: "a", name: "A", createdAt: new Date(), portfolioCompany: null, createdBy: { email: "admin@example.com", name: "Ad", roles: ["ADMIN"] } },
      { id: "b", name: "B", createdAt: new Date(), portfolioCompany: null, createdBy: { email: "f@example.com", name: "Fo", roles: ["FOUNDER"] } },
    ]);
    const res = await listAdminCompanies(new Request("http://x/api/admin/companies?linkable=1"));
    const body = await res.json();
    expect(body[0]).toMatchObject({ id: "a", ownerEmail: null, ownerName: null });
    expect(body[1]).toMatchObject({ id: "b", ownerEmail: "f@example.com", ownerName: "Fo" });
  });
});

describe("DELETE /api/updates/[id] (Q142 A)", () => {
  it("lets an admin remove a SENT update filed from email", async () => {
    updateFindUnique.mockResolvedValue({ companyId: "c1", status: "SENT", source: "EMAIL_VIA_MARGE" });
    removeEmailUpdate.mockResolvedValue({ ok: true, value: { removed: true } });
    const res = await deleteUpdate(new Request("http://x", { method: "DELETE" }), params("u1"));
    expect(res.status).toBe(204);
    expect(removeEmailUpdate).toHaveBeenCalledWith(admin, "u1");
    expect(updateDelete).not.toHaveBeenCalled();
  });

  it("still refuses a founder on an email-filed update, and an admin on a founder's sent update", async () => {
    updateFindUnique.mockResolvedValue({ companyId: "c1", status: "SENT", source: "EMAIL_VIA_MARGE" });
    vi.mocked(requireCompanyAccess).mockResolvedValue({ user: founder, error: null } as never);
    let res = await deleteUpdate(new Request("http://x", { method: "DELETE" }), params("u1"));
    expect(res.status).toBe(403);

    updateFindUnique.mockResolvedValue({ companyId: "c1", status: "SENT", source: "FOUNDER" });
    vi.mocked(requireCompanyAccess).mockResolvedValue({ user: admin, error: null } as never);
    res = await deleteUpdate(new Request("http://x", { method: "DELETE" }), params("u2"));
    expect(res.status).toBe(403);
    expect(removeEmailUpdate).not.toHaveBeenCalled();
    expect(updateDelete).not.toHaveBeenCalled();
  });
});

describe("GET /api/companies/[id]/updates", () => {
  const row = { id: "u1", title: "t", source: "EMAIL_VIA_MARGE", sourceRef: { permalink: "https://example.com/p" }, filedAt: new Date() };
  it("omits sourceRef and filedAt for a founder, keeps them for an admin", async () => {
    updateFindMany.mockResolvedValue([row]);
    vi.mocked(requireCompanyAccess).mockResolvedValue({ user: founder, error: null } as never);
    let body = await (await listUpdates(new Request("http://x"), params("c1"))).json();
    expect(body[0]).not.toHaveProperty("sourceRef");
    expect(body[0]).not.toHaveProperty("filedAt");
    expect(body[0].source).toBe("EMAIL_VIA_MARGE");

    vi.mocked(requireCompanyAccess).mockResolvedValue({ user: admin, error: null } as never);
    body = await (await listUpdates(new Request("http://x"), params("c1"))).json();
    expect(body[0]).toHaveProperty("sourceRef");
  });
});
