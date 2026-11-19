import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// WS172 (B-171): the report preview keeps the LP look in the new look by showing it in a
// same-origin frame. Placeholder data only; db and auth are mocked.

const auth = vi.fn();
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirect(to),
  notFound: () => notFound(),
  usePathname: () => "/admin/reports/r1/preview",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/layout/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }));
vi.mock("@/components/layout/surface-sync", () => ({ SurfaceSync: ({ surface }: { surface: string }) => <i data-sync={surface} /> }));
vi.mock("@/components/report-view", () => ({
  ReportView: ({ title }: { title: string }) => <article data-testid="report">{title}</article>,
}));

const loadReportPreview = vi.fn();
vi.mock("@/lib/report-preview", () => ({ loadReportPreview: (id: string) => loadReportPreview(id) }));

import AdminReportPreviewPage from "@/app/admin/reports/[id]/preview/page";
import AdminReportPreviewFramePage from "@/app/admin/reports/[id]/preview/frame/page";

const data = {
  report: { id: "r1", title: "Example Fund I: H1 Report", periodLabel: "H1", publishedAt: null, body: "<p>x</p>", fund: { id: "f1", name: "Example Fund I" } },
  mentions: [],
  fundSnapshot: null,
};
const admin = { user: { roles: ["ADMIN"] } };
const props = { params: Promise.resolve({ id: "r1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue(admin);
  loadReportPreview.mockResolvedValue(data);
});

describe("report preview frame route", () => {
  it("sends a non-admin to the login page and never loads the report", async () => {
    auth.mockResolvedValue({ user: { roles: ["FOUNDER"] } });
    await expect(AdminReportPreviewFramePage(props)).rejects.toThrow("REDIRECT:/login");
    expect(loadReportPreview).not.toHaveBeenCalled();
  });

  it("is a 404 for a report that does not exist", async () => {
    loadReportPreview.mockResolvedValue(null);
    await expect(AdminReportPreviewFramePage(props)).rejects.toThrow("NOT_FOUND");
  });

  it("renders the report in the LP wrapper with no admin shell", async () => {
    const html = renderToStaticMarkup(await AdminReportPreviewFramePage(props));
    expect(html).toContain('data-surface="founder"');
    expect(html).toContain("lp-print-scope");
    expect(html).toContain('data-sync="founder"');
    expect(html).toContain("Example Fund I: H1 Report");
    expect(html).not.toContain("data-testid=\"shell\"");
    expect(html).not.toContain('data-surface="admin"');
  });
});

describe("report preview page", () => {
  it("sends a non-admin to the login page", async () => {
    auth.mockResolvedValue(null);
    await expect(AdminReportPreviewPage(props)).rejects.toThrow("REDIRECT:/login");
  });

  it("keeps the in-place report for the old look and adds a hidden-by-default same-origin frame for the new look", async () => {
    const html = renderToStaticMarkup(await AdminReportPreviewPage(props));
    // Old look: the report is there, inside a wrapper the new look hides.
    expect(html).toMatch(/<div class="v2:hidden"><article data-testid="report">/);
    // New look: the frame points at the frame route; the old look never displays it.
    expect(html).toContain('src="/admin/reports/r1/preview/frame"');
    expect(html).toContain('loading="lazy"');
    expect(html).toMatch(/<iframe[^>]*class="hidden [^"]*v2:block/);
  });
});
