import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// B-133 (company page in the new look). Placeholder data only.
vi.mock("@/lib/use-new-look", () => ({ useNewLook: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/companies/c1",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CompanyRecord } from "@/components/admin/company/company-record";
import { ProfileCard } from "@/components/admin/company/profile-card";
import { NotesTab } from "@/components/admin/company/notes-tab";
import { UpdatesTab } from "@/components/admin/company/updates-tab";
import type { Company, Note, Update } from "@/components/admin/company/types";

const company = {
  id: "c1",
  name: "Example Co",
  description: "Makes example things.",
  website: "https://example.com",
  sector: "Fintech",
  geography: "Nairobi",
  fundingStage: "Seed",
  aliases: [],
  reminderFrequencyDays: 30,
  lastReminderSentAt: null,
  logoWebKey: null,
} as unknown as Company;

const noop = () => {};
const tabs = [
  { key: "updates" as const, label: "Updates", count: 2 },
  { key: "metrics" as const, label: "Metrics", count: 0 },
  { key: "notes" as const, label: "Notes" },
];

const render = (over: { portfolio?: boolean } = {}) =>
  renderToStaticMarkup(
    <CompanyRecord
      companyId="c1"
      company={company}
      portfolioCompany={over.portfolio ? { id: "p1", name: "Example Co" } : null}
      founderNote={<p>Founders will see these updates</p>}
      tabs={tabs}
      activeTab="updates"
      deleting={false}
      onDelete={noop}
      onSaved={noop}
      setMessage={noop}
    >
      <div>TAB BODY</div>
    </CompanyRecord>
  );

describe("company page, new look", () => {
  it("has the back link, the one primary, the ⋯ menu and the grid hooks", () => {
    const html = render();
    expect(html).toContain('href="/admin/companies"');
    expect(html).toContain("Create update");
    expect(html).toContain('aria-label="More actions"');
    expect(html).toContain("co-dossier-grid");
    expect(html).toContain("Founders will see these updates");
    expect(html).toContain("TAB BODY");
    // Tabs are in the main column, after the panel in the markup (the panel moves up on a phone).
    expect(html.indexOf('aria-label="Company facts"')).toBeLessThan(html.indexOf('aria-label="Company sections"'));
  });

  it("shows every fact in the panel", () => {
    const html = render({ portfolio: true });
    for (const text of ["Makes example things.", "Seed", "Fintech", "Nairobi", "example.com", "Reminders", "Never sent", "/admin/portfolio/p1"]) {
      expect(html, text).toContain(text);
    }
  });

  it("shows Off when reminders are off and leaves out missing facts", () => {
    const html = renderToStaticMarkup(
      <ProfileCard
        variant="panel"
        companyId="c1"
        company={{ ...company, website: null, sector: null, geography: null, fundingStage: null, reminderFrequencyDays: null } as unknown as Company}
        portfolioCompany={null}
        onSaved={noop}
        setMessage={noop}
      />
    );
    expect(html).toContain("Off");
    for (const gone of ["Website", "Sector", "Geography", "Stage", "Portfolio"]) expect(html.includes(gone), gone).toBe(false);
  });

  it("opens the edit form in the panel when told to", () => {
    const html = renderToStaticMarkup(
      <ProfileCard variant="panel" companyId="c1" company={company} portfolioCompany={null} onSaved={noop} setMessage={noop} editing onEditingChange={noop} />
    );
    expect(html).toContain("Save changes");
    expect(html).toContain('id="edit-name"');
  });

  it("old card variant is unchanged: Edit button and no panel markup", () => {
    const html = renderToStaticMarkup(<ProfileCard companyId="c1" company={company} portfolioCompany={null} onSaved={noop} setMessage={noop} />);
    expect(html).toContain("Edit");
    expect(html).toContain("Reminders:");
    expect(html).not.toContain("<dl");
  });

  it("note History, Edit and Delete are hover-only and the body is not clamped in the new look", () => {
    const note = {
      id: "n1",
      title: "Call",
      body: "<p>Body</p>",
      occurredAt: "2026-11-01T00:00:00.000Z",
      transcriptUrl: null,
      createdBy: { name: "Sample Person", email: "s@example.com" },
      _count: { revisions: 1 },
    } as unknown as Note;
    const html = renderToStaticMarkup(<NotesTab companyId="c1" notes={[note]} setNotes={noop} setMessage={noop} />);
    expect(html).toContain("co-item");
    expect(html.match(/co-act/g)?.length).toBe(3);
    expect(html).toContain('title="View history"');
    expect(html).toContain('title="Edit note"');
    expect(html).toContain("v2:line-clamp-none");
  });

  it("the Updates tab keeps provenance and loses only its own header row in the new look", () => {
    const update = {
      id: "u1",
      title: "Q3",
      period: "Q3 2026",
      status: "SENT",
      source: "EMAIL_VIA_MARGE",
      createdAt: "2026-11-01T00:00:00.000Z",
      createdBy: { name: "Sample Person" },
    } as unknown as Update;
    const html = renderToStaticMarkup(<UpdatesTab companyId="c1" updates={[update]} />);
    expect(html).toContain("From email");
    expect(html).toContain("added by Sample Person via Marge");
    expect(html).toContain("v2:hidden");
  });
});
