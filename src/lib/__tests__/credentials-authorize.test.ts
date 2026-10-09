import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const mockFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: (...a: unknown[]) => mockFindUnique(...a) } },
}));

import { authorizeCredentials } from "@/lib/credentials-authorize";

// Synthetic data only.
const PASSWORD = "synthetic-test-pw";
let hash: string;

function user(over: Record<string, unknown>) {
  return {
    id: "u1",
    email: "person@example.test",
    name: "Person",
    image: null,
    passwordHash: hash,
    roles: ["FOUNDER"],
    status: "APPROVED",
    ...over,
  };
}

describe("authorizeCredentials", () => {
  beforeEach(async () => {
    mockFindUnique.mockReset();
    hash = await bcrypt.hash(PASSWORD, 4);
  });

  it("refuses an admin with a valid password and logs without the email", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFindUnique.mockResolvedValue(user({ roles: ["ADMIN"] }));
    expect(await authorizeCredentials({ email: "person@example.test", password: PASSWORD })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("person@example.test");
    warn.mockRestore();
  });

  it("refuses a user holding both ADMIN and FOUNDER roles", async () => {
    mockFindUnique.mockResolvedValue(user({ roles: ["FOUNDER", "ADMIN"] }));
    expect(await authorizeCredentials({ email: "person@example.test", password: PASSWORD })).toBeNull();
  });

  it("still signs in an approved founder with a valid password", async () => {
    mockFindUnique.mockResolvedValue(user({}));
    const res = await authorizeCredentials({ email: "person@example.test", password: PASSWORD });
    expect(res).toMatchObject({ id: "u1", roles: ["FOUNDER"], status: "APPROVED" });
  });

  it("refuses a founder with a wrong password", async () => {
    mockFindUnique.mockResolvedValue(user({}));
    expect(await authorizeCredentials({ email: "person@example.test", password: "nope" })).toBeNull();
  });

  it("refuses a non-approved user even with a valid password", async () => {
    mockFindUnique.mockResolvedValue(user({ status: "PENDING" }));
    expect(await authorizeCredentials({ email: "person@example.test", password: PASSWORD })).toBeNull();
  });
});
