import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsTabs } from "@/app/admin/settings/settings-tabs";
import { SettingsStatusStrip } from "@/app/admin/settings/settings-status-strip";

// PLAN-1, WS171: Service Providers, Investor Links, Diligence and Settings in the new look.
// Source reads pin what a render test cannot see (the handlers the panes reuse, no new endpoint);
// the Settings pieces are server components, so they render here.
const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf-8");
const providers = read("app/admin/providers/page.tsx");
const links = read("app/admin/links/page.tsx");
const diligence = read("app/admin/diligence/page.tsx");
const settings = read("app/admin/settings/page.tsx");

describe("Settings", () => {
  it("the tabs keep the old classes and add the new-look ones, so the old look is unchanged", () => {
    const html = renderToStaticMarkup(<SettingsTabs active="email" />);
    expect(html).toContain("border-b border-border");
    expect(html).toContain("font-mono text-xs font-semibold uppercase tracking-widest");
    expect(html).toContain("v2:border-b-0");
    expect(html).toContain("v2:font-sans");
    expect(html).toContain("v2:normal-case");
    expect(html).toContain('aria-current="page"');
  });

  it("the status strip keeps every row and gets state-colour markers under the new look", () => {
    const html = renderToStaticMarkup(
      <SettingsStatusStrip resendOn cronOn={false} uploadFailureCount={2} granola={{ on: false, last: null }} slackOn={false} />
    );
    for (const label of ["Email (Resend)", "Cron secret", "Storage uploads", "Granola intake", "Slack digest post"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("bg-acacia");
    expect(html).toContain("v2:bg-[color:var(--color-done)]");
    expect(html).toContain("v2:bg-[color:var(--color-warn)]");
    expect(html).toContain("v2:bg-[color:var(--color-ctl)]");
    // The old list stays (hidden under the new look); the new look gets the one-line summary.
    expect(html).toContain("v2:hidden");
    expect(html).toContain("other services have no problems");
  });

  it("the header is the first child of the shell, outside the 3xl wrapper", () => {
    const header = settings.indexOf("<PageHeader");
    const wrapper = settings.indexOf('<div className="max-w-3xl v2:max-w-none">');
    expect(header).toBeGreaterThan(-1);
    expect(wrapper).toBeGreaterThan(header);
  });
});

describe("Service Providers", () => {
  it("uses the same endpoints as before and the same handlers for Approve, Reject, Edit and Delete", () => {
    const urls = [...providers.matchAll(/fetch\(\s*[`"]([^`"]+)[`"]/g)].map((m) => m[1]);
    for (const u of urls) expect(u).toMatch(/^\/api\/(admin\/)?providers/);
    const actions = providers.slice(providers.indexOf("const providerActions"), providers.indexOf("const PROVIDER_CHIPS"));
    expect(actions).toContain("openEdit(p)");
    expect(actions).toContain("handleDelete(p.id)");
    const table = providers.slice(providers.indexOf("<DataTable"));
    expect(table).toContain('setStatus(p.id, "VETTED")');
    expect(table).toContain('setStatus(p.id, "REJECTED")');
    expect(table).toContain("actionsAlwaysVisible");
    // One table (admin audit #40): Pending review and Directory are groups of the same table.
    expect(table.match(/urlState=\{false\}/g)).toHaveLength(1);
  });
});

describe("Investor Links", () => {
  it("the pane copies, revokes through the same two-step confirm, and reads views from the same endpoint", () => {
    const pane = links.slice(links.indexOf("function renderLinkPane"), links.indexOf("const linkColumns"));
    expect(pane).toContain("copyLink(link.token, link.id)");
    expect(pane).toContain("setConfirmDeleteId(link.id)");
    expect(pane).toContain("handleDelete(link.id)");
    expect(pane).toContain("<LinkViews");
    expect(links).toContain("fetch(`/api/links/${id}`)");
    const urls = [...links.matchAll(/fetch\(\s*[`"]([^`"]+)[`"]/g)].map((m) => m[1]);
    for (const u of urls) expect(u).toMatch(/^\/api\/(links|admin\/updates)/);
  });

  it("lays out full width with the list and pane", () => {
    expect(links).toContain('width="full"');
    expect(links).toContain("<SplitView");
    expect(links).toContain("<OpenParam");
  });
});

describe("Diligence", () => {
  it("Promote and Decline are the same handlers, in two groups with Ready for review first", () => {
    const pane = diligence.slice(diligence.indexOf("function renderPane"), diligence.indexOf("const diligenceRows"));
    expect(pane).toContain("handlePromote(item.id)");
    expect(pane).toContain("askDecline(item)");
    expect(pane).toContain("DiligenceAnswers");
    expect(diligence).toContain('label: "Ready for review"');
    expect(diligence).toContain('label: "Awaiting founder"');
    expect(diligence.indexOf("const diligenceRows = [...readyForReview, ...awaitingFounder]")).toBeGreaterThan(-1);
  });

  it("still shows the retained-account notice", () => {
    expect(diligence).toContain("founderAccountsRetained");
    expect(diligence).toContain("needs manual cleanup");
  });
});
