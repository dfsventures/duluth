import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 29, WS66 — GET/POST /api/companies/[id]/scenarios: list + create
// CapTableScenario rows. Mocked db/auth-guard, synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn() }));

const mockFindMany = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    capTableScenario: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

import { requireCompanyAccess } from "@/lib/auth-guard";
import { GET, POST } from "@/app/api/companies/[id]/scenarios/route";

const mockRequireCompanyAccess = vi.mocked(requireCompanyAccess);

function params(id = "company-1") {
  return { params: Promise.resolve({ id }) };
}

function getReq() {
  return new Request("https://molly.dfslab.net/api/companies/company-1/scenarios");
}

function postReq(body: unknown) {
  return new Request("https://molly.dfslab.net/api/companies/company-1/scenarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const FOUNDER = { id: "founder-1", email: "founder@acme.com", name: "Founder Person", roles: ["FOUNDER"] };

beforeEach(() => {
  mockRequireCompanyAccess.mockReset();
  mockFindMany.mockReset();
  mockCreate.mockReset();
  mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as any);
});

describe("GET /api/companies/[id]/scenarios", () => {
  it("403s a founder who isn't a member of the company", async () => {
    const forbidden = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    mockRequireCompanyAccess.mockResolvedValue({ user: null, error: forbidden } as any);

    const res = await GET(getReq(), params());
    expect(res.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("lists scenarios for the company, name/date only", async () => {
    mockFindMany.mockResolvedValue([
      { id: "scenario-1", name: "Base case", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02") },
    ]);

    const res = await GET(getReq(), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: "company-1" } })
    );
  });
});

describe("POST /api/companies/[id]/scenarios", () => {
  it("403s a founder who isn't a member of the company", async () => {
    const forbidden = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    mockRequireCompanyAccess.mockResolvedValue({ user: null, error: forbidden } as any);

    const res = await POST(postReq({}), params());
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates a scenario with a default name and blank inputs when the body is empty", async () => {
    mockCreate.mockResolvedValue({ id: "scenario-1", companyId: "company-1", name: "Base case" });

    const res = await POST(postReq({}), params());
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: "company-1",
          createdById: "founder-1",
          name: "Base case",
        }),
      })
    );
  });

  it("honors a client-supplied name", async () => {
    mockCreate.mockResolvedValue({ id: "scenario-1" });
    await POST(postReq({ name: "Optimistic seed" }), params());
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Optimistic seed" }) })
    );
  });

  it("rejects malformed inputs (non-array founders) with 400 and does not store it", async () => {
    const res = await POST(
      postReq({ inputs: { founders: "not-an-array", esopPct: 0, friendsAndFamily: [], preSeed: [] } }),
      params()
    );
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects esopPct out of range with 400", async () => {
    const res = await POST(
      postReq({ inputs: { founders: [{ name: "Jane Founder" }], esopPct: 150, friendsAndFamily: [], preSeed: [] } }),
      params()
    );
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a SAFE investor missing cap with 400", async () => {
    const res = await POST(
      postReq({
        inputs: {
          founders: [{ name: "Jane Founder" }],
          esopPct: 0,
          friendsAndFamily: [{ name: "Aunt Sue", amount: 1000, mfn: false }],
          preSeed: [],
        },
      }),
      params()
    );
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("accepts and stores a well-shaped inputs blob as-is", async () => {
    const inputs = {
      founders: [{ name: "Jane Founder" }],
      esopPct: 10,
      friendsAndFamily: [{ name: "Aunt Sue", amount: 25000, cap: 4000000, mfn: false }],
      preSeed: [],
      seed: { raiseAmount: 1000000, postMoneyValuation: 5000000 },
    };
    mockCreate.mockResolvedValue({ id: "scenario-1", inputs });

    const res = await POST(postReq({ inputs }), params());
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inputs }) }));
  });
});
