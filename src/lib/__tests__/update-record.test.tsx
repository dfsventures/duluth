import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// B-133 (update page in the new look). Placeholder data only.
vi.mock("@/lib/use-new-look", () => ({ useNewLook: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/updates/u1",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { roles: ["ADMIN"] } }, status: "authenticated" }) }));
vi.mock("@/components/layout/sidebar", () => ({ Sidebar: () => null, SIDEBAR_ID: "app-sidebar" }));
vi.mock("@/components/layout/command-palette", () => ({ CommandPalette: () => null, openCommandPalette: () => {} }));
vi.mock("@/components/layout/shortcuts", () => ({ Shortcuts: () => null }));
vi.mock("@/components/ui/logo-mark", () => ({ LogoMark: () => null }));

import { UpdateRecord, type RecordUpdate } from "@/components/admin/updates/update-record";
import { AppShell } from "@/components/layout/app-shell";

const noop = () => {};
const base: RecordUpdate = {
  id: "u1",
  title: "Q3 update",
  period: "2026-Q3",
  status: "SENT",
  body: "<p>Revenue grew.</p>",
  sentAt: "2026-11-01T00:00:00.000Z",
  scheduledFor: null,
  createdAt: "2026-10-30T00:00:00.000Z",
  companyId: "c1",
  company: { id: "c1", name: "Example Co" },
  source: "FOUNDER",
  createdBy: { id: "p1", name: "Sample Person" },
  metricValues: [],
  documents: [],
};

const render = (update: Partial<RecordUpdate> = {}, over: { isAdmin?: boolean; canEdit?: boolean } = {}) =>
  renderToStaticMarkup(
    <UpdateRecord
      update={{ ...base, ...update }}
      isAdmin={over.isAdmin ?? true}
      canEdit={over.canEdit ?? false}
      deleting={false}
      sending={false}
      onEdit={noop}
      onPublish={noop}
      onToggleSchedule={noop}
      onCancelSchedule={noop}
      onRemoveFiled={noop}
      onDeleteDraft={noop}
      onDownloadDoc={noop}
      notices={null}
      comments={<section>COMMENTS</section>}
    />
  );

describe("update page, new look", () => {
  it("has the back link, one primary, the ⋯ menu, the grid hooks and the panel before the column", () => {
    const html = render();
    expect(html).toContain('href="/updates"');
    expect(html).toContain('aria-label="More actions"');
    expect(html).toContain("up-dossier-grid");
    expect(html).toContain("Revenue grew.");
    expect(html).toContain("COMMENTS");
    expect(html.indexOf('aria-label="Update details"')).toBeLessThan(html.indexOf('aria-label="Update content"'));
    // A published update nobody can edit: the PDF is the primary.
    expect(html).toContain("Download PDF");
  });

  it("panel holds company, period, status, sent, created, added by and source", () => {
    const html = render();
    for (const text of ["Example Co", "/admin/companies/c1", "Published", "Sent", "Created", "Added by", "Sample Person", "Founder"]) {
      expect(html, text).toContain(text);
    }
  });

  it("primary is Publish for a draft, Edit for an editable published update", () => {
    const draft = render({ status: "DRAFT", sentAt: null }, { canEdit: true });
    expect(draft).toContain("Publish");
    expect(draft).toContain("Draft");
    const edit = render({}, { canEdit: true });
    expect(edit).toContain("Edit");
  });

  it("keeps the Marge provenance line, the figure tag and the quote under a tagged figure", () => {
    const html = render({
      source: "EMAIL_VIA_MARGE",
      sourceRef: { permalink: "https://example.slack.com/archives/C1/p1" },
      metricValues: [
        {
          id: "m1",
          value: 12,
          date: "2026-11-01T00:00:00.000Z",
          via: "marge",
          origin: "attachment",
          quote: "We hit twelve customers",
          metricDefinition: { id: "d1", name: "Customers", unit: null },
        },
      ],
    });
    expect(html).toContain("From email");
    expect(html).toContain("added by Sample Person via Marge");
    expect(html).toContain("Open in Slack");
    expect(html).toContain("from attached file");
    expect(html).toContain("“We hit twelve customers”");
    // Order: provenance line, then the panel, then figures.
    expect(html.indexOf("From email")).toBeLessThan(html.indexOf("Update details"));
  });

  it("founders never see the tags, the quote or the Slack link", () => {
    const html = render(
      {
        source: "EMAIL_VIA_MARGE",
        sourceRef: { permalink: "https://example.slack.com/archives/C1/p1" },
        metricValues: [
          { id: "m1", value: 12, date: "2026-11-01T00:00:00.000Z", via: "marge", origin: "attachment", quote: "secret quote", metricDefinition: { id: "d1", name: "Customers", unit: null } },
        ],
      },
      { isAdmin: false }
    );
    expect(html).not.toContain("from attached file");
    expect(html).not.toContain("secret quote");
    expect(html).not.toContain("Open in Slack");
  });

  it("attachment View and Download are hover-only (up-act) and counts are not shown next to headings", () => {
    const html = render({
      documents: [{ id: "f1", name: "deck.pdf", mimeType: "application/pdf", size: 2048, docType: null }],
    });
    expect(html).toContain("up-item");
    expect(html).toContain("up-act");
    expect(html).toContain('title="Download"');
    expect(html).not.toMatch(/Attachments[^<]*\(\d/);
  });
});

describe("AppShell surface override", () => {
  const shell = (surface?: "admin" | "founder") =>
    renderToStaticMarkup(
      <AppShell surface={surface}>
        <p>x</p>
      </AppShell>
    );

  it("a path outside /admin is the founder surface, as before", () => {
    expect(shell()).toContain('data-surface="founder"');
  });

  it("the override gives the admin surface", () => {
    expect(shell("admin")).toContain('data-surface="admin"');
  });
});
