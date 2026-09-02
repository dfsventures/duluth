import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 25/32, WS55 (F48/F71) — GET /api/updates/[id]/pdf must scope access to
// the update's own company via requireCompanyAccess, not just requireAuth().
// Reproduces the IDOR: a founder from Company A must not be able to fetch
// Company B's update PDF. Mocked db/auth-guard/pdf, synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn() }));

const mockFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    update: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

const mockGenerateUpdateHTML = vi.fn();
vi.mock("@/lib/pdf", () => ({
  generateUpdateHTML: (...args: unknown[]) => mockGenerateUpdateHTML(...args),
}));

import { requireCompanyAccess } from "@/lib/auth-guard";
import { GET } from "@/app/api/updates/[id]/pdf/route";

const mockRequireCompanyAccess = vi.mocked(requireCompanyAccess);

function params(id = "update-1") {
  return { params: Promise.resolve({ id }) };
}

function req() {
  return new Request("https://molly.dfslab.net/api/updates/update-1/pdf");
}

const FOUNDER = { id: "founder-1", email: "founder@acme.com", name: "Founder Person", roles: ["FOUNDER"] };

beforeEach(() => {
  mockRequireCompanyAccess.mockReset();
  mockFindUnique.mockReset();
  mockGenerateUpdateHTML.mockReset();
  mockRequireCompanyAccess.mockResolvedValue({ user: FOUNDER, error: null } as any);
});

describe("GET /api/updates/[id]/pdf", () => {
  it("404s when the update doesn't exist (checked before access)", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await GET(req(), params());
    expect(res.status).toBe(404);
    expect(mockRequireCompanyAccess).not.toHaveBeenCalled();
  });

  it("403s a founder who is not a member of the update's company (IDOR guard, F48/F71)", async () => {
    mockFindUnique.mockResolvedValue({ companyId: "company-B" });
    const forbidden = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    mockRequireCompanyAccess.mockResolvedValue({ user: null, error: forbidden } as any);

    const res = await GET(req(), params());

    expect(mockRequireCompanyAccess).toHaveBeenCalledWith("company-B");
    expect(res.status).toBe(403);
    expect(mockGenerateUpdateHTML).not.toHaveBeenCalled();
  });

  it("serves the PDF HTML to a member of the update's own company", async () => {
    mockFindUnique.mockResolvedValue({ companyId: "company-A" });
    mockGenerateUpdateHTML.mockResolvedValue("<html>update</html>");

    const res = await GET(req(), params());

    expect(mockRequireCompanyAccess).toHaveBeenCalledWith("company-A");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>update</html>");
  });

  it("still 500s cleanly when HTML generation fails", async () => {
    mockFindUnique.mockResolvedValue({ companyId: "company-A" });
    mockGenerateUpdateHTML.mockResolvedValue(null);

    const res = await GET(req(), params());
    expect(res.status).toBe(500);
  });
});
