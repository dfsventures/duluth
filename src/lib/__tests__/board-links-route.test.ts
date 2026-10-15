import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn() }));

const dbMock = vi.hoisted(() => ({
  boardCard: { findUnique: vi.fn() },
  boardCardLink: { count: vi.fn(), create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { POST } from "@/app/api/admin/board/cards/[id]/links/route";
import { DELETE } from "@/app/api/admin/board/cards/[id]/links/[linkId]/route";

const ADMIN = { id: "a1", email: "admin@example.com", roles: ["ADMIN"] };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ctx2 = (id: string, linkId: string) => ({ params: Promise.resolve({ id, linkId }) });
const post = (body: unknown) =>
  new Request("https://molly.dfs.vc/x", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, error: null } as never);
  dbMock.boardCard.findUnique.mockResolvedValue({ id: "c1" });
  dbMock.boardCardLink.count.mockResolvedValue(0);
  dbMock.boardCardLink.create.mockImplementation(async ({ data }: any) => ({ id: "l1", createdAt: new Date(), ...data }));
});

describe("POST links", () => {
  it("requires admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as never);
    const res = await POST(post({ url: "https://example.com" }), ctx("c1"));
    expect(res.status).toBe(403);
    expect(dbMock.boardCardLink.create).not.toHaveBeenCalled();
  });
  it("creates a link and audits the host only", async () => {
    const res = await POST(post({ url: "https://www.example.com/secret?token=abc", label: " Spec " }), ctx("c1"));
    expect(res.status).toBe(201);
    expect(dbMock.boardCardLink.create.mock.calls[0][0].data).toMatchObject({ cardId: "c1", label: "Spec", addedById: "a1" });
    const [, action, opts] = vi.mocked(logAdminAction).mock.calls[0] as any;
    expect(action).toBe("BOARD_CARD_LINK_ADDED");
    expect(opts.metadata).toEqual({ cardId: "c1", host: "example.com" });
    expect(JSON.stringify(opts)).not.toContain("token");
  });
  it("rejects javascript:, data: and ftp urls", async () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "ftp://example.com"]) {
      expect((await POST(post({ url }), ctx("c1"))).status).toBe(400);
    }
    expect(dbMock.boardCardLink.create).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });
  it("rejects urls over 2000 chars and labels over 120", async () => {
    expect((await POST(post({ url: "https://example.com/" + "a".repeat(2000) }), ctx("c1"))).status).toBe(400);
    expect((await POST(post({ url: "https://example.com", label: "x".repeat(121) }), ctx("c1"))).status).toBe(400);
  });
  it("enforces the 10-link cap", async () => {
    dbMock.boardCardLink.count.mockResolvedValue(10);
    const res = await POST(post({ url: "https://example.com" }), ctx("c1"));
    expect(res.status).toBe(400);
    expect(dbMock.boardCardLink.create).not.toHaveBeenCalled();
    dbMock.boardCardLink.count.mockResolvedValue(9);
    expect((await POST(post({ url: "https://example.com" }), ctx("c1"))).status).toBe(201);
  });
  it("404s for an unknown card", async () => {
    dbMock.boardCard.findUnique.mockResolvedValue(null);
    expect((await POST(post({ url: "https://example.com" }), ctx("nope"))).status).toBe(404);
  });
});

describe("DELETE link", () => {
  const del = () => new Request("https://molly.dfs.vc/x", { method: "DELETE" });
  it("requires admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as never);
    expect((await DELETE(del(), ctx2("c1", "l1"))).status).toBe(401);
    expect(dbMock.boardCardLink.delete).not.toHaveBeenCalled();
  });
  it("removes and audits", async () => {
    dbMock.boardCardLink.findUnique.mockResolvedValue({ id: "l1", cardId: "c1", url: "https://docs.example.com/x" });
    const res = await DELETE(del(), ctx2("c1", "l1"));
    expect(res.status).toBe(200);
    const [, action, opts] = vi.mocked(logAdminAction).mock.calls[0] as any;
    expect(action).toBe("BOARD_CARD_LINK_REMOVED");
    expect(opts.metadata).toEqual({ cardId: "c1", host: "docs.example.com" });
  });
  it("404s when the link belongs to another card", async () => {
    dbMock.boardCardLink.findUnique.mockResolvedValue({ id: "l1", cardId: "other", url: "https://example.com" });
    expect((await DELETE(del(), ctx2("c1", "l1"))).status).toBe(404);
    expect(dbMock.boardCardLink.delete).not.toHaveBeenCalled();
  });
});
