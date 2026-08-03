import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 16, WS39 (F32) — exercises the real POST /api/companies admin
// branch: the field-name fix (client/route used to disagree, silently
// making the admin the OWNER instead of the typed-in founder) plus the
// new due-diligence invite branch. Mocked db/email, synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendDiligenceInviteEmail: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/setup-token", () => ({
  generateSetupToken: vi.fn(() => ({
    token: "fixed-test-token",
    tokenExpiresAt: new Date("2099-01-01"),
  })),
}));

const mockUserFindUnique = vi.fn();
const mockUserCreate = vi.fn();
const mockCompanyCreate = vi.fn();
const mockCompanyDiligenceCreate = vi.fn();
const mockMembershipCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
          create: (...args: unknown[]) => mockUserCreate(...args),
        },
        company: { create: (...args: unknown[]) => mockCompanyCreate(...args) },
        companyDiligence: { create: (...args: unknown[]) => mockCompanyDiligenceCreate(...args) },
        userCompanyMembership: { create: (...args: unknown[]) => mockMembershipCreate(...args) },
      }),
  },
}));

import { requireAuth } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { sendDiligenceInviteEmail } from "@/lib/email";
import { POST } from "@/app/api/companies/route";

const mockRequireAuth = vi.mocked(requireAuth);
const mockSendDiligenceInviteEmail = vi.mocked(sendDiligenceInviteEmail);
const mockLogAdminAction = vi.mocked(logAdminAction);

function req(body: unknown) {
  return new Request("https://molly.dfslab.net/api/companies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ADMIN = { id: "admin-1", email: "admin@dfs.vc", roles: ["ADMIN"] };

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockUserFindUnique.mockReset();
  mockUserCreate.mockReset();
  mockCompanyCreate.mockReset();
  mockCompanyDiligenceCreate.mockReset();
  mockMembershipCreate.mockReset();
  mockSendDiligenceInviteEmail.mockReset();
  mockSendDiligenceInviteEmail.mockResolvedValue(undefined as never);
  mockLogAdminAction.mockReset();

  mockRequireAuth.mockResolvedValue({ user: ADMIN, error: null } as any);
  mockCompanyCreate.mockResolvedValue({ id: "company-1", name: "Acme" });
  mockMembershipCreate.mockResolvedValue({ id: "membership-1" });
});

describe("POST /api/companies — admin field-name fix (F32)", () => {
  it("an existing-user email assigns OWNER membership to that user, not the admin", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "founder-1", email: "founder@acme.com" });

    const res = await POST(req({ name: "Acme", userEmail: "founder@acme.com" }));

    expect(res.status).toBe(201);
    expect(mockUserCreate).not.toHaveBeenCalled(); // user already existed
    expect(mockMembershipCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "founder-1", role: "OWNER" }) })
    );
  });

  it("a new-user email (no dueDiligence) creates the user, assigns them OWNER, and sends no diligence email", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: "new-founder-1", email: "new@acme.com" });

    const res = await POST(req({ name: "Acme", userEmail: "new@acme.com", userName: "New Founder" }));

    expect(res.status).toBe(201);
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "new@acme.com", status: "APPROVED", approvalToken: "fixed-test-token" }),
      })
    );
    expect(mockMembershipCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "new-founder-1", role: "OWNER" }) })
    );
    expect(mockCompanyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "ACTIVE" }) })
    );
    expect(mockCompanyDiligenceCreate).not.toHaveBeenCalled();
    expect(mockSendDiligenceInviteEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/companies — due-diligence branch (Q56-Q60)", () => {
  it("dueDiligence creates a DILIGENCE-stage company, a CompanyDiligence row, sends the invite email, and audit-logs dueDiligence: true", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: "dd-founder-1", email: "dd@acme.com" });
    mockCompanyCreate.mockResolvedValue({ id: "dd-company-1", name: "Acme DD" });

    const res = await POST(
      req({
        name: "Acme DD",
        userEmail: "dd@acme.com",
        userName: "DD Founder",
        dueDiligence: { isStellarEcosystem: true },
      })
    );

    expect(res.status).toBe(201);
    expect(mockCompanyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "DILIGENCE" }) })
    );
    expect(mockCompanyDiligenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { companyId: "dd-company-1", isStellarEcosystem: true },
      })
    );
    expect(mockSendDiligenceInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "dd@acme.com", companyName: "Acme DD", token: "fixed-test-token" })
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      ADMIN,
      "COMPANY_CREATED",
      expect.objectContaining({ metadata: expect.objectContaining({ dueDiligence: true }) })
    );
  });

  it("dueDiligence with no explicit isStellarEcosystem defaults to false", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: "dd-founder-2", email: "dd2@acme.com" });
    mockCompanyCreate.mockResolvedValue({ id: "dd-company-2", name: "Acme DD 2" });

    await POST(req({ name: "Acme DD 2", userEmail: "dd2@acme.com", dueDiligence: {} }));

    expect(mockCompanyDiligenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { companyId: "dd-company-2", isStellarEcosystem: false } })
    );
  });

  it("dueDiligence with an existing user does not send the invite email (no new setup token minted)", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "existing-founder-1", email: "existing@acme.com" });
    mockCompanyCreate.mockResolvedValue({ id: "dd-company-3", name: "Acme DD 3" });

    const res = await POST(
      req({ name: "Acme DD 3", userEmail: "existing@acme.com", dueDiligence: { isStellarEcosystem: false } })
    );

    expect(res.status).toBe(201);
    expect(mockCompanyDiligenceCreate).toHaveBeenCalled(); // company is still DD-staged
    expect(mockSendDiligenceInviteEmail).not.toHaveBeenCalled(); // no fresh token minted for an existing user
  });
});
