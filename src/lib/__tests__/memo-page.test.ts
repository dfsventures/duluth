import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 40 (WS127): the server page for one memo. It is the only place the app renders memo
// markdown, so this is where "script and HTML are neutralised in the app" is proved end to end.

const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth }));
const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock("next/navigation", () => nav);
const m = vi.hoisted(() => ({
  memo: { findFirst: vi.fn() },
  company: { findMany: vi.fn() },
  memoTemplate: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: m }));
vi.mock("../../app/admin/memos/[id]/memo-client", () => ({ default: () => null }));

import MemoPage from "@/app/admin/memos/[id]/page";
import { ADMIN_NAV_GROUPS } from "@/lib/admin-nav";

const memoRow = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  title: "Acme: seed",
  status: "DRAFT",
  visibility: "PRIVATE",
  ownerId: "u1",
  draftedByMarge: false,
  source: null,
  tags: [],
  introDate: new Date("2026-10-01T00:00:00.000Z"),
  websiteUrl: null,
  introCalls: [{ label: "Call", url: "javascript:alert(1)" }],
  version: 1,
  updatedAt: new Date("2026-10-20T10:00:00.000Z"),
  companyNamePending: null,
  company: null,
  owner: { id: "u1", name: "Sam Partner", email: "admin@example.com" },
  sections: [
    {
      key: "team",
      title: "Team",
      markdown: [
        "Jane Founder <script>alert(1)</script>",
        "",
        "<img src=x onerror=alert(1)>",
        "",
        "[a](javascript:alert(1)) [b](data:text/html;base64,AAAA) [c](https://example.com)",
        "",
        "| a | b |\n|---|---|\n| <iframe src=x></iframe> | ok |",
      ].join("\n"),
      citations: [{ label: "Bad", kind: "web", url: "javascript:alert(1)" }, { label: "Good", kind: "web", url: "https://example.com" }],
      includeInShare: true,
      version: 2,
    },
  ],
  ...over,
});

const session = (id: string) => ({ user: { id, roles: ["ADMIN"], status: "APPROVED" } });
const call = (id = "m1") => MemoPage({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue(session("u1"));
  m.memo.findFirst.mockResolvedValue(memoRow());
  m.company.findMany.mockResolvedValue([]);
  m.memoTemplate.findFirst.mockResolvedValue(null);
});

describe("the memo page", () => {
  it("looks the memo up through memoVisibleWhere for the signed-in admin", async () => {
    await call();
    const where = m.memo.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ id: "m1", archivedAt: null, OR: [{ ownerId: "u1" }, { visibility: "TEAM" }] });
  });

  it("is notFound for a memo the admin may not see (private memo of another admin, archived, unknown)", async () => {
    auth.mockResolvedValue(session("u2"));
    m.memo.findFirst.mockResolvedValue(null);
    await expect(call()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(m.memo.findFirst.mock.calls[0][0].where.OR).toEqual([{ ownerId: "u2" }, { visibility: "TEAM" }]);
  });

  it("sends signed-out users, founders and unapproved admins to /login before any query", async () => {
    for (const s of [null, { user: { id: "f1", roles: ["FOUNDER"], status: "APPROVED" } }, { user: { id: "a1", roles: ["ADMIN"], status: "PENDING" } }]) {
      auth.mockResolvedValue(s);
      await expect(call()).rejects.toThrow("NEXT_REDIRECT:/login");
    }
    expect(m.memo.findFirst).not.toHaveBeenCalled();
  });

  it("hands the client sanitized HTML: no script, img, iframe, handler, javascript: or data: link", async () => {
    const el = (await call()) as unknown as { props: { memo: { sections: { html: string; citations: { url?: string }[] }[]; introCalls: { url?: string }[]; canEdit: boolean; canManage: boolean } } };
    const { html } = el.props.memo.sections[0];
    expect(html).not.toMatch(/<script|<img|<iframe|<style|<svg/i);
    expect(html).not.toMatch(/href="(javascript|data):/i);
    expect(html).not.toMatch(/<[^>]*\sonerror=/i); // visible as escaped text is fine; inside a tag is not
    expect(html).toContain("&lt;script&gt;"); // shown as text instead
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("<table>");
    // stored Json is validated on read: a javascript: citation or intro-call link never reaches an href
    expect(el.props.memo.sections[0].citations.map((c) => c.url)).toEqual(["https://example.com"]);
    expect(el.props.memo.sections[0].citations).toHaveLength(1); // the javascript: citation was dropped
    expect(el.props.memo.introCalls).toEqual([]); // so was the javascript: intro call
    expect(el.props.memo.canEdit).toBe(true);
    expect(el.props.memo.canManage).toBe(true);
  });

  it("another admin on a team memo can edit but not manage", async () => {
    auth.mockResolvedValue(session("u2"));
    m.memo.findFirst.mockResolvedValue(memoRow({ visibility: "TEAM" }));
    const el = (await call()) as unknown as { props: { memo: { canEdit: boolean; canManage: boolean } } };
    expect(el.props.memo.canEdit).toBe(true);
    expect(el.props.memo.canManage).toBe(false);
  });

  it("empty sections carry the template guidance", async () => {
    m.memo.findFirst.mockResolvedValue(memoRow({ sections: [{ key: "key-risks", title: "Key Risks", markdown: "", citations: [], includeInShare: true, version: 1 }] }));
    const el = (await call()) as unknown as { props: { memo: { sections: { html: string; guidance: string | null }[] } } };
    expect(el.props.memo.sections[0].html).toBe("");
    expect(el.props.memo.sections[0].guidance).toMatch(/risks/i);
  });
});

describe("navigation", () => {
  it("has Memos under Company Operations with the g m shortcut", () => {
    const ops = ADMIN_NAV_GROUPS.find((g) => g.label === "Company Operations")!;
    expect(ops.items).toContainEqual(expect.objectContaining({ label: "Memos", href: "/admin/memos", goto: "m" }));
  });
});
