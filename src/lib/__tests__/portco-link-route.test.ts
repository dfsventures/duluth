import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 31, WS76.4 (F66) — PATCH /api/admin/portfolio-companies/[id]'s
// hardened companyId branch. Mocks @/lib/auth-guard, @/lib/audit, and
// @/lib/db, then imports the real route (the broadcast-publish.test.ts
// pattern). Synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const mockPortcoFindUnique = vi.fn();
const mockPortcoUpdate = vi.fn();
const mockCompanyFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    portfolioCompany: {
      findUnique: (...args: unknown[]) => mockPortcoFindUnique(...args),
      update: (...args: unknown[]) => mockPortcoUpdate(...args),
    },
    company: {
      findUnique: (...args: unknown[]) => mockCompanyFindUnique(...args),
    },
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { PATCH } from "@/app/api/admin/portfolio-companies/[id]/route";

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockLogAdminAction = vi.mocked(logAdminAction);

function req(body: unknown) {
  return new Request("http://localhost/api/admin/portfolio-companies/pc1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const admin = { id: "admin1", email: "admin@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ user: admin, error: null } as never);
});

describe("PATCH /api/admin/portfolio-companies/[id] — companyId hardening", () => {
  it("404s with readable copy when companyId names a company that doesn't exist", async () => {
    mockPortcoFindUnique.mockResolvedValue({ id: "pc1", name: "Acme", companyId: null });
    mockCompanyFindUnique.mockResolvedValue(null);

    const res = await PATCH(req({ companyId: "co-missing" }), { params: Promise.resolve({ id: "pc1" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no longer exists/i);
    expect(mockPortcoUpdate).not.toHaveBeenCalled();
  });

  it("409s naming the conflict when companyId is already linked to a different PortfolioCompany", async () => {
    mockPortcoFindUnique.mockResolvedValue({ id: "pc1", name: "Acme", companyId: null });
    mockCompanyFindUnique.mockResolvedValue({
      id: "co1",
      name: "Acme Operating Co",
      portfolioCompany: { id: "pc2", name: "Northwind" },
    });

    const res = await PATCH(req({ companyId: "co1" }), { params: Promise.resolve({ id: "pc1" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Acme Operating Co is already linked to Northwind.");
    expect(mockPortcoUpdate).not.toHaveBeenCalled();
  });

  it("allows re-PATCHing the same portfolio company that already owns the link (no false 409)", async () => {
    mockPortcoFindUnique.mockResolvedValue({ id: "pc1", name: "Acme", companyId: "co1" });
    mockCompanyFindUnique.mockResolvedValue({
      id: "co1",
      name: "Acme Operating Co",
      portfolioCompany: { id: "pc1", name: "Acme" },
    });
    mockPortcoUpdate.mockResolvedValue({ id: "pc1", name: "Acme", companyId: "co1" });

    const res = await PATCH(req({ companyId: "co1" }), { params: Promise.resolve({ id: "pc1" }) });
    expect(res.status).toBe(200);
  });

  it("on success, writes PORTCO_LINKED in addition to PORTCO_UPDATED", async () => {
    mockPortcoFindUnique.mockResolvedValue({ id: "pc1", name: "Acme", companyId: null });
    mockCompanyFindUnique.mockResolvedValue({ id: "co1", name: "Acme Operating Co", portfolioCompany: null });
    mockPortcoUpdate.mockResolvedValue({ id: "pc1", name: "Acme", companyId: "co1" });

    const res = await PATCH(req({ companyId: "co1" }), { params: Promise.resolve({ id: "pc1" }) });
    expect(res.status).toBe(200);

    const actions = mockLogAdminAction.mock.calls.map((c) => c[1]);
    expect(actions).toContain("PORTCO_UPDATED");
    expect(actions).toContain("PORTCO_LINKED");
  });

  it("unlinking (companyId: null) writes PORTCO_UNLINKED", async () => {
    mockPortcoFindUnique.mockResolvedValue({ id: "pc1", name: "Acme", companyId: "co1" });
    mockPortcoUpdate.mockResolvedValue({ id: "pc1", name: "Acme", companyId: null });

    const res = await PATCH(req({ companyId: null }), { params: Promise.resolve({ id: "pc1" }) });
    expect(res.status).toBe(200);
    expect(mockCompanyFindUnique).not.toHaveBeenCalled();

    const actions = mockLogAdminAction.mock.calls.map((c) => c[1]);
    expect(actions).toContain("PORTCO_UNLINKED");
    expect(actions).not.toContain("PORTCO_LINKED");
  });

  it("a no-op PATCH (same companyId re-sent) does not write a link/unlink audit row", async () => {
    mockPortcoFindUnique.mockResolvedValue({ id: "pc1", name: "Acme", companyId: "co1" });
    mockCompanyFindUnique.mockResolvedValue({ id: "co1", name: "Acme Operating Co", portfolioCompany: { id: "pc1", name: "Acme" } });
    mockPortcoUpdate.mockResolvedValue({ id: "pc1", name: "Acme", companyId: "co1" });

    const res = await PATCH(req({ companyId: "co1" }), { params: Promise.resolve({ id: "pc1" }) });
    expect(res.status).toBe(200);

    const actions = mockLogAdminAction.mock.calls.map((c) => c[1]);
    expect(actions).toEqual(["PORTCO_UPDATED"]);
  });
});
