import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import crypto from "crypto";

// Part 40 (WS128): memo share links end to end against a small fake database, with the REAL rate
// limiter (a counting fake of its table) and the real renderer. Covers: create (token shown once,
// only a SHA-256 stored), the public page with no session, revoked / expired / unknown, nothing
// but the shareable sections in the HTML, XSS on the share page, headers, rate limits, and that
// memo links never show up as Investor Links.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn(), requireAuth: vi.fn() }));
const audit = vi.hoisted(() => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/audit", () => audit);

type Row = Record<string, any>;
const state = vi.hoisted(() => ({
  memos: [] as Row[],
  links: [] as Row[],
  views: [] as Row[],
  counters: new Map<string, number>(),
  deleted: 0,
}));

vi.mock("@/lib/db", () => {
  const db: Row = {
    memo: {
      findFirst: vi.fn(async ({ where }: Row) => {
        const ok = (m: Row) =>
          m.id === where.id && (where.archivedAt === null ? m.archivedAt === null : true) &&
          where.OR.some((o: Row) => ("ownerId" in o ? m.ownerId === o.ownerId : m.visibility === o.visibility));
        return state.memos.find(ok) ?? null;
      }),
    },
    shareableLink: {
      create: vi.fn(async ({ data }: Row) => {
        const row = { id: `l${state.links.length + 1}`, revokedAt: null, createdAt: new Date("2026-10-20T10:00:00Z"), views: [], ...data };
        state.links.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: Row) => {
        const l = state.links.find((x) =>
          where.id ? x.id === where.id : (where.tokenHash ? x.tokenHash === where.tokenHash : x.token === where.token) && (where.memoId === null ? x.memoId == null : true)
        );
        if (!l) return null;
        return { ...l, memo: l.memoId ? state.memos.find((m) => m.id === l.memoId) ?? null : null, companies: [], selectedUpdates: [] };
      }),
      findFirst: vi.fn(async ({ where }: Row) => state.links.find((l) => l.id === where.id && l.memoId === where.memoId) ?? null),
      findMany: vi.fn(async ({ where, select }: Row) =>
        state.links
          .filter((l) => ("memoId" in where ? (where.memoId === null ? l.memoId == null : l.memoId === where.memoId) : true))
          .filter((l) => (where.createdById ? l.createdById === where.createdById : true))
          .map((l) => {
            const full: Row = { ...l, _count: { views: state.views.filter((v) => v.linkId === l.id).length }, views: state.views.filter((v) => v.linkId === l.id) };
            if (!select) return full; // investor links: no select, every column
            return Object.fromEntries(Object.keys(select).map((k) => [k, full[k]])); // like Prisma: only what was asked for
          })
      ),
      update: vi.fn(async ({ where, data }: Row) => {
        Object.assign(state.links.find((l) => l.id === where.id)!, data);
        return {};
      }),
      delete: vi.fn(async () => void state.deleted++),
    },
    shareableLinkView: { create: vi.fn(async ({ data }: Row) => void state.views.push({ ...data })) },
    rateLimitCounter: {
      upsert: vi.fn(async ({ where }: Row) => {
        const key = where.key_windowStart.key;
        state.counters.set(key, (state.counters.get(key) ?? 0) + 1);
        return { count: state.counters.get(key) };
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  return { db };
});

import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { GET as pageGET } from "@/app/share/m/[token]/route";
import { POST as viewPOST } from "@/app/api/share/m/[token]/view/route";
import { GET as linksGET, POST as linksPOST } from "@/app/api/admin/memos/[id]/links/route";
import { DELETE as linkDELETE } from "@/app/api/admin/memos/[id]/links/[linkId]/route";
import { GET as investorLinksGET } from "@/app/api/links/route";
import { GET as investorLinkGET, DELETE as investorLinkDELETE } from "@/app/api/links/[id]/route";
import { GET as investorShareGET } from "@/app/api/share/[token]/route";
import { POST as investorViewPOST } from "@/app/api/share/[token]/view/route";
import { GET as investorDocGET } from "@/app/api/share/[token]/doc/[docId]/route";
import { renderMemoSharePage } from "@/lib/memo-share-page";
import { sha256Hex } from "@/lib/memo-actions";

const OWNER = { id: "u1", email: "sam@example.com", roles: ["ADMIN"] };
const OTHER = { id: "u2", email: "jane@example.com", roles: ["ADMIN"] };
const as = (u: typeof OWNER) => vi.mocked(requireAdmin).mockResolvedValue({ user: u, error: null } as never);
const ctx = (id: string, linkId?: string) => ({ params: Promise.resolve({ id, linkId: linkId as string }) });
const tctx = (token: string) => ({ params: Promise.resolve({ token }) });
const json = (body: unknown) => new Request("https://molly.dfs.vc/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const getPage = (token: string, ip = "203.0.113.7") =>
  pageGET(new Request(`https://molly.dfs.vc/share/m/${token}`, { headers: { "x-forwarded-for": ip } }), tctx(token));

const CANARY = { hidden: "CANARY-HIDDEN-SECTION", other: "CANARY-OTHER-MEMO", owner: "sam@example.com", internal: "molly.dfs.vc/admin" };

function seed() {
  state.memos = [
    {
      id: "m1", title: "Acme: seed", status: "IN_REVIEW", visibility: "PRIVATE", ownerId: "u1", archivedAt: null,
      draftedByMarge: true, websiteUrl: "https://acme.example", companyNamePending: "Acme", company: null,
      updatedAt: new Date("2026-10-18T09:00:00Z"),
      owner: { email: CANARY.owner },
      sections: [
        { title: "Open Questions", markdown: `${CANARY.hidden} internal only`, citations: [], includeInShare: false, position: 0 },
        {
          title: "Team", includeInShare: true, position: 1,
          markdown: [
            "Jane Founder leads **product**.",
            "",
            `See [the Notion page](https://acme.notion.site/memo) and [our app](https://${CANARY.internal}/memos/m1) and [press](https://example.com/press).`,
            "",
            "| Role | Name |\n|:--|--:|\n| CEO | Jane Founder |",
          ].join("\n"),
          citations: [
            { label: "Intro call", kind: "call", date: "2026-10-01", url: "https://granola.ai/notes/abc" },
            { label: "Deck", kind: "deck", url: "https://drive.google.com/file/d/1" },
            { label: "Press", kind: "web", url: "https://example.com/press" },
            { label: "Wiki", kind: "web", url: "https://acme.notion.site/memo" },
          ],
        },
        { title: "Empty section", markdown: "", citations: [], includeInShare: true, position: 2 },
      ],
    },
    { id: "m2", title: CANARY.other, status: "DRAFT", visibility: "PRIVATE", ownerId: "u1", archivedAt: null, draftedByMarge: false, websiteUrl: null, companyNamePending: null, company: null, updatedAt: new Date(), sections: [] },
  ];
  state.links = [];
  state.views = [];
  state.counters = new Map();
  state.deleted = 0;
}

/** Create a link through the real route and return its token (from the one-time URL). */
async function newLink(body: Record<string, unknown> = {}) {
  as(OWNER);
  const res = await linksPOST(json(body), ctx("m1"));
  expect(res.status).toBe(201);
  const out = await res.json();
  const token = out.url.split("/share/m/")[1] as string;
  return { ...out, token };
}

beforeEach(() => {
  seed();
  audit.logAdminAction.mockReset();
  vi.mocked(requireAdmin).mockReset();
  as(OWNER);
  vi.clearAllMocks();
});

describe("creating and revoking links (owner only)", () => {
  it("stores only a SHA-256 of the token, never the token; the URL is returned once", async () => {
    const link = await newLink({ label: "Co-investor", expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(link.url).toMatch(/\/share\/m\/[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
    const row = state.links[0];
    expect(row.token).toBeNull();
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenHash).toBe(crypto.createHash("sha256").update(link.token).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(link.token);
    expect(row).toMatchObject({ memoId: "m1", label: "Co-investor", createdById: "u1" });
    expect(audit.logAdminAction).toHaveBeenCalledWith(OWNER, "MEMO_SHARE_LINK_CREATED", expect.objectContaining({ metadata: { linkId: row.id, expiresAt: row.expiresAt.toISOString() } }));
    expect(JSON.stringify(audit.logAdminAction.mock.calls)).not.toContain(link.token);
  });

  it("the list never contains a token or its hash", async () => {
    const link = await newLink();
    const res = await linksGET(new Request("https://molly.dfs.vc/x"), ctx("m1"));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(link.token);
    expect(text).not.toContain(state.links[0].tokenHash);
    expect(text).not.toMatch(/"token"|tokenHash/);
  });

  it("only the owner creates, lists or revokes; another admin cannot even see a private memo", async () => {
    const link = await newLink();
    as(OTHER);
    expect((await linksPOST(json({}), ctx("m1"))).status).toBe(404); // private memo: invisible
    expect((await linksGET(new Request("https://x"), ctx("m1"))).status).toBe(404);
    expect((await linkDELETE(new Request("https://x", { method: "DELETE" }), ctx("m1", state.links[0].id))).status).toBe(404);
    state.memos[0].visibility = "TEAM"; // shared with the team: visible, but links stay with the owner
    expect((await linksPOST(json({}), ctx("m1"))).status).toBe(403);
    expect((await linksGET(new Request("https://x"), ctx("m1"))).status).toBe(403);
    expect((await linkDELETE(new Request("https://x", { method: "DELETE" }), ctx("m1", state.links[0].id))).status).toBe(403);
    expect(state.links[0].revokedAt).toBeNull();
    expect((await getPage(link.token)).status).toBe(200);
  });

  it("rejects founders and unapproved users before any query", async () => {
    for (const status of [401, 403]) {
      vi.mocked(requireAdmin).mockResolvedValue({ user: null, error: NextResponse.json({ error: "no" }, { status }) } as never);
      expect((await linksPOST(json({}), ctx("m1"))).status).toBe(status);
      expect((await linksGET(new Request("https://x"), ctx("m1"))).status).toBe(status);
      expect((await linkDELETE(new Request("https://x", { method: "DELETE" }), ctx("m1", "l1"))).status).toBe(status);
    }
    expect(db.shareableLink.create).not.toHaveBeenCalled();
  });

  it("validates label and expiry", async () => {
    as(OWNER);
    expect((await linksPOST(json({ label: "x".repeat(101) }), ctx("m1"))).status).toBe(400);
    expect((await linksPOST(json({ expiresAt: "soon" }), ctx("m1"))).status).toBe(400);
    expect((await linksPOST(json({ expiresAt: "2020-01-01T00:00:00Z" }), ctx("m1"))).status).toBe(400);
    expect((await linksPOST(json({ label: 5 }), ctx("m1"))).status).toBe(400);
    expect(state.links).toHaveLength(0);
    expect((await linksPOST(json({ expiresAt: null }), ctx("m1"))).status).toBe(201); // never expires
  });

  it("revoke is a soft delete: the row and its view log stay, the link answers 410, twice is fine", async () => {
    const link = await newLink();
    await viewPOST(json({ email: "Reader@Example.com" }), tctx(link.token));
    expect(state.views).toHaveLength(1);
    as(OWNER);
    const res = await linkDELETE(new Request("https://x", { method: "DELETE" }), ctx("m1", link.id));
    expect(res.status).toBe(200);
    expect(state.links[0].revokedAt).toBeInstanceOf(Date);
    expect(state.deleted).toBe(0);
    expect(db.shareableLink.delete).not.toHaveBeenCalled();
    expect(state.views).toHaveLength(1);
    expect(audit.logAdminAction).toHaveBeenCalledWith(OWNER, "MEMO_SHARE_LINK_REVOKED", expect.objectContaining({ metadata: { linkId: link.id } }));
    audit.logAdminAction.mockClear();
    expect((await linkDELETE(new Request("https://x", { method: "DELETE" }), ctx("m1", link.id))).status).toBe(200);
    expect(audit.logAdminAction).not.toHaveBeenCalled();
    expect((await getPage(link.token)).status).toBe(410);
  });

  it("a link id from another memo is a 404", async () => {
    await newLink();
    as(OWNER);
    expect((await linkDELETE(new Request("https://x", { method: "DELETE" }), ctx("m2", state.links[0].id))).status).toBe(404);
  });
});

describe("the public page", () => {
  it("opens with no session, answers 200 HTML, and shows the memo", async () => {
    const link = await newLink();
    vi.mocked(requireAdmin).mockReset(); // no login anywhere on this path
    const res = await getPage(link.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(requireAdmin).not.toHaveBeenCalled();
    const html = await res.text();
    expect(html).toContain("<h1>Acme: seed</h1>");
    expect(html).toContain("Acme"); // company (pending) name
    expect(html).toContain("acme.example");
    expect(html).toContain("In review");
    expect(html).toContain("Last updated October 18, 2026");
    expect(html).toContain("Drafted with Marge");
    expect(html).toContain("Shared from Molly · DFS");
    expect(html).toContain("<strong>product</strong>");
    expect(html).toContain("<table>");
    expect(html).not.toMatch(/DFS Lab/);
  });

  it("looks the link up by hash only", async () => {
    const link = await newLink();
    await getPage(link.token);
    const where = vi.mocked(db.shareableLink.findUnique).mock.calls.at(-1)![0].where as Row;
    expect(where).toEqual({ tokenHash: sha256Hex(link.token) });
  });

  it("contains nothing else: no excluded section, other memo, owner email, /admin link, internal URL or empty section", async () => {
    const link = await newLink();
    const html = await (await getPage(link.token)).text();
    expect(html).not.toContain(CANARY.hidden);
    expect(html).not.toContain("Open Questions");
    expect(html).not.toContain(CANARY.other);
    expect(html).not.toContain(CANARY.owner);
    expect(html).not.toContain("/admin/");
    expect(html).not.toContain("Empty section");
    expect(html).not.toContain("notion.site");
    expect(html).not.toContain("granola.ai");
    expect(html).not.toContain("drive.google.com");
    expect(html).not.toContain("molly.dfs.vc");
    // text of internal links stays, external links stay
    expect(html).toContain("the Notion page");
    expect(html).toContain("our app");
    expect(html).toContain('href="https://example.com/press"');
    // citations: label and date for internal ones, link only for external web
    expect(html).toContain("Intro call");
    expect(html).toContain("October 1, 2026");
    expect(html).toContain("Deck");
    expect(html.match(/aria-label="Open Press"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-label="Open Wiki"');
    expect(html).not.toContain('aria-label="Open Intro call"');
  });

  it("drops excluded sections even if the query returned them (the renderer filters too)", () => {
    const html = renderMemoSharePage(
      { title: "T", companyName: null, websiteUrl: null, status: "DRAFT", updatedAt: new Date(), draftedByMarge: false, sections: [{ title: "Secret", markdown: CANARY.hidden, citations: [], includeInShare: false }] },
      { token: "t".repeat(43), nonce: "n" }
    );
    expect(html).not.toContain(CANARY.hidden);
    expect(html).not.toContain("Secret");
  });

  it("asks for the section list with includeInShare: true, in order", async () => {
    const link = await newLink();
    await getPage(link.token);
    const select = (vi.mocked(db.shareableLink.findUnique).mock.calls.at(-1)![0] as Row).select;
    expect(select.memo.select.sections.where).toEqual({ includeInShare: true });
    expect(select.memo.select.sections.orderBy).toEqual({ position: "asc" });
    expect(select.memo.select).not.toHaveProperty("owner");
    expect(select.memo.select).not.toHaveProperty("ownerId");
  });

  it("neutralises script, raw HTML, handlers and javascript:/data: links in section text", async () => {
    state.memos[0].sections[1].markdown = [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "[a](javascript:alert(1)) [b](data:text/html;base64,AAAA) [c](&#106;avascript:alert(1))",
      "<a href=\"javascript:alert(1)\" onclick=\"x()\">d</a>",
      "<iframe src=\"https://evil.example\"></iframe>",
      "![pixel](https://evil.example/p.gif)",
    ].join("\n\n");
    state.memos[0].sections[1].citations = [{ label: "<img src=x onerror=alert(1)>", kind: "web", url: "javascript:alert(1)" }];
    state.memos[0].title = "<script>alert('title')</script>";
    state.memos[0].websiteUrl = "javascript:alert(1)";
    const link = await newLink();
    const html = await (await getPage(link.token)).text();
    // the only script element is the page's own, and it carries the nonce
    const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatch(/^<script nonce="[A-Za-z0-9+/=]+">$/);
    expect(html).not.toMatch(/<(img|iframe|object|embed|svg)\b/i);
    expect(html).not.toMatch(/<[^>]*\son[a-z]+\s*=/i); // no inline handler on any tag
    expect(html).not.toMatch(/href="(javascript|data):/i);
    expect(html).toContain("&lt;script&gt;alert(&#39;title&#39;)&lt;/script&gt;"); // title is escaped text
    expect(html).not.toContain("p.gif"); // the image is never loaded, only its alt text shows
    expect(html).toContain("<p>pixel</p>");
    expect(html).not.toContain("alert(1)</script>");
  });

  it("sends noindex, no-referrer, no-store and a CSP whose nonce matches the page's script", async () => {
    const link = await newLink();
    const res = await getPage(link.token);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    const nonce = /script-src 'nonce-([^']+)'/.exec(csp)![1];
    const html = await res.text();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
  });

  it("uses a fresh nonce per response", async () => {
    const link = await newLink();
    const a = (await getPage(link.token)).headers.get("content-security-policy");
    const b = (await getPage(link.token)).headers.get("content-security-policy");
    expect(a).not.toBe(b);
  });

  it("works for a PRIVATE memo (the owner chose to share it) and a link that never expires", async () => {
    expect(state.memos[0].visibility).toBe("PRIVATE");
    const link = await newLink({ expiresAt: null });
    expect((await getPage(link.token)).status).toBe(200);
  });

  it("revoked and archived: 410 with the sender's message; expired: 410; unknown or malformed: 404; no memo data in any of them", async () => {
    const link = await newLink({ expiresAt: new Date(Date.now() + 60_000).toISOString() });

    state.links[0].expiresAt = new Date(Date.now() - 1000);
    let res = await getPage(link.token);
    expect(res.status).toBe(410);
    let html = await res.text();
    expect(html).toContain("This link has expired.");
    expect(html).not.toContain("Acme");

    state.links[0].expiresAt = null;
    state.links[0].revokedAt = new Date();
    res = await getPage(link.token);
    expect(res.status).toBe(410);
    html = await res.text();
    expect(html).toContain("This link was turned off by the sender.");
    expect(html).not.toContain("Acme");

    state.links[0].revokedAt = null;
    state.memos[0].archivedAt = new Date();
    expect((await getPage(link.token)).status).toBe(410);
    state.memos[0].archivedAt = null;
    expect((await getPage(link.token)).status).toBe(200);

    expect((await getPage("A".repeat(43))).status).toBe(404);
    expect((await getPage("short")).status).toBe(404);
    expect((await getPage("../../etc/passwd")).status).toBe(404);
    const nf = await getPage("A".repeat(43));
    expect(nf.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(nf.headers.get("cache-control")).toBe("no-store");
    expect(nf.headers.get("content-security-policy")).toContain("script-src 'none'");
  });

  it("rate limit: 120 requests an hour per IP, the 121st is a 429; another IP is unaffected", async () => {
    const link = await newLink();
    for (let i = 0; i < 120; i++) expect((await getPage(link.token, "198.51.100.9")).status, `request ${i + 1}`).toBe(200);
    const over = await getPage(link.token, "198.51.100.9");
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).toBe("3600");
    expect(await over.text()).toContain("Too many requests");
    expect((await getPage(link.token, "198.51.100.10")).status).toBe(200);
  });
});

describe("the view log", () => {
  it("records a valid email against the link, lower-cased", async () => {
    const link = await newLink();
    const res = await viewPOST(json({ email: " Reader@Example.com " }), tctx(link.token));
    expect(res.status).toBe(200);
    expect(state.views).toEqual([{ linkId: state.links[0].id, email: "reader@example.com" }]);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects bad emails, unknown links, revoked and expired links", async () => {
    const link = await newLink();
    expect((await viewPOST(json({ email: "nope" }), tctx(link.token))).status).toBe(400);
    expect((await viewPOST(json({}), tctx(link.token))).status).toBe(400);
    expect((await viewPOST(new Request("https://x", { method: "POST", body: "nope" }), tctx(link.token))).status).toBe(400);
    expect((await viewPOST(json({ email: "a@b.co" }), tctx("A".repeat(43)))).status).toBe(404);
    state.links[0].expiresAt = new Date(Date.now() - 1000);
    expect((await viewPOST(json({ email: "a@b.co" }), tctx(link.token))).status).toBe(410);
    state.links[0].expiresAt = null;
    state.links[0].revokedAt = new Date();
    expect((await viewPOST(json({ email: "a@b.co" }), tctx(link.token))).status).toBe(410);
    expect(state.views).toHaveLength(0);
  });
  it("rate limit: 30 an hour per IP, the 31st is a 429", async () => {
    const link = await newLink();
    const post = () =>
      viewPOST(new Request("https://x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.77" }, body: JSON.stringify({ email: "a@b.co" }) }), tctx(link.token));
    for (let i = 0; i < 30; i++) expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);
  });
});

describe("memo links are not Investor Links", () => {
  it("GET /api/links never returns them (admin or founder), and asks the database for memoId: null", async () => {
    const link = await newLink();
    state.links.push({ id: "inv1", token: "investor-token", tokenHash: null, memoId: null, createdById: "u1", label: "Investors" });
    const { requireAuth } = await import("@/lib/auth-guard");
    vi.mocked(requireAuth).mockResolvedValue({ user: OWNER, error: null } as never);
    const res = await investorLinksGET();
    const rows = await res.json();
    expect(rows.map((r: Row) => r.id)).toEqual(["inv1"]);
    expect(JSON.stringify(rows)).not.toContain(link.token);
    expect((vi.mocked(db.shareableLink.findMany).mock.calls.at(-1)![0] as Row).where).toEqual({ memoId: null });
    // a founder sees only their own, still without memo links
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: "u3", email: "f@example.com", roles: ["FOUNDER"] }, error: null } as never);
    await investorLinksGET();
    expect((vi.mocked(db.shareableLink.findMany).mock.calls.at(-1)![0] as Row).where).toEqual({ createdById: "u3", memoId: null });
  });

  it("the investor link by-id routes treat a memo link as not found (an admin cannot hard-delete or read one there)", async () => {
    await newLink();
    const id = state.links[0].id;
    const { requireAuth } = await import("@/lib/auth-guard");
    vi.mocked(requireAuth).mockResolvedValue({ user: { ...OWNER, roles: ["ADMIN"] }, error: null } as never);
    const del = await investorLinkDELETE(new Request("https://x", { method: "DELETE" }), { params: Promise.resolve({ id }) });
    expect(del.status).toBe(404);
    expect(state.deleted).toBe(0);
    const get = await investorLinkGET(new Request("https://x"), { params: Promise.resolve({ id }) });
    expect(get.status).toBe(404);
  });
});

describe("the Investor Link share routes only look up investor links", () => {
  it("every lookup carries memoId: null (belt and braces: memo links have no token to match)", async () => {
    const last = () => (vi.mocked(db.shareableLink.findUnique).mock.calls.at(-1)![0] as Row).where;
    await investorShareGET(new Request("https://x"), tctx("tok"));
    expect(last()).toEqual({ token: "tok", memoId: null });
    await investorViewPOST(json({ email: "a@b.co" }), tctx("tok"));
    expect(last()).toEqual({ token: "tok", memoId: null });
    await investorDocGET(new Request("https://x"), { params: Promise.resolve({ token: "tok", docId: "d1" }) });
    expect(last()).toEqual({ token: "tok", memoId: null });
  });
  it("a memo link's token (null) cannot be presented to them", async () => {
    const link = await newLink();
    const res = await investorShareGET(new Request("https://x"), tctx(link.token));
    expect(res.status).toBe(404);
  });
});

describe("headers in next.config.js", () => {
  it("noindex and no-referrer for /share and /api/share, no-store for memo pages", async () => {
    const config = require("../../../next.config.js") as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
    const rules = await config.headers();
    const by = (source: string) => rules.find((r) => r.source === source)!;
    for (const source of ["/share/:path*", "/api/share/:path*"]) {
      expect(by(source).headers).toEqual(
        expect.arrayContaining([
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ])
      );
    }
    expect(by("/share/m/:path*").headers).toEqual([{ key: "Cache-Control", value: "no-store" }]);
  });
});
