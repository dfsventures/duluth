import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 45, WS148 (F152) — update create/edit must refuse a metricDefinitionId
// that belongs to another company. Mocked db/auth/email, synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendUpdatePublishedEmail: vi.fn() }));
vi.mock("@/lib/publish-update", () => ({ publishUpdate: vi.fn() }));

const defFindMany = vi.fn();
const updateCreate = vi.fn();
const updateUpdate = vi.fn();
const updateFindUnique = vi.fn();
const updateFindUniqueOrThrow = vi.fn();
const valueCreateMany = vi.fn();
const valueDeleteMany = vi.fn();
const tx = {
  update: { create: updateCreate, update: updateUpdate, findUniqueOrThrow: updateFindUniqueOrThrow },
  metricValue: { createMany: valueCreateMany, deleteMany: valueDeleteMany },
};
vi.mock("@/lib/db", () => ({
  db: {
    metricDefinition: { findMany: (...a: unknown[]) => defFindMany(...a) },
    update: { findUnique: (...a: unknown[]) => updateFindUnique(...a) },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

import { requireCompanyAccess } from "@/lib/auth-guard";
import { POST } from "@/app/api/companies/[id]/updates/route";
import { PATCH } from "@/app/api/updates/[id]/route";

const access = vi.mocked(requireCompanyAccess);
const FOUNDER = { id: "u1", roles: ["FOUNDER"] };
const ADMIN = { id: "a1", roles: ["ADMIN"] };

const json = (body: unknown) =>
  new Request("https://x.test/api", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue({ user: FOUNDER, error: null } as any);
  updateCreate.mockResolvedValue({ id: "up1" });
  updateFindUnique.mockResolvedValue({ id: "up1", companyId: "co-A", status: "DRAFT", sentAt: null, metricValues: [] });
  updateFindUniqueOrThrow.mockResolvedValue({ id: "up1" });
});

const metrics = (id: string) => [{ metricDefinitionId: id, value: 5, date: "2025-01-01" }];
const createBody = (m: unknown) => ({ period: "2025-Q1", title: "T", body: "B", status: "DRAFT", metrics: m });

describe("POST /api/companies/[id]/updates", () => {
  it("400s a definition from another company and writes nothing", async () => {
    defFindMany.mockResolvedValue([{ id: "d-B", companyId: "co-B" }]);
    const res = await POST(json(createBody(metrics("d-B"))), { params: Promise.resolve({ id: "co-A" }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("That metric belongs to another company.");
    expect(updateCreate).not.toHaveBeenCalled();
    expect(valueCreateMany).not.toHaveBeenCalled();
  });
  it("400s an unknown definition id", async () => {
    defFindMany.mockResolvedValue([]);
    const res = await POST(json(createBody(metrics("nope"))), { params: Promise.resolve({ id: "co-A" }) });
    expect(res.status).toBe(400);
  });
  it("accepts the company's own definition; founders record no enteredById", async () => {
    defFindMany.mockResolvedValue([{ id: "d-A", companyId: "co-A" }]);
    const res = await POST(json(createBody(metrics("d-A"))), { params: Promise.resolve({ id: "co-A" }) });
    expect(res.status).toBe(201);
    expect(valueCreateMany.mock.calls[0][0].data[0]).not.toHaveProperty("enteredById");
  });
  it("records enteredById for an admin", async () => {
    access.mockResolvedValue({ user: ADMIN, error: null } as any);
    defFindMany.mockResolvedValue([{ id: "d-A", companyId: "co-A" }]);
    await POST(json(createBody(metrics("d-A"))), { params: Promise.resolve({ id: "co-A" }) });
    expect(valueCreateMany.mock.calls[0][0].data[0].enteredById).toBe("a1");
  });
  it("does not look up definitions when there are no metrics", async () => {
    const res = await POST(json(createBody(undefined)), { params: Promise.resolve({ id: "co-A" }) });
    expect(res.status).toBe(201);
    expect(defFindMany).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/updates/[id]", () => {
  const patch = (m: unknown) => json({ metricValues: m });
  it("400s a definition from another company and replaces nothing", async () => {
    defFindMany.mockResolvedValue([{ id: "d-B", companyId: "co-B" }]);
    const res = await PATCH(patch(metrics("d-B")), { params: Promise.resolve({ id: "up1" }) });
    expect(res.status).toBe(400);
    expect(valueDeleteMany).not.toHaveBeenCalled();
    expect(valueCreateMany).not.toHaveBeenCalled();
  });
  it("accepts the company's own definition", async () => {
    defFindMany.mockResolvedValue([{ id: "d-A", companyId: "co-A" }]);
    const res = await PATCH(patch(metrics("d-A")), { params: Promise.resolve({ id: "up1" }) });
    expect(res.status).toBe(200);
    expect(valueDeleteMany).toHaveBeenCalled();
    expect(valueCreateMany.mock.calls[0][0].data[0]).not.toHaveProperty("enteredById");
  });
  it("stores admin edits as admin-entered (JC-FU-K)", async () => {
    access.mockResolvedValue({ user: ADMIN, error: null } as any);
    defFindMany.mockResolvedValue([{ id: "d-A", companyId: "co-A" }]);
    await PATCH(patch(metrics("d-A")), { params: Promise.resolve({ id: "up1" }) });
    expect(valueCreateMany.mock.calls[0][0].data[0].enteredById).toBe("a1");
  });
});
