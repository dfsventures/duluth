import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 30, WS70.3 — POST /api/admin/portfolio-companies/contacts/import.
// Mocked db/auth/audit, synthetic data only (JC-BC-J), in the
// admin-diligence-route.test.ts style.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const mockPortfolioCompanyFindMany = vi.fn();
const mockPortfolioCompanyFindUnique = vi.fn();
const mockContactFindUnique = vi.fn();
const mockContactCreate = vi.fn();
const mockContactUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    portfolioCompany: {
      findMany: (...args: unknown[]) => mockPortfolioCompanyFindMany(...args),
      findUnique: (...args: unknown[]) => mockPortfolioCompanyFindUnique(...args),
    },
    portfolioCompanyContact: {
      findUnique: (...args: unknown[]) => mockContactFindUnique(...args),
      create: (...args: unknown[]) => mockContactCreate(...args),
      update: (...args: unknown[]) => mockContactUpdate(...args),
    },
  },
}));

import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { POST } from "@/app/api/admin/portfolio-companies/contacts/import/route";

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockLogAdminAction = vi.mocked(logAdminAction);

const ADMIN = { id: "admin-1", email: "admin@dfs.vc" };

const COMPANIES = [
  { id: "pc-1", name: "Acme" },
  { id: "pc-2", name: "Northwind" },
  { id: "pc-3", name: "Globex" },
];

function req(body: unknown) {
  return new Request("https://molly.dfslab.net/api/admin/portfolio-companies/contacts/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Simple in-memory contact store keyed by "portfolioCompanyId:email" so
// findUnique/create/update behave like a real upsert across rows in one
// call, including within-file duplicates.
let contactStore: Map<string, { id: string; portfolioCompanyId: string; email: string; name: string | null; role: string | null }>;

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockLogAdminAction.mockReset();
  mockPortfolioCompanyFindMany.mockReset();
  mockPortfolioCompanyFindUnique.mockReset();
  mockContactFindUnique.mockReset();
  mockContactCreate.mockReset();
  mockContactUpdate.mockReset();

  mockRequireAdmin.mockResolvedValue({ user: ADMIN, error: null } as any);
  mockPortfolioCompanyFindMany.mockResolvedValue(COMPANIES);
  mockPortfolioCompanyFindUnique.mockImplementation(({ where }: any) =>
    Promise.resolve(COMPANIES.find((c) => c.id === where.id) ?? null)
  );

  contactStore = new Map();
  let nextId = 1;
  mockContactFindUnique.mockImplementation(({ where }: any) => {
    const key = `${where.portfolioCompanyId_email.portfolioCompanyId}:${where.portfolioCompanyId_email.email}`;
    return Promise.resolve(contactStore.get(key) ?? null);
  });
  mockContactCreate.mockImplementation(({ data }: any) => {
    const row = { id: `contact-${nextId++}`, name: null, role: null, ...data };
    contactStore.set(`${data.portfolioCompanyId}:${data.email}`, row);
    return Promise.resolve(row);
  });
  mockContactUpdate.mockImplementation(({ where, data }: any) => {
    const existing = [...contactStore.values()].find((c) => c.id === where.id)!;
    const updated = { ...existing, ...data };
    contactStore.set(`${updated.portfolioCompanyId}:${updated.email}`, updated);
    return Promise.resolve(updated);
  });
});

describe("POST /api/admin/portfolio-companies/contacts/import", () => {
  it("writes contacts to three different companies in one call", async () => {
    const res = await POST(
      req({
        contacts: [
          { row: 1, company: "Acme", name: "Jane", email: "jane@acme.com", role: "CEO" },
          { row: 2, company: "Northwind", name: "Bob", email: "bob@northwind.com" },
          { row: 3, company: "Globex", name: "Sue", email: "sue@globex.com" },
        ],
      })
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.created).toBe(3);
    expect(data.updated).toBe(0);
    expect(data.errors).toEqual([]);
    expect(contactStore.size).toBe(3);
  });

  it("re-uploading the same rows yields created: 0, updated: N with no duplicates or errors", async () => {
    const rows = [{ row: 1, company: "Acme", name: "Jane", email: "jane@acme.com", role: "CEO" }];
    await POST(req({ contacts: rows }));
    const res = await POST(req({ contacts: rows }));
    const data = await res.json();
    expect(data.created).toBe(0);
    expect(data.updated).toBe(1);
    expect(data.errors).toEqual([]);
    expect(contactStore.size).toBe(1);
  });

  it("a blank role cell on re-upload leaves the existing role untouched", async () => {
    await POST(req({ contacts: [{ row: 1, company: "Acme", name: "Jane", email: "jane@acme.com", role: "CEO" }] }));
    await POST(req({ contacts: [{ row: 1, company: "Acme", name: "Jane", email: "jane@acme.com", role: "" }] }));
    const stored = contactStore.get("pc-1:jane@acme.com")!;
    expect(stored.role).toBe("CEO");
  });

  it("skips and reports an unmatched company without creating a PortfolioCompany", async () => {
    const res = await POST(
      req({ contacts: [{ row: 1, company: "Ghost Corp", name: "Jane", email: "jane@ghost.com" }] })
    );
    const data = await res.json();
    expect(data.skipped).toBe(1);
    expect(data.unmatchedCompanies).toEqual(["Ghost Corp"]);
    expect(data.errors[0]).toMatch(/Ghost Corp/);
    expect(mockContactCreate).not.toHaveBeenCalled();
    // No portfolioCompany.create/upsert call exists anywhere in the route at all.
  });

  it("an invalid email is a row-level error naming its row; other rows still land; status 200", async () => {
    const res = await POST(
      req({
        contacts: [
          { row: 1, company: "Acme", name: "Jane", email: "not-an-email" },
          { row: 2, company: "Acme", name: "Bob", email: "bob@acme.com" },
        ],
      })
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.errors[0]).toMatch(/Row 1/);
    expect(data.created).toBe(1);
    expect(data.skipped).toBe(1);
  });

  it("matches company names case- and whitespace-insensitively", async () => {
    const res = await POST(req({ contacts: [{ row: 1, company: "  acme  ", email: "jane@acme.com" }] }));
    const data = await res.json();
    expect(data.created).toBe(1);
    expect(data.errors).toEqual([]);
  });

  it("with defaultPortfolioCompanyId, a blank company cell resolves to it", async () => {
    const res = await POST(
      req({ contacts: [{ row: 1, email: "jane@acme.com", name: "Jane" }], defaultPortfolioCompanyId: "pc-1" })
    );
    const data = await res.json();
    expect(data.created).toBe(1);
    expect(contactStore.get("pc-1:jane@acme.com")).toBeTruthy();
  });

  it("with defaultPortfolioCompanyId, a row naming a different company is a row-level error", async () => {
    const res = await POST(
      req({
        contacts: [{ row: 1, company: "Northwind", email: "jane@acme.com" }],
        defaultPortfolioCompanyId: "pc-1",
      })
    );
    const data = await res.json();
    expect(data.skipped).toBe(1);
    expect(data.errors[0]).toMatch(/Northwind/);
    expect(data.errors[0]).toMatch(/portfolio-wide import/);
    expect(mockContactCreate).not.toHaveBeenCalled();
  });

  it("without defaultPortfolioCompanyId, a blank company cell is a row-level error", async () => {
    const res = await POST(req({ contacts: [{ row: 1, email: "jane@acme.com" }] }));
    const data = await res.json();
    expect(data.skipped).toBe(1);
    expect(data.errors[0]).toMatch(/no company named/);
  });

  it("rejects an empty array with 400 and writes nothing", async () => {
    const res = await POST(req({ contacts: [] }));
    expect(res.status).toBe(400);
    expect(mockContactCreate).not.toHaveBeenCalled();
  });

  it("rejects more than 1000 rows with 400 and writes nothing", async () => {
    const contacts = Array.from({ length: 1001 }, (_, i) => ({ row: i + 1, company: "Acme", email: `p${i}@acme.com` }));
    const res = await POST(req({ contacts }));
    expect(res.status).toBe(400);
    expect(mockContactCreate).not.toHaveBeenCalled();
  });

  it("writes a PORTCO_CONTACTS_IMPORTED audit row carrying all five counters", async () => {
    await POST(
      req({
        contacts: [
          { row: 1, company: "Acme", email: "jane@acme.com" },
          { row: 2, company: "Ghost Corp", email: "x@ghost.com" },
        ],
      })
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      ADMIN,
      "PORTCO_CONTACTS_IMPORTED",
      expect.objectContaining({
        metadata: expect.objectContaining({
          created: expect.any(Number),
          updated: expect.any(Number),
          skipped: expect.any(Number),
          errorCount: expect.any(Number),
          unmatchedCount: expect.any(Number),
          scope: "PORTFOLIO",
        }),
      })
    );
  });
});
