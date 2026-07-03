import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { userCompanyMembership: { findUnique: vi.fn() } },
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAuth, requireAdmin, requireCompanyAccess } from "@/lib/auth-guard";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(db.userCompanyMembership.findUnique);

function session(overrides: Partial<{ roles: string[]; status: string; id: string }> = {}) {
  return {
    user: {
      id: overrides.id ?? "user-1",
      roles: overrides.roles ?? ["FOUNDER"],
      status: overrides.status ?? "APPROVED",
    },
  } as any;
}

beforeEach(() => {
  mockAuth.mockReset();
  mockFindUnique.mockReset();
});

describe("requireAuth", () => {
  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null as any);
    const { user, error } = await requireAuth();
    expect(user).toBeNull();
    expect(error?.status).toBe(401);
  });

  it("returns 403 when the user is not approved", async () => {
    mockAuth.mockResolvedValue(session({ status: "PENDING" }));
    const { user, error } = await requireAuth();
    expect(user).toBeNull();
    expect(error?.status).toBe(403);
  });

  it("returns 403 when a required role is missing", async () => {
    mockAuth.mockResolvedValue(session({ roles: ["FOUNDER"] }));
    const { user, error } = await requireAuth("ADMIN" as any);
    expect(user).toBeNull();
    expect(error?.status).toBe(403);
  });

  it("returns the user on the happy path", async () => {
    mockAuth.mockResolvedValue(session());
    const { user, error } = await requireAuth();
    expect(error).toBeNull();
    expect(user?.id).toBe("user-1");
  });
});

describe("requireAdmin", () => {
  it("returns 403 for a non-admin", async () => {
    mockAuth.mockResolvedValue(session({ roles: ["FOUNDER"] }));
    const { error } = await requireAdmin();
    expect(error?.status).toBe(403);
  });

  it("passes for an admin", async () => {
    mockAuth.mockResolvedValue(session({ roles: ["ADMIN"] }));
    const { user, error } = await requireAdmin();
    expect(error).toBeNull();
    expect(user?.roles).toContain("ADMIN");
  });
});

describe("requireCompanyAccess", () => {
  it("bypasses the membership lookup for admins", async () => {
    mockAuth.mockResolvedValue(session({ roles: ["ADMIN"] }));
    const { user, error } = await requireCompanyAccess("company-1");
    expect(error).toBeNull();
    expect(user?.roles).toContain("ADMIN");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("allows a founder who is a member", async () => {
    mockAuth.mockResolvedValue(session({ roles: ["FOUNDER"] }));
    mockFindUnique.mockResolvedValue({ id: "m1", userId: "user-1", companyId: "company-1", role: "OWNER" } as any);
    const { user, error } = await requireCompanyAccess("company-1");
    expect(error).toBeNull();
    expect(user?.id).toBe("user-1");
  });

  it("returns 403 for a founder who is not a member", async () => {
    mockAuth.mockResolvedValue(session({ roles: ["FOUNDER"] }));
    mockFindUnique.mockResolvedValue(null);
    const { user, error } = await requireCompanyAccess("company-1");
    expect(user).toBeNull();
    expect(error?.status).toBe(403);
  });
});
