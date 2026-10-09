import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildDigestSlackText, slackEscape, postToSlack, slackDigestEnabled } from "@/lib/slack";

const base = { title: "Wk <1> & co", digestUrl: "https://m.test/d", boardUrl: "https://m.test/b" };

describe("slack text", () => {
  it("escapes &, <, >", () => {
    expect(slackEscape("a&b<c>")).toBe("a&amp;b&lt;c&gt;");
  });

  it("groups by owner with Unassigned last, shows project and due date", () => {
    const t = buildDigestSlackText({
      ...base,
      items: [
        { title: "no owner", ownerLabel: null, projectLabel: null, dueDate: null },
        { title: "A <x>", ownerLabel: "Ann", projectLabel: "Proj", dueDate: new Date("2026-10-12T00:00:00Z") },
      ],
    });
    expect(t.startsWith("*Wk &lt;1&gt; &amp; co* — 2 open items")).toBe(true);
    expect(t.indexOf("*Ann*")).toBeLessThan(t.indexOf("*Unassigned*"));
    expect(t).toContain("• A &lt;x&gt; _(Proj)_ — due Oct 12");
    expect(t).toContain("<https://m.test/d|Open digest> · <https://m.test/b|Open board>");
  });

  it("caps at 50 item lines then reports the rest", () => {
    const items = Array.from({ length: 53 }, (_, i) => ({ title: `t${i}`, ownerLabel: "Ann", projectLabel: null, dueDate: null }));
    const t = buildDigestSlackText({ ...base, items });
    expect(t.split("\n").filter((l) => l.startsWith("• ")).length).toBe(50);
    expect(t).toContain("…and 3 more");
  });
});

describe("postToSlack", () => {
  const URL_SECRET = "https://hooks.slack.test/services/SECRET";
  beforeEach(() => { process.env.SLACK_DIGEST_WEBHOOK_URL = URL_SECRET; });
  afterEach(() => { delete process.env.SLACK_DIGEST_WEBHOOK_URL; vi.unstubAllGlobals(); });

  it("is disabled without the env var", async () => {
    delete process.env.SLACK_DIGEST_WEBHOOK_URL;
    expect(slackDigestEnabled()).toBe(false);
    expect((await postToSlack("x")).ok).toBe(false);
  });

  it("posts JSON text and reports ok", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", f);
    expect(await postToSlack("hi")).toEqual({ ok: true });
    expect(f.mock.calls[0][0]).toBe(URL_SECRET);
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ text: "hi" });
  });

  it("never leaks the URL in error text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`fail ${URL_SECRET}`)));
    const r = await postToSlack("hi");
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("SECRET");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(JSON.stringify(await postToSlack("hi"))).not.toContain("SECRET");
  });
});
