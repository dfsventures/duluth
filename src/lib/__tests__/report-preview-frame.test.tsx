import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// WS172 (B-171): the report preview shows the report as LPs see it, in a same-origin frame. Since
// WS168 the frame takes the LP portal's new look. Placeholder data only; db and auth are mocked.

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

  it("renders the report in the LP wrapper with no admin shell, in the LP look and light theme (WS168)", async () => {
    const html = renderToStaticMarkup(await AdminReportPreviewFramePage(props));
    expect(html).toContain('data-surface="founder"');
    expect(html).toContain('data-v2-scope=""');
    expect(html).toContain('class="lp-report"');
    expect(html).toContain('dataset.theme="light"');
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

  it("shows the report only in the same-origin frame (the old look's in-place copy is gone, WS168)", async () => {
    const html = renderToStaticMarkup(await AdminReportPreviewPage(props));
    expect(html).not.toContain('data-testid="report"');
    expect(html).toContain('src="/admin/reports/r1/preview/frame"');
    expect(html).toContain('loading="lazy"');
    expect(html).toMatch(/<iframe[^>]*class="[^"]*v2:block/);
  });
});
