import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 45, WS153 — a pending signup joins an existing company with no founder.
// Matcher is pure; the join route is tested with mocked db/auth. Synthetic data.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
const logAdminAction = vi.fn();
vi.mock("@/lib/audit", () => ({ logAdminAction: (...a: unknown[]) => logAdminAction(...a) }));
const emailSpy = vi.fn();
vi.mock("@/lib/email", () => ({ sendApprovalEmail: (...a: unknown[]) => emailSpy(...a) }));

const userFindUnique = vi.fn();
const companyFindFirst = vi.fn();
const membershipCreate = vi.fn();
const companyDelete = vi.fn();
const tx = {
  company: { findFirst: (...a: unknown[]) => companyFindFirst(...a), delete: (...a: unknown[]) => companyDelete(...a) },
  userCompanyMembership: { create: (...a: unknown[]) => membershipCreate(...a) },
};
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { matchUnclaimedCompanies } from "@/lib/unclaimed-match";
import { POST as join } from "@/app/api/admin/approvals/[id]/join/route";

describe("matchUnclaimedCompanies", () => {
  const cands = [
    { id: "a", name: "Northwind Labs", aliases: [], website: null },
    { id: "b", name: "Other Co", aliases: ["Brightside"], website: "https://www.brightside.example" },
    { id: "c", name: "Unrelated", aliases: [], website: null },
    { id: "d", name: "Zed Holdings", aliases: [], website: "https://zed.example" },
  ];
  it("matches by exact name, alias, similar name and the signup's non-free email domain", () => {
    expect(matchUnclaimedCompanies({ companyName: "Northwind Labs Inc", aliases: [], email: "x@gmail.com" }, cands)[0]).toMatchObject({
      id: "a",
      reasons: ["NAME_EXACT"],
    });
    expect(matchUnclaimedCompanies({ companyName: "Brightside", aliases: [], email: "x@gmail.com" }, cands)).toEqual([
      { id: "b", name: "Other Co", reasons: ["ALIAS_EXACT"] },
    ]);
    expect(matchUnclaimedCompanies({ companyName: "Northwind", aliases: [], email: "x@gmail.com" }, cands)[0].reasons).toEqual(["NAME_TOKENS"]);
    expect(matchUnclaimedCompanies({ companyName: "Something Else", aliases: [], email: "me@zed.example" }, cands)).toEqual([
      { id: "d", name: "Zed Holdings", reasons: ["WEBSITE_DOMAIN"] },
    ]);
  });
  it("ignores free-mail domains and unrelated names", () => {
    expect(matchUnclaimedCompanies({ companyName: "Nothing Like It", aliases: [], email: "me@gmail.com" }, cands)).toEqual([]);
  });
});

const admin = { id: "admin1", email: "admin@example.com", roles: ["ADMIN"] };
const params = { params: Promise.resolve({ id: "u1" }) };
const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const emptyOwn = {
  id: "own1",
  createdById: "u1",
  stage: "ACTIVE",
  portfolioCompany: null,
  diligence: null,
  _count: { memberships: 1, updates: 0, metricDefinitions: 0, documents: 0, notes: 0, shareableLinks: 0, capTableScenarios: 0, memos: 0 },
};
const signup = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  status: "PENDING",
  memberships: [{ companyId: "own1", company: { ...emptyOwn, ...over } }],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ user: admin, error: null } as never);
  companyFindFirst.mockResolvedValue({ id: "target" });
});

describe("POST /api/admin/approvals/[id]/join", () => {
  it("makes the signup OWNER of the target, deletes the empty signup company, audits, and sends no email", async () => {
    userFindUnique.mockResolvedValue(signup());
    const res = await join(req({ companyId: "target" }), params);
    expect(res.status).toBe(200);
    expect(membershipCreate).toHaveBeenCalledWith({ data: { userId: "u1", companyId: "target", role: "OWNER" } });
    expect(companyDelete).toHaveBeenCalledWith({ where: { id: "own1" } });
    expect(logAdminAction).toHaveBeenCalledWith(admin, "SIGNUP_JOINED_COMPANY", expect.objectContaining({
      metadata: { userId: "u1", companyId: "target", removedCompanyId: "own1" },
    }));
    expect(emailSpy).not.toHaveBeenCalled();
  });

  it("409s when the signup's company has content", async () => {
    userFindUnique.mockResolvedValue(signup({ _count: { ...emptyOwn._count, updates: 1 } }));
    const res = await join(req({ companyId: "target" }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This signup's company already has content. Approve it and merge by hand.");
    expect(membershipCreate).not.toHaveBeenCalled();
    expect(companyDelete).not.toHaveBeenCalled();
  });

  it("409s when the target gained a founder meanwhile", async () => {
    userFindUnique.mockResolvedValue(signup());
    companyFindFirst.mockResolvedValue(null);
    const res = await join(req({ companyId: "target" }), params);
    expect(res.status).toBe(409);
    expect(membershipCreate).not.toHaveBeenCalled();
    expect(companyDelete).not.toHaveBeenCalled();
  });

  it("refuses a user who is not pending", async () => {
    userFindUnique.mockResolvedValue({ ...signup(), status: "ACTIVE" });
    expect((await join(req({ companyId: "target" }), params)).status).toBe(400);
    expect(companyDelete).not.toHaveBeenCalled();
  });
});
