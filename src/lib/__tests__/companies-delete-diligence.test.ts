import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 16, WS43 (Q57, corrected) — DELETE /api/companies/[id]'s
// founder-account cleanup. The original plan assumed the endpoint
// already deleted the founder's account on a DD decline; it didn't
// (Company deletion never cascades to User). This exercises the fix:
// narrowly scoped to DILIGENCE-stage companies, only when the founder
// has zero remaining memberships elsewhere, never an admin account, and
// never allowed to block the company deletion itself. Mocked db/auth/
// audit, synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn(), requireCompanyAccess: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const mockCompanyFindUnique = vi.fn();
const mockCompanyDelete = vi.fn();
const mockMembershipCount = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserDelete = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    company: {
      findUnique: (...args: unknown[]) => mockCompanyFindUnique(...args),
      delete: (...args: unknown[]) => mockCompanyDelete(...args),
    },
    userCompanyMembership: { count: (...args: unknown[]) => mockMembershipCount(...args) },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      delete: (...args: unknown[]) => mockUserDelete(...args),
    },
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { DELETE } from "@/app/api/companies/[id]/route";

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockLogAdminAction = vi.mocked(logAdminAction);

const ADMIN = { id: "admin-1", email: "admin@dfs.vc", roles: ["ADMIN"] };

function params(id = "company-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockCompanyFindUnique.mockReset();
  mockCompanyDelete.mockReset();
  mockMembershipCount.mockReset();
  mockUserFindUnique.mockReset();
  mockUserDelete.mockReset();
  mockLogAdminAction.mockReset();
  mockRequireAdmin.mockResolvedValue({ user: ADMIN, error: null } as any);
  mockCompanyDelete.mockResolvedValue({});
});

describe("DELETE /api/companies/[id] — DILIGENCE-stage founder cleanup (Q57, corrected)", () => {
  it("deletes both the company and the founder's User row when the founder has zero remaining memberships", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      id: "company-1",
      name: "Acme",
      stage: "DILIGENCE",
      memberships: [{ userId: "founder-1" }],
    });
    mockMembershipCount.mockResolvedValue(0); // no memberships left once this company is gone
    mockUserFindUnique.mockResolvedValue({ email: "founder@acme.com", roles: ["FOUNDER"] });
    mockUserDelete.mockResolvedValue({});

    const res = await DELETE(new Request("https://molly.dfslab.net"), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockCompanyDelete).toHaveBeenCalledWith({ where: { id: "company-1" } });
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: "founder-1" } });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      ADMIN,
      "COMPANY_DELETED",
      expect.objectContaining({
        metadata: expect.objectContaining({ name: "Acme", founderAccountsDeleted: ["founder@acme.com"] }),
      })
    );
  });

  it("deletes only the company, leaving the founder's User row intact, when they still belong to another real company", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      id: "company-1",
      name: "Acme",
      stage: "DILIGENCE",
      memberships: [{ userId: "founder-1" }],
    });
    mockMembershipCount.mockResolvedValue(1); // still a member of another company

    const res = await DELETE(new Request("https://molly.dfslab.net"), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockCompanyDelete).toHaveBeenCalledWith({ where: { id: "company-1" } });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockUserDelete).not.toHaveBeenCalled();

    const opts = mockLogAdminAction.mock.calls[0]![2] as Record<string, unknown>;
    expect(opts.metadata).not.toHaveProperty("founderAccountsDeleted");
  });

  it("never touches the User model at all for an ACTIVE-stage company (regression guard — this WS must not leak into the general delete path)", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      id: "company-2",
      name: "Beta",
      stage: "ACTIVE",
      memberships: [{ userId: "someone-1" }],
    });

    const res = await DELETE(new Request("https://molly.dfslab.net"), params("company-2"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockCompanyDelete).toHaveBeenCalledWith({ where: { id: "company-2" } });
    expect(mockMembershipCount).not.toHaveBeenCalled();
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockUserDelete).not.toHaveBeenCalled();

    const opts = mockLogAdminAction.mock.calls[0]![2] as Record<string, unknown>;
    expect(opts.metadata).not.toHaveProperty("founderAccountsDeleted");
  });

  it("never auto-deletes an admin account even if somehow the sole DILIGENCE-company member", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      id: "company-1",
      name: "Acme",
      stage: "DILIGENCE",
      memberships: [{ userId: "admin-2" }],
    });
    mockMembershipCount.mockResolvedValue(0);
    mockUserFindUnique.mockResolvedValue({ email: "admin2@dfs.vc", roles: ["ADMIN"] });

    await DELETE(new Request("https://molly.dfslab.net"), params());

    expect(mockUserDelete).not.toHaveBeenCalled();
  });

  it("still completes the company deletion and the audit log even if the founder's User row can't be deleted (e.g. an unrelated FK reference)", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      id: "company-1",
      name: "Acme",
      stage: "DILIGENCE",
      memberships: [{ userId: "founder-1" }],
    });
    mockMembershipCount.mockResolvedValue(0);
    mockUserFindUnique.mockResolvedValue({ email: "founder@acme.com", roles: ["FOUNDER"] });
    mockUserDelete.mockRejectedValue(new Error("Foreign key constraint violation"));

    const res = await DELETE(new Request("https://molly.dfslab.net"), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockCompanyDelete).toHaveBeenCalled();

    const opts = mockLogAdminAction.mock.calls[0]![2] as Record<string, unknown>;
    expect(opts.metadata).not.toHaveProperty("founderAccountsDeleted");
  });

  it("de-duplicates founder ids from multiple memberships (defensive, though WS39 only ever creates one)", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      id: "company-1",
      name: "Acme",
      stage: "DILIGENCE",
      memberships: [{ userId: "founder-1" }, { userId: "founder-1" }],
    });
    mockMembershipCount.mockResolvedValue(0);
    mockUserFindUnique.mockResolvedValue({ email: "founder@acme.com", roles: ["FOUNDER"] });
    mockUserDelete.mockResolvedValue({});

    await DELETE(new Request("https://molly.dfslab.net"), params());

    expect(mockUserDelete).toHaveBeenCalledTimes(1);
  });
});
