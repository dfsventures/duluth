import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 29, WS66 — GET/PATCH/DELETE /api/companies/[id]/scenarios/[scenarioId].
// Mocked db/auth-guard, synthetic data only. Covers the defense-in-depth
// companyId-mismatch check (WS55/F48-shaped IDOR guard).

vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn() }));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    capTableScenario: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

import { requireCompanyAccess } from "@/lib/auth-guard";
import { GET, PATCH, DELETE } from "@/app/api/companies/[id]/scenarios/[scenarioId]/route";

const mockRequireCompanyAccess = vi.mocked(requireCompanyAccess);

function params(id = "company-1", scenarioId = "scenario-1") {
  return { params: Promise.resolve({ id, scenarioId }) };
}

function getReq() {
  return new Request("https://molly.dfslab.net/api/companies/company-1/scenarios/scenario-1");
}

function patchReq(body: unknown) {
  return new Request("https://molly.dfslab.net/api/companies/company-1/scenarios/scenario-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq() {
  return new Request("https://molly.dfslab.net/api/companies/company-1/scenarios/scenario-1", { method: "DELETE" });
}

const FOUNDER = { id: "founder-1", email: "founder@acme.com", name: "Founder Person", roles: ["FOUNDER"] };
const VALID_INPUTS = {
  founders: [{ name: "Jane Founder" }],
  esopPct: 10,
  friendsAndFamily: [],
  preSeed: [],
};

beforeEach(() => {
  mockRequireCompanyAccess.mockReset();
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as any);
});

describe("GET /api/companies/[id]/scenarios/[scenarioId]", () => {
  it("403s a founder who isn't a member of the company", async () => {
    const forbidden = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    mockRequireCompanyAccess.mockResolvedValue({ user: null, error: forbidden } as any);

    const res = await GET(getReq(), params());
    expect(res.status).toBe(403);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("404s when the scenario doesn't exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await GET(getReq(), params());
    expect(res.status).toBe(404);
  });

  it("404s when the scenario belongs to a different company (IDOR guard)", async () => {
    mockFindUnique.mockResolvedValue({ id: "scenario-1", companyId: "some-other-company", inputs: VALID_INPUTS });
    const res = await GET(getReq(), params("company-1", "scenario-1"));
    expect(res.status).toBe(404);
  });

  it("round-trips inputs byte-identically", async () => {
    mockFindUnique.mockResolvedValue({
      id: "scenario-1",
      companyId: "company-1",
      name: "Base case",
      inputs: VALID_INPUTS,
      schemaVersion: 1,
    });
    const res = await GET(getReq(), params());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.inputs).toEqual(VALID_INPUTS);
  });
});

describe("PATCH /api/companies/[id]/scenarios/[scenarioId]", () => {
  it("403s a founder who isn't a member of the company", async () => {
    const forbidden = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    mockRequireCompanyAccess.mockResolvedValue({ user: null, error: forbidden } as any);

    const res = await PATCH(patchReq({ name: "Optimistic seed" }), params());
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("404s when the scenario belongs to a different company (IDOR guard)", async () => {
    mockFindUnique.mockResolvedValue({ id: "scenario-1", companyId: "some-other-company" });
    const res = await PATCH(patchReq({ name: "Optimistic seed" }), params());
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a body with no valid fields", async () => {
    mockFindUnique.mockResolvedValue({ id: "scenario-1", companyId: "company-1" });
    const res = await PATCH(patchReq({}), params());
    expect(res.status).toBe(400);
  });

  it("rejects an empty name", async () => {
    mockFindUnique.mockResolvedValue({ id: "scenario-1", companyId: "company-1" });
    const res = await PATCH(patchReq({ name: "   " }), params());
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects malformed inputs (esopPct out of range) with 400, not stored", async () => {
    mockFindUnique.mockResolvedValue({ id: "scenario-1", companyId: "company-1" });
    const res = await PATCH(
      patchReq({ inputs: { ...VALID_INPUTS, esopPct: -5 } }),
      params()
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates name and inputs together", async () => {
    mockFindUnique.mockResolvedValue({ id: "scenario-1", companyId: "company-1" });
    mockUpdate.mockResolvedValue({ id: "scenario-1", name: "Optimistic seed", inputs: VALID_INPUTS });

    const res = await PATCH(patchReq({ name: "Optimistic seed", inputs: VALID_INPUTS }), params());
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "scenario-1" },
      data: { name: "Optimistic seed", inputs: VALID_INPUTS },
    });
  });
});

describe("DELETE /api/companies/[id]/scenarios/[scenarioId]", () => {
  it("403s a founder who isn't a member of the company", async () => {
    const forbidden = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    mockRequireCompanyAccess.mockResolvedValue({ user: null, error: forbidden } as any);

    const res = await DELETE(deleteReq(), params());
    expect(res.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("404s when the scenario belongs to a different company (IDOR guard)", async () => {
    mockFindUnique.mockResolvedValue({ id: "scenario-1", companyId: "some-other-company" });
    const res = await DELETE(deleteReq(), params());
    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes the scenario when it belongs to the company", async () => {
    mockFindUnique.mockResolvedValue({ id: "scenario-1", companyId: "company-1" });
    const res = await DELETE(deleteReq(), params());
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "scenario-1" } });
  });
});
