import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// PLAN-1, WS160: the three pages that use the list and pane. These read the source, as the
// shell test does, to pin the things a render test cannot see: the approval order, the handlers
// the pane reuses, and that no new endpoint is called.
const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf-8");
const approvals = read("app/admin/approvals/page.tsx");
const companies = read("app/admin/companies/page.tsx");
const updates = read("app/admin/updates/page.tsx");

describe("Approvals", () => {
  const link = approvals.slice(approvals.indexOf("async function handleLinkAndApprove"), approvals.indexOf("async function handleJoinAndApprove"));

  it("Link & approve still links first, then adds the contact, then approves through the existing handler", () => {
    const patch = link.indexOf("/api/admin/portfolio-companies/");
    const contact = link.indexOf("addPortcoContact(");
    const approve = link.indexOf('await handleAction(approval.id, "approve")');
    expect(patch).toBeGreaterThan(-1);
    expect(contact).toBeGreaterThan(patch);
    expect(approve).toBeGreaterThan(contact);
    // and still stops cold when the link fails
    expect(link).toContain("return; // stop — do not approve");
  });

  it("the shared approve handler still refreshes the sidebar counts", () => {
    const handler = approvals.slice(approvals.indexOf("async function handleAction"), approvals.indexOf("// Part 31, WS77 — D4"));
    expect(handler).toContain("globalMutate(NAV_COUNTS_KEY)");
    expect(handler).toContain("/api/admin/approvals/${id}/${action}");
  });

  it("the pane's buttons call the same handlers as the card", () => {
    const pane = approvals.slice(approvals.indexOf("function renderApprovalPane"), approvals.indexOf("return (\n    <AppShell"));
    expect(pane).toContain('handleAction(approval.id, "approve")');
    expect(pane).toContain('handleAction(approval.id, "reject")');
    expect(pane).toContain("handleLinkAndApprove(approval, selected.portfolioCompanyId, addContact)");
    // the unclaimed-company and link suggestion block is the shared one, calling the same handler
    expect(pane).toContain("renderSuggestion(approval, v)");
    const block = approvals.slice(approvals.indexOf("function renderSuggestion"), approvals.indexOf("// The \"Recently Processed\""));
    expect(block).toContain("handleJoinAndApprove(approval, unclaimed.id)");
  });

  it("the old card still has its three buttons and the same wording", () => {
    expect(approvals).toContain('"Link & approve"');
    expect(approvals).toContain("Add ${approval.name} to ${unclaimed.name} instead");
    expect(approvals).toContain("Recently Processed");
    expect(approvals).toContain("All caught up");
  });

  it("calls no endpoint beyond the ones it used before", () => {
    const urls = [...approvals.matchAll(/fetch\(\s*[`"]([^`"]+)[`"]/g)].map((m) => m[1]);
    expect(urls.length).toBe(9);
    for (const u of urls) expect(u).toMatch(/^\/api\/admin\/(approvals|portfolio-companies)/);
    expect(approvals).not.toMatch(/useSWR\(|axios/);
  });
});

describe("the three pages", () => {
  it("lay themselves out full width (the shell ignores it under the old look)", () => {
    for (const src of [approvals, companies, updates]) expect(src).toContain('<AppShell width="full">');
  });
  it("open records beside the list through SplitView and the shared table", () => {
    for (const src of [approvals, companies, updates]) {
      expect(src).toContain("<SplitView");
      expect(src).toContain("onOpenRow=");
      expect(src).toContain("openKey={openId}");
    }
  });
  it("Companies and Updates read only the endpoints their full pages read", () => {
    expect(companies).toContain('"/api/admin/companies"');
    expect(companies).not.toMatch(/useSWR[^;]*\/api\/(?!admin\/companies)/);
    expect(updates).toContain("`/api/updates/${update.id}`");
    expect(updates).toContain('"/api/admin/updates"');
  });
  it("Companies: the row says only 'No founder yet' in quiet words; the pane carries 'Added via Marge'", () => {
    expect(companies).toContain("<PaneChip>Added via Marge</PaneChip>");
    expect(companies).toContain("<PaneChip>No founder yet</PaneChip>");
    // the old-look chip keeps its full wording
    expect(companies).toContain('{r.createdVia === "marge" ? "Added via Marge · No founder yet" : "No founder yet"}');
    // the new-look words are muted meta text that truncates before the name does
    expect(companies).toContain("shrink-[1000] truncate text-meta font-normal text-muted-foreground");
  });
  it("blocks above a full-width list pad by --row-pad so they line up with the title and rows", () => {
    for (const src of [approvals, companies, updates]) {
      expect(src).not.toContain("v2:px-[var(--gutter)]");
      expect(src).toContain("v2:px-[var(--row-pad)]");
    }
  });
  it("the pane for an update sanitises the body the way the full page does", () => {
    expect(updates).toContain("sanitizeUpdateHtml(detail.body)");
  });
});
