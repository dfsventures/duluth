import { describe, it, expect, vi, beforeEach } from "vitest";

// B-249 — update attachments on investor share links. The share page is public to anyone with the
// link, so: only files attached to an update the link shows, never internal or archived ones, never
// a storage key; and the download route re-checks the link and the file on every request.
// A small in-memory fake evaluates the Prisma where shapes the routes use. Synthetic data only.

type Row = Record<string, unknown>;

const store = vi.hoisted(() => ({
  links: [] as Row[],
  updates: [] as Row[],
  documents: [] as Row[],
}));

function cond(cell: unknown, v: unknown): boolean {
  if (v === null) return cell === null || cell === undefined;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Row;
    if ("in" in o) return (o.in as unknown[]).includes(cell);
    if ("gte" in o || "lte" in o) {
      if (!(cell instanceof Date)) return false;
      if (o.gte && cell < (o.gte as Date)) return false;
      if (o.lte && cell > (o.lte as Date)) return false;
      return true;
    }
  }
  return cell === v;
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Row[]).some((w) => matches(row, w));
    if (k === "AND") return (v as Row[]).every((w) => matches(row, w));
    return cond(row[k], v);
  });
}

function pick(row: Row, select?: Row): Row {
  if (!select) return row;
  const out: Row = {};
  for (const k of Object.keys(select)) out[k] = row[k];
  return out;
}

vi.mock("@/lib/db", () => ({
  db: {
    shareableLink: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => store.links.find((l) => matches(l, where)) ?? null),
    },
    update: {
      findMany: vi.fn(async ({ where }: { where: Row }) => store.updates.filter((u) => matches(u, where))),
      findFirst: vi.fn(async ({ where, select }: { where: Row; select?: Row }) => {
        const u = store.updates.find((x) => matches(x, where));
        return u ? pick(u, select) : null;
      }),
    },
    document: {
      findMany: vi.fn(async ({ where, select }: { where: Row; select?: Row }) =>
        store.documents.filter((d) => matches(d, where)).map((d) => pick(d, select))
      ),
      findFirst: vi.fn(async ({ where, select }: { where: Row; select?: Row }) => {
        const d = store.documents.find((x) => matches(x, where));
        return d ? pick(d, select) : null;
      }),
    },
    metricValue: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => true), clientIp: () => "127.0.0.1" }));
vi.mock("@/lib/s3", () => ({ getDownloadUrl: vi.fn(async (key: string) => `https://storage.example/${key}?sig=short`) }));

import { GET as pageGET } from "@/app/api/share/[token]/route";
import { GET as attachmentGET } from "@/app/api/share/[token]/attachment/[docId]/route";
import { getDownloadUrl } from "@/lib/s3";
import { attachmentTypeLabel, shareAttachmentPath } from "@/lib/share-attachments";

const MADE = new Date("2026-09-01T00:00:00Z");

function company(id: string) {
  return {
    companyId: id,
    company: {
      id, name: `Company ${id}`, description: null, sector: null, geography: null, fundingStage: null,
      website: null, brandColor: null, logoPlate: "LIGHT", logoWebKey: null, logoWidth: null, logoHeight: null,
    },
  };
}

function link(over: Row = {}): Row {
  return {
    id: "l1", token: "tok", memoId: null, revokedAt: null, label: "Q3", createdAt: MADE,
    periodStart: null, periodEnd: null, expiresAt: null, metricScope: "ALL_TIME",
    companies: [company("c1")], selectedUpdates: [{ updateId: "u1" }],
    ...over,
  };
}

function update(id: string, over: Row = {}): Row {
  return {
    id, companyId: "c1", title: `Update ${id}`, period: "2026-Q3", body: "<p>Hello</p>", status: "SENT",
    sentAt: new Date("2026-08-15T00:00:00Z"), createdAt: new Date("2026-08-15T00:00:00Z"), filedAt: null,
    company: { id: "c1", name: "Company c1" }, metricValues: [],
    ...over,
  };
}

function doc(id: string, updateId: string | null, over: Row = {}): Row {
  return {
    id, updateId, companyId: "c1", name: `${id}.pdf`, s3Key: `documents/c1/${id}.pdf`,
    mimeType: "application/pdf", size: 2048, isInternal: false, archivedAt: null,
    createdAt: new Date("2026-08-15T00:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(getDownloadUrl).mockClear();
  store.links = [link()];
  store.updates = [update("u1"), update("u2")];
  store.documents = [
    doc("d1", "u1"),
    doc("d2", "u1", { isInternal: true }),
    doc("d3", "u1", { archivedAt: new Date("2026-08-20T00:00:00Z") }),
    doc("d4", "u2"), // attached to an update this link doesn't show
    doc("d5", null), // a company document attached to no update
  ];
});

const loadPage = async (token = "tok") => {
  const res = await pageGET(new Request(`https://x/api/share/${token}`), { params: Promise.resolve({ token }) });
  return { res, text: await res.text() };
};
const download = (docId: string, token = "tok") =>
  attachmentGET(new Request(`https://x${shareAttachmentPath(token, docId)}`), {
    params: Promise.resolve({ token, docId }),
  });

describe("share page data: which attachments are listed", () => {
  it("lists only the shown update's public, active files, with no storage key", async () => {
    const { res, text } = await loadPage();
    expect(res.status).toBe(200);
    const body = JSON.parse(text);
    expect(body.updates).toHaveLength(1);
    expect(body.updates[0].attachments).toEqual([{ id: "d1", name: "d1.pdf", mimeType: "application/pdf", size: 2048 }]);
    expect(text).not.toContain("s3Key");
    expect(text).not.toContain("documents/c1/");
    for (const hidden of ["d2", "d3", "d4", "d5"]) expect(text).not.toContain(`"${hidden}"`);
  });

  it("gives every update an attachments list, empty when it has none", async () => {
    store.links = [link({ selectedUpdates: [{ updateId: "u1" }, { updateId: "u2" }] })];
    store.documents = [];
    const body = JSON.parse((await loadPage()).text);
    expect(body.updates.map((u: Row) => u.attachments)).toEqual([[], []]);
  });
});

describe("attachment download route", () => {
  it("redirects a valid file to a short-lived signed URL", async () => {
    const res = await download("d1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://storage.example/documents/c1/d1.pdf?sig=short");
    expect(getDownloadUrl).toHaveBeenCalledWith("documents/c1/d1.pdf");
  });

  it("refuses an unknown token", async () => {
    expect((await download("d1", "nope")).status).toBe(404);
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });

  it("refuses a memo link's token (investor links only)", async () => {
    store.links = [link({ memoId: "m1" })];
    expect((await download("d1")).status).toBe(404);
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });

  it("refuses a revoked link", async () => {
    store.links = [link({ revokedAt: new Date("2026-09-10T00:00:00Z") })];
    expect((await download("d1")).status).toBe(410);
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });

  it("refuses an expired link", async () => {
    store.links = [link({ expiresAt: new Date("2020-01-01T00:00:00Z") })];
    expect((await download("d1")).status).toBe(410);
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });

  it("refuses a file from another update, an internal or archived file, an unattached file, and an unknown id", async () => {
    for (const id of ["d4", "d2", "d3", "d5", "missing"]) {
      expect((await download(id)).status, id).toBe(404);
    }
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });

  it("legacy period links: only files on updates inside the link's period and companies", async () => {
    store.links = [
      link({ selectedUpdates: [], periodStart: new Date("2026-07-01T00:00:00Z"), periodEnd: new Date("2026-08-31T00:00:00Z") }),
    ];
    store.updates = [
      update("u1"),
      update("u2", { sentAt: new Date("2026-10-01T00:00:00Z") }), // outside the period
      update("u3", { companyId: "c9" }), // company not on the link
      update("u4", { filedAt: new Date("2026-09-20T00:00:00Z") }), // filed by email after the link was made
      update("u5", { status: "DRAFT" }),
    ];
    store.documents = ["u1", "u2", "u3", "u4", "u5"].map((u) => doc(`f-${u}`, u));
    expect((await download("f-u1")).status).toBe(307);
    for (const id of ["f-u2", "f-u3", "f-u4", "f-u5"]) expect((await download(id)).status, id).toBe(404);
  });

  it("a link with no selection and no period shows nothing and serves nothing", async () => {
    store.links = [link({ selectedUpdates: [] })];
    expect((await download("d1")).status).toBe(404);
  });
});

describe("attachmentTypeLabel", () => {
  it("uses the extension, else the MIME subtype", () => {
    expect(attachmentTypeLabel("board-pack.pdf", "application/pdf")).toBe("PDF");
    expect(attachmentTypeLabel("model.xlsx", null)).toBe("XLSX");
    expect(attachmentTypeLabel("notes", "text/plain")).toBe("PLAIN");
    expect(attachmentTypeLabel("notes", null)).toBe("File");
  });

  it("encodes the token and id in the download path", () => {
    expect(shareAttachmentPath("a/b", "d1")).toBe("/api/share/a%2Fb/attachment/d1");
  });
});
