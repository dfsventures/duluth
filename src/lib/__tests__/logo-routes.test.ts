import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-guard", () => ({ requireCompanyAccess: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/s3", () => ({ getObjectBuffer: vi.fn() }));
vi.mock("@/lib/logo-store", () => ({ saveCompanyLogo: vi.fn(), removeCompanyLogo: vi.fn() }));

import { requireCompanyAccess } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { getObjectBuffer } from "@/lib/s3";
import { saveCompanyLogo, removeCompanyLogo } from "@/lib/logo-store";
import { LogoError } from "@/lib/logo-process";
import { POST, DELETE } from "@/app/api/companies/[id]/logo/route";
import { GET } from "@/app/api/logo/[companyId]/[file]/route";

const access = vi.mocked(requireCompanyAccess);
const save = vi.mocked(saveCompanyLogo);
const getObj = vi.mocked(getObjectBuffer);
const USER = { id: "u1", email: "founder@acme.com", roles: ["FOUNDER"] };
const ID = "ckabc1234567890abcdef";
const H = "0123456789abcdef";
const params = { params: Promise.resolve({ id: ID }) };

function upload(bytes: Uint8Array | string = "x", name = "logo.png") {
  const form = new FormData();
  form.set("file", new File([bytes as BlobPart], name, { type: "image/png" }));
  return new Request(`https://molly.dfs.vc/api/companies/${ID}/logo`, { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue({ user: USER, error: null } as never);
});

describe("POST /api/companies/[id]/logo", () => {
  it("passes the guard's error through", async () => {
    access.mockResolvedValue({ user: null, error: new Response("{}", { status: 403 }) } as never);
    expect((await POST(upload(), params)).status).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });

  it("400s when no file is sent", async () => {
    const req = new Request("https://x/api", { method: "POST", body: new FormData() });
    expect((await POST(req, params)).status).toBe(400);
  });

  it("maps LogoError to a 400 with the founder-readable message", async () => {
    save.mockRejectedValue(new LogoError("This logo is very wide."));
    const res = await POST(upload(), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("This logo is very wide.");
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("413s over 2 MB without processing", async () => {
    const res = await POST(upload(new Uint8Array(2 * 1024 * 1024 + 1)), params);
    expect(res.status).toBe(413);
    expect(save).not.toHaveBeenCalled();
  });

  it("returns the public URL and audits the upload", async () => {
    save.mockResolvedValue({
      logoWebKey: `companies/${ID}/logo/${H}-web.png`,
      logoLuminance: 0.3,
      logoWidth: 320,
      logoHeight: 160,
      logoPlate: "LIGHT",
    } as never);
    const res = await POST(upload(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      logoUrl: `/api/logo/${ID}/${H}-web.png`,
      logoLuminance: 0.3,
      logoWidth: 320,
      logoHeight: 160,
    });
    expect(logAdminAction).toHaveBeenCalledWith(USER, "COMPANY_LOGO_UPDATED", expect.objectContaining({ targetId: ID }));
  });

  it("DELETE clears the logo and audits", async () => {
    vi.mocked(removeCompanyLogo).mockResolvedValue({ id: ID } as never);
    const res = await DELETE(new Request("https://x", { method: "DELETE" }), params);
    expect(res.status).toBe(200);
    expect(logAdminAction).toHaveBeenCalled();
  });
});

describe("GET /api/logo/[companyId]/[file] (public)", () => {
  const p = (companyId: string, file: string) => ({ params: Promise.resolve({ companyId, file }) });
  const get = () => new Request("https://molly.dfs.vc/api/logo/x/y");

  it("serves a derivative as an immutable PNG with hardening headers", async () => {
    getObj.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const res = await GET(get(), p(ID, `${H}-email.png`));
    expect(res.status).toBe(200);
    expect(getObj).toHaveBeenCalledWith(`companies/${ID}/logo/${H}-email.png`);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("404s for the source variant, traversal and malformed names without touching storage", async () => {
    for (const [id, f] of [
      [ID, `${H}-source.png`],
      [ID, "../documents/secret.pdf"],
      ["../other", `${H}-web.png`],
      [ID, `${H}-web.svg`],
    ]) {
      expect((await GET(get(), p(id, f))).status).toBe(404);
    }
    expect(getObj).not.toHaveBeenCalled();
  });

  it("404s when the object is missing", async () => {
    getObj.mockResolvedValue(null);
    expect((await GET(get(), p(ID, `${H}-web.png`))).status).toBe(404);
  });
});
