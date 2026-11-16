import { describe, it, expect, vi, beforeEach } from "vitest";

// Editing Marge-filed updates any time (admin) and keeping figure provenance.
// Mocked db/auth/publish, synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendUpdatePublishedEmail: vi.fn() }));
vi.mock("@/lib/publish-update", () => ({ publishUpdate: vi.fn() }));

const defFindMany = vi.fn();
const updateUpdate = vi.fn();
const updateFindUnique = vi.fn();
const updateFindUniqueOrThrow = vi.fn();
const valueCreateMany = vi.fn();
const valueDeleteMany = vi.fn();
const valueFindMany = vi.fn();
const tx = {
  update: { update: updateUpdate, findUniqueOrThrow: updateFindUniqueOrThrow },
  metricValue: { createMany: valueCreateMany, deleteMany: valueDeleteMany, findMany: valueFindMany },
};
vi.mock("@/lib/db", () => ({
  db: {
    metricDefinition: { findMany: (...a: unknown[]) => defFindMany(...a) },
    update: { findUnique: (...a: unknown[]) => updateFindUnique(...a) },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

import { requireCompanyAccess } from "@/lib/auth-guard";
import { publishUpdate } from "@/lib/publish-update";
import { sendUpdatePublishedEmail } from "@/lib/email";
import { PATCH } from "@/app/api/updates/[id]/route";
import { canEditUpdate, carryProvenance } from "@/lib/update-edit-rules";

const access = vi.mocked(requireCompanyAccess);
const FOUNDER = { id: "u1", roles: ["FOUNDER"] };
const ADMIN = { id: "a1", roles: ["ADMIN"] };
const OLD = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

const req = (body: unknown) =>
  new Request("https://x.test/api", { method: "PATCH", body: JSON.stringify(body) });
const call = (body: unknown) => PATCH(req(body), { params: Promise.resolve({ id: "up1" }) });

const sent = (source: string) => ({ companyId: "co-A", status: "SENT", sentAt: OLD, source });

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue({ user: ADMIN, error: null } as any);
  updateFindUnique.mockResolvedValue(sent("EMAIL_VIA_MARGE"));
  updateUpdate.mockResolvedValue({ id: "up1" });
  updateFindUniqueOrThrow.mockResolvedValue({ id: "up1" });
  defFindMany.mockResolvedValue([{ id: "d-A", companyId: "co-A" }]);
  valueFindMany.mockResolvedValue([]);
});

describe("PATCH edit window", () => {
  it("lets an admin edit an old SENT Marge update", async () => {
    const res = await call({ title: "New title" });
    expect(res.status).toBe(200);
    expect(updateUpdate).toHaveBeenCalled();
  });
  it("refuses a non-admin on an old SENT Marge update", async () => {
    access.mockResolvedValue({ user: FOUNDER, error: null } as any);
    const res = await call({ title: "New title" });
    expect(res.status).toBe(403);
    expect(updateUpdate).not.toHaveBeenCalled();
  });
  it("still refuses an admin on an old SENT non-Marge update", async () => {
    updateFindUnique.mockResolvedValue(sent("FOUNDER"));
    const res = await call({ title: "New title" });
    expect(res.status).toBe(403);
    expect(updateUpdate).not.toHaveBeenCalled();
  });
  it("sends no email, publishes nothing, and does not touch sentAt/source/sourceRef/filedAt", async () => {
    await call({ title: "New title", status: "SENT", metricValues: [{ metricDefinitionId: "d-A", value: 5, date: "2025-01-01" }] });
    expect(publishUpdate).not.toHaveBeenCalled();
    expect(sendUpdatePublishedEmail).not.toHaveBeenCalled();
    const data = updateUpdate.mock.calls[0][0].data;
    for (const k of ["sentAt", "source", "sourceRef", "filedAt"]) expect(data).not.toHaveProperty(k);
  });
});

describe("PATCH figure provenance", () => {
  const oldFigure = {
    metricDefinitionId: "d-A",
    value: "5",
    date: new Date("2025-01-01T00:00:00Z"),
    via: "marge",
    quote: "revenue was 5k",
    enteredById: "a-other",
    origin: "attachment",
  };
  it("keeps via/quote/enteredById/origin on an unchanged figure", async () => {
    valueFindMany.mockResolvedValue([oldFigure]);
    await call({ metricValues: [{ metricDefinitionId: "d-A", value: 5, date: "2025-01-01" }] });
    const row = valueCreateMany.mock.calls[0][0].data[0];
    expect(row).toMatchObject({ via: "marge", quote: "revenue was 5k", enteredById: "a-other", origin: "attachment" });
  });
  it("drops the tag on a changed value; the admin becomes the enterer", async () => {
    valueFindMany.mockResolvedValue([oldFigure]);
    await call({ metricValues: [{ metricDefinitionId: "d-A", value: 6, date: "2025-01-01" }] });
    const row = valueCreateMany.mock.calls[0][0].data[0];
    expect(row.enteredById).toBe("a1");
    for (const k of ["via", "quote", "origin"]) expect(row).not.toHaveProperty(k);
  });
  it("drops the tag on a changed date", async () => {
    valueFindMany.mockResolvedValue([oldFigure]);
    await call({ metricValues: [{ metricDefinitionId: "d-A", value: 5, date: "2025-02-01" }] });
    expect(valueCreateMany.mock.calls[0][0].data[0]).not.toHaveProperty("via");
  });
});

describe("update-edit-rules helpers", () => {
  it("canEditUpdate", () => {
    const now = Date.now();
    expect(canEditUpdate({ status: "DRAFT", sentAt: null }, false)).toBe(true);
    expect(canEditUpdate({ status: "SENT", sentAt: OLD, source: "EMAIL_VIA_MARGE" }, true, now)).toBe(true);
    expect(canEditUpdate({ status: "SENT", sentAt: OLD, source: "EMAIL_VIA_MARGE" }, false, now)).toBe(false);
    expect(canEditUpdate({ status: "SENT", sentAt: OLD, source: "FOUNDER" }, true, now)).toBe(false);
    expect(canEditUpdate({ status: "SENT", sentAt: new Date(now - 1000), source: "FOUNDER" }, false, now)).toBe(true);
  });
  it("carryProvenance gives a non-admin editor a null enteredById", () => {
    const out = carryProvenance([], [{ metricDefinitionId: "d", value: 1, date: new Date("2025-01-01") }], null);
    expect(out[0]).toEqual({ via: null, quote: null, enteredById: null, origin: null });
  });
});
