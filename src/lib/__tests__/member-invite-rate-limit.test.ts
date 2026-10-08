import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 25, WS57 / F50 — POST /api/companies/[id]/members/invite is capped at
// 20 invites/hour per inviter (keyed on the inviter's user id). Mocked
// db/auth/email/rate-limit; synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendTeamInviteEmail: vi.fn(() => Promise.resolve()),
  sendMemberAddedEmail: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/setup-token", () => ({
  generateSetupToken: vi.fn(() => ({ token: "tok", tokenExpiresAt: new Date("2099-01-01") })),
  isSetupTokenExpired: vi.fn(() => false),
}));

const mockMembershipFind = vi.fn();
const mockMembershipCreate = vi.fn();
const mockCompanyFind = vi.fn();
const mockUserFind = vi.fn();
const mockUserCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    userCompanyMembership: {
      findUnique: (...a: unknown[]) => mockMembershipFind(...a),
      create: (...a: unknown[]) => mockMembershipCreate(...a),
    },
    company: { findUnique: (...a: unknown[]) => mockCompanyFind(...a) },
    user: {
      findUnique: (...a: unknown[]) => mockUserFind(...a),
      create: (...a: unknown[]) => mockUserCreate(...a),
    },
  },
}));

import { requireCompanyAccess } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendTeamInviteEmail } from "@/lib/email";
import { POST } from "@/app/api/companies/[id]/members/invite/route";

const mockGuard = vi.mocked(requireCompanyAccess);
const mockLimit = vi.mocked(checkRateLimit);
const mockSendTeamInvite = vi.mocked(sendTeamInviteEmail);

function req(body: unknown) {
  return new Request("https://molly.dfs.vc/api/companies/c1/members/invite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockGuard.mockResolvedValue({ user: { id: "owner-1", name: "Owner", roles: ["FOUNDER"] }, error: null } as any);
  mockMembershipFind.mockResolvedValue({ role: "OWNER" });
  mockCompanyFind.mockResolvedValue({ id: "c1", name: "Acme" });
  mockUserFind.mockResolvedValue(null);
  mockUserCreate.mockResolvedValue({ id: "u2", email: "new@x.com", name: null, roles: ["FOUNDER"] });
  mockMembershipCreate.mockResolvedValue({ id: "m1", role: "MEMBER" });
});

describe("POST /api/companies/[id]/members/invite rate limit", () => {
  it("returns 429 and creates/sends nothing when over the limit", async () => {
    mockLimit.mockResolvedValue(false);
    const res = await POST(req({ email: "new@x.com" }), params);
    expect(res.status).toBe(429);
    expect(mockLimit).toHaveBeenCalledWith("member-invite", "owner-1", 20);
    expect(mockUserCreate).not.toHaveBeenCalled();
    expect(mockSendTeamInvite).not.toHaveBeenCalled();
  });

  it("proceeds normally under the limit", async () => {
    mockLimit.mockResolvedValue(true);
    const res = await POST(req({ email: "new@x.com" }), params);
    expect(res.status).toBe(200);
    expect(mockSendTeamInvite).toHaveBeenCalledTimes(1);
  });

  it("does not consume the limit for non-owners (403 comes first)", async () => {
    mockMembershipFind.mockResolvedValue({ role: "MEMBER" });
    const res = await POST(req({ email: "new@x.com" }), params);
    expect(res.status).toBe(403);
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("keys on the inviter id, so a different owner is counted separately", async () => {
    mockLimit.mockResolvedValue(true);
    mockGuard.mockResolvedValue({ user: { id: "owner-2", name: "Other", roles: ["FOUNDER"] }, error: null } as any);
    await POST(req({ email: "new@x.com" }), params);
    expect(mockLimit).toHaveBeenCalledWith("member-invite", "owner-2", 20);
  });
});
