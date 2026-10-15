import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const findUnique = vi.fn();
const update = vi.fn();
const create = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
      create: (...a: unknown[]) => create(...a),
    },
  },
}));

import { resolveGoogleSignIn } from "@/lib/google-signin";

// Synthetic data only.
const input = { email: "sam@new.example", googleId: "g-123", name: "Sam", image: null };

function lookup(map: { googleId?: object | null; email?: object | null }) {
  findUnique.mockImplementation(async ({ where }: { where: Record<string, string> }) =>
    "googleId" in where ? map.googleId ?? null : map.email ?? null
  );
}

describe("resolveGoogleSignIn", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    create.mockReset();
  });

  it("matches by Google account id even when the reported email differs", async () => {
    lookup({ googleId: { id: "u-old", email: "sam@old.example", googleId: "g-123" } });
    expect(await resolveGoogleSignIn(input)).toEqual({ ok: true, userId: "u-old", email: "sam@old.example" });
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("links an existing account with no Google id", async () => {
    lookup({ email: { id: "u1", email: input.email, googleId: null, image: null } });
    expect(await resolveGoogleSignIn(input)).toEqual({ ok: true, userId: "u1", email: input.email });
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { googleId: "g-123", image: null } });
  });

  it("refuses when the email's account is linked to a different Google account", async () => {
    lookup({ email: { id: "u1", email: input.email, googleId: "g-other" } });
    expect(await resolveGoogleSignIn(input)).toEqual({ ok: false, reason: "google_account_conflict" });
    expect(update).not.toHaveBeenCalled();
  });

  it("creates a new admin on first sign-in", async () => {
    lookup({});
    create.mockResolvedValue({ id: "u-new", email: input.email });
    expect(await resolveGoogleSignIn(input)).toEqual({ ok: true, userId: "u-new", email: input.email });
    expect(create.mock.calls[0][0].data).toMatchObject({ roles: ["ADMIN"], status: "APPROVED", googleId: "g-123" });
  });

  it("turns a unique-constraint race on create into a conflict instead of throwing", async () => {
    lookup({});
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" })
    );
    expect(await resolveGoogleSignIn(input)).toEqual({ ok: false, reason: "google_account_conflict" });
  });
});
