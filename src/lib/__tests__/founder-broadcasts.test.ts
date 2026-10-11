import { describe, it, expect, vi, beforeEach } from "vitest";

// Founder read-only broadcast view: scoping, authz, sanitizing. Synthetic data only.

vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn() }));

type Where = { id?: string; status: string; targets: { some: { portfolioCompany: { companyId: string } } } };

// Fake table. Each broadcast lists the Company ids it is targeted at (via portfolio companies).
const rows = [
  { id: "b-x", subject: "For X", body: "<p>x</p>", status: "PUBLISHED", publishedAt: new Date("2026-02-01"), companyIds: ["cx"] },
  { id: "b-y", subject: "For Y only", body: "<p>y</p>", status: "PUBLISHED", publishedAt: new Date("2026-03-01"), companyIds: ["cy"] },
  { id: "b-xy", subject: "For both", body: "<p>xy</p><script>alert(1)</script>", status: "PUBLISHED", publishedAt: new Date("2026-04-01"), companyIds: ["cx", "cy"] },
  { id: "b-draft", subject: "Draft", body: "<p>d</p>", status: "DRAFT", publishedAt: null, companyIds: ["cx"] },
];

function matches(r: (typeof rows)[number], where: Where) {
  return (
    r.status === where.status &&
    r.companyIds.includes(where.targets.some.portfolioCompany.companyId) &&
    (where.id === undefined || r.id === where.id)
  );
}

const findMany = vi.fn(async (args: { where: Where; select: Record<string, boolean>; take?: number }) => {
  let out = rows.filter((r) => matches(r, args.where)).sort((a, b) => +b.publishedAt! - +a.publishedAt!);
  if (args.take) out = out.slice(0, args.take);
  return out.map((r) => pick(r, args.select));
});
const findFirst = vi.fn(async (args: { where: Where; select: Record<string, boolean> }) => {
  const r = rows.find((row) => matches(row, args.where));
  return r ? pick(r, args.select) : null;
});
function pick(r: Record<string, unknown>, select: Record<string, boolean>) {
  return Object.fromEntries(Object.keys(select).map((k) => [k, r[k]]));
}

vi.mock("@/lib/db", () => ({
  db: { companyBroadcast: { findMany: (...a: never[]) => findMany(...(a as [never])), findFirst: (...a: never[]) => findFirst(...(a as [never])) } },
}));

import { requireCompanyAccess } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { GET as list } from "@/app/api/companies/[id]/dfs-messages/route";
import { GET as detail } from "@/app/api/companies/[id]/dfs-messages/[messageId]/route";
import { sanitizeBroadcastHtml } from "@/lib/broadcast-html";

const mockGuard = vi.mocked(requireCompanyAccess);

function allow() {
  mockGuard.mockResolvedValue({ user: { id: "u1" }, error: null } as never);
}
const listReq = (id: string, qs = "") =>
  list(new Request(`http://localhost/api/companies/${id}/dfs-messages${qs}`), { params: Promise.resolve({ id }) });
const detailReq = (id: string, messageId: string) =>
  detail(new Request("http://localhost/x"), { params: Promise.resolve({ id, messageId }) });

beforeEach(() => {
  vi.clearAllMocks();
  allow();
});

describe("GET /api/companies/[id]/dfs-messages", () => {
  it("returns published broadcasts targeted at the company, newest first", async () => {
    const res = await listReq("cx");
    const json = await res.json();
    expect(json.data.map((m: { id: string }) => m.id)).toEqual(["b-xy", "b-x"]);
  });

  it("does not show a broadcast targeted only at another company", async () => {
    const json = await (await listReq("cx")).json();
    expect(json.data.map((m: { id: string }) => m.id)).not.toContain("b-y");
  });

  it("hides drafts", async () => {
    const json = await (await listReq("cx")).json();
    expect(json.data.map((m: { id: string }) => m.id)).not.toContain("b-draft");
  });

  it("returns an empty list for a company with no linked broadcasts", async () => {
    const json = await (await listReq("c-unlinked")).json();
    expect(json.data).toEqual([]);
  });

  it("exposes only id, subject, publishedAt", async () => {
    const json = await (await listReq("cx")).json();
    expect(Object.keys(json.data[0]).sort()).toEqual(["id", "publishedAt", "subject"]);
  });

  it("honours ?limit", async () => {
    const json = await (await listReq("cx", "?limit=1")).json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe("b-xy");
  });

  it("returns the guard's error and never queries when access is denied", async () => {
    mockGuard.mockResolvedValue({ user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as never);
    const res = await listReq("cx");
    expect(res.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/companies/[id]/dfs-messages/[messageId]", () => {
  it("returns subject, publishedAt and a sanitized body only", async () => {
    const res = await detailReq("cx", "b-xy");
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual(["body", "id", "publishedAt", "subject"]);
    expect(json.body).not.toContain("<script");
    expect(json.body).toContain("<p>xy</p>");
  });

  it("404s for a broadcast targeted only at another company", async () => {
    expect((await detailReq("cx", "b-y")).status).toBe(404);
  });

  it("404s for a draft, even one targeted at the company", async () => {
    expect((await detailReq("cx", "b-draft")).status).toBe(404);
  });

  it("denies a non-member before querying", async () => {
    mockGuard.mockResolvedValue({ user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as never);
    expect((await detailReq("cy", "b-y")).status).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("sanitizeBroadcastHtml", () => {
  it("keeps TipTap formatting", () => {
    const html = '<h2>Hi</h2><p style="text-align: center"><strong>a</strong> <em>b</em> <u>c</u></p><ul><li>one</li></ul>';
    expect(sanitizeBroadcastHtml(html)).toBe(html);
  });
  it("drops scripts with content, event handlers and unknown tags", () => {
    const out = sanitizeBroadcastHtml('<p onclick="x()">a</p><script>alert(1)</script><iframe src="https://e.com"></iframe><blink>t</blink>');
    expect(out).toBe("<p>a</p>t");
  });
  it("blocks javascript: and data: URLs on links and images", () => {
    expect(sanitizeBroadcastHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeBroadcastHtml('<a href=" JaVa&#x73;cript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeBroadcastHtml('<img src="data:text/html;base64,AAA">')).toBe("");
  });
  it("forces safe link attributes and keeps https images", () => {
    expect(sanitizeBroadcastHtml('<a href="https://example.com/a?b=1&c=2" onmouseover="x">l</a>')).toBe(
      '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">l</a>'
    );
    expect(sanitizeBroadcastHtml('<img src="https://example.com/i.png" alt="pic" onerror="x">')).toBe(
      '<img src="https://example.com/i.png" alt="pic">'
    );
  });
  it("strips disallowed style declarations", () => {
    expect(sanitizeBroadcastHtml('<p style="background:url(javascript:x);text-align:right">a</p>')).toBe(
      '<p style="text-align: right">a</p>'
    );
  });
  it("escapes stray angle brackets", () => {
    expect(sanitizeBroadcastHtml("1 < 2 <p>ok</p>")).toBe("1 &lt; 2 <p>ok</p>");
  });
});
