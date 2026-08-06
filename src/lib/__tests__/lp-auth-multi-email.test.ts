import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 26 (WS59, D1): POST /api/lp/auth/request and POST /api/lp/auth/verify
// now resolve through LpEmail rather than LimitedPartner.email, so ANY of an
// LP's addresses can request/verify a code and land on the same lpId/session.
// OTP rows and sessions stay lpId-keyed — unchanged, verified here structurally.

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  clientIp: () => "127.0.0.1",
}));

const mockSendLpOtpEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendLpOtpEmail: (...args: unknown[]) => mockSendLpOtpEmail(...args),
}));

const mockLpEmailFindUnique = vi.fn();
const mockOtpCreate = vi.fn();
const mockOtpFindFirst = vi.fn();
const mockOtpUpdate = vi.fn();
const mockOtpDeleteMany = vi.fn();
const mockSessionCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    lpEmail: { findUnique: (...args: unknown[]) => mockLpEmailFindUnique(...args) },
    lpOtpCode: {
      create: (...args: unknown[]) => mockOtpCreate(...args),
      findFirst: (...args: unknown[]) => mockOtpFindFirst(...args),
      update: (...args: unknown[]) => mockOtpUpdate(...args),
      deleteMany: (...args: unknown[]) => mockOtpDeleteMany(...args),
    },
    lpSession: { create: (...args: unknown[]) => mockSessionCreate(...args) },
    // verify/route.ts uses the array form of $transaction — just await the
    // already-invoked mock-promises passed in, same as real Prisma batching.
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

import { NextRequest } from "next/server";
import { sha256 } from "@/lib/lp-auth";
import { POST as requestOtp } from "@/app/api/lp/auth/request/route";
import { POST as verifyOtp } from "@/app/api/lp/auth/verify/route";

function req(path: string, body: unknown) {
  return new NextRequest(`https://molly.dfslab.net${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockLpEmailFindUnique.mockReset();
  mockOtpCreate.mockReset();
  mockOtpFindFirst.mockReset();
  mockOtpUpdate.mockReset();
  mockOtpDeleteMany.mockReset();
  mockSessionCreate.mockReset();
  mockSendLpOtpEmail.mockReset();
  mockSendLpOtpEmail.mockResolvedValue(undefined);
  mockOtpDeleteMany.mockResolvedValue({ count: 0 });
});

describe("POST /api/lp/auth/request — resolves through LpEmail (D1)", () => {
  it("creates an OTP keyed to the owning lpId and emails the SECONDARY address that was used", async () => {
    mockLpEmailFindUnique.mockResolvedValueOnce({ lpId: "lp-1" });

    const res = await requestOtp(req("/api/lp/auth/request", { email: "secondary@example.com" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockLpEmailFindUnique).toHaveBeenCalledWith({ where: { email: "secondary@example.com" }, select: { lpId: true } });
    expect(mockOtpCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lpId: "lp-1" }) }));
    expect(mockSendLpOtpEmail).toHaveBeenCalledWith("secondary@example.com", expect.any(String));
    expect(data.ok).toBe(true);
  });

  it("returns the identical generic response for an unknown address — no existence oracle (JC7)", async () => {
    mockLpEmailFindUnique.mockResolvedValueOnce({ lpId: "lp-1" });
    const knownRes = await requestOtp(req("/api/lp/auth/request", { email: "secondary@example.com" }));
    const knownData = await knownRes.json();

    mockLpEmailFindUnique.mockResolvedValueOnce(null);
    const unknownRes = await requestOtp(req("/api/lp/auth/request", { email: "nobody@example.com" }));
    const unknownData = await unknownRes.json();

    expect(unknownRes.status).toBe(200);
    expect(unknownData).toEqual(knownData);
    expect(mockOtpCreate).toHaveBeenCalledTimes(1); // only for the known-address call
  });
});

describe("POST /api/lp/auth/verify — resolves through LpEmail (D1)", () => {
  const GENERIC_ERROR = "That code is invalid or has expired.";

  it("mints a session for the owning lpId when verifying with a SECONDARY address", async () => {
    mockLpEmailFindUnique.mockResolvedValueOnce({ lpId: "lp-1" });
    const code = "123456";
    mockOtpFindFirst.mockResolvedValueOnce({ id: "otp-1", codeHash: sha256(code), consumedAt: null, attempts: 0, expiresAt: new Date(Date.now() + 60_000) });
    mockOtpUpdate.mockResolvedValueOnce({ id: "otp-1", codeHash: sha256(code), consumedAt: null, attempts: 1, expiresAt: new Date(Date.now() + 60_000) });

    const res = await verifyOtp(req("/api/lp/auth/verify", { email: "secondary@example.com", code }));

    expect(res.status).toBe(200);
    expect(mockOtpFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { lpId: "lp-1", consumedAt: null } }));
    expect(mockSessionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lpId: "lp-1" }) }));
    expect(res.headers.get("set-cookie")).toMatch(/lp_session=/);
  });

  it("returns the generic error for an unknown address, same as a wrong code", async () => {
    mockLpEmailFindUnique.mockResolvedValueOnce(null);

    const res = await verifyOtp(req("/api/lp/auth/verify", { email: "nobody@example.com", code: "123456" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe(GENERIC_ERROR);
    expect(mockOtpFindFirst).not.toHaveBeenCalled();
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });
});
