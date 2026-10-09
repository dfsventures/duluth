import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockCount = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    auditLog: {
      create: (...a: unknown[]) => mockCreate(...a),
      count: (...a: unknown[]) => mockCount(...a),
    },
  },
}));

import { authorizeCredentials } from "@/lib/credentials-authorize";
import { requestInfo } from "@/lib/signin-audit";

const PASSWORD = "synthetic-test-pw";
let hash: string;
const req = new Request("http://x.test", {
  headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "UA/" + "a".repeat(300) },
});

function user(over: Record<string, unknown> = {}) {
  return { id: "u1", email: "person@example.test", name: "P", image: null, passwordHash: hash, roles: ["FOUNDER"], status: "APPROVED", ...over };
}
const creds = (over: Record<string, unknown> = {}) => ({ email: "  Person@Example.test ", password: PASSWORD, ...over });
const logged = () => mockCreate.mock.calls.map((c) => (c[0] as any).data);

describe("sign-in audit logging", () => {
  beforeEach(async () => {
    mockFindUnique.mockReset();
    mockCreate.mockReset().mockResolvedValue({});
    mockCount.mockReset().mockResolvedValue(0);
    hash = await bcrypt.hash(PASSWORD, 4);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("logs SIGN_IN_SUCCEEDED with method, ip and truncated UA", async () => {
    mockFindUnique.mockResolvedValue(user());
    expect(await authorizeCredentials(creds(), req)).not.toBeNull();
    const [row] = logged();
    expect(row).toMatchObject({ action: "SIGN_IN_SUCCEEDED", actorId: "u1", actorEmail: "person@example.test" });
    expect(row.metadata.method).toBe("credentials");
    expect(row.metadata.ip).toBe("203.0.113.9");
    expect(row.metadata.userAgent.length).toBe(200);
  });

  const cases: [string, () => any, string, boolean][] = [
    ["unknown_email", () => null, "wrong", false],
    ["no_password", () => user({ passwordHash: null }), PASSWORD, true],
    ["not_approved", () => user({ status: "PENDING" }), PASSWORD, true],
    ["wrong_password", () => user(), "nope", true],
    ["admin_password_refused", () => user({ roles: ["ADMIN"] }), PASSWORD, true],
  ];
  it.each(cases)("logs SIGN_IN_FAILED %s", async (reason, u, pw, hasId) => {
    mockFindUnique.mockResolvedValue(u());
    expect(await authorizeCredentials(creds({ password: pw }), req)).toBeNull();
    const [row] = logged();
    expect(row.action).toBe("SIGN_IN_FAILED");
    expect(row.actorEmail).toBe("person@example.test");
    expect(row.actorId).toBe(hasId ? "u1" : null);
    expect(row.metadata).toMatchObject({ method: "credentials", reason });
  });

  it("does not break sign-in when logging throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreate.mockRejectedValue(new Error("db down"));
    mockFindUnique.mockResolvedValue(user());
    expect(await authorizeCredentials(creds(), req)).not.toBeNull();
    expect(await authorizeCredentials(creds({ password: "bad" }), req)).toBeNull();
  });

  it("rate limits after too many recent failures and logs rate_limited", async () => {
    mockCount.mockResolvedValue(10);
    mockFindUnique.mockResolvedValue(user());
    expect(await authorizeCredentials(creds(), req)).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(logged()[0].metadata.reason).toBe("rate_limited");
  });

  it("fails open when the rate-limit query errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockCount.mockRejectedValue(new Error("db"));
    mockFindUnique.mockResolvedValue(user());
    expect(await authorizeCredentials(creds(), req)).not.toBeNull();
  });

  it("never puts the password in logged metadata", async () => {
    mockFindUnique.mockResolvedValue(user());
    await authorizeCredentials(creds(), req);
    await authorizeCredentials(creds({ password: "another-secret-pw" }), req);
    const all = JSON.stringify(logged());
    expect(all).not.toContain(PASSWORD);
    expect(all).not.toContain("another-secret-pw");
  });

  it("requestInfo tolerates missing headers", () => {
    expect(requestInfo(undefined)).toEqual({});
  });
});
