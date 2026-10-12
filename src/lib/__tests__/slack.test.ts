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
        { title: "no owner", ownerLabels: [], projectLabel: null, dueDate: null },
        { title: "A <x>", ownerLabels: ["Ann"], projectLabel: "Proj", dueDate: new Date("2026-10-12T00:00:00Z") },
      ],
    });
    expect(t.startsWith("*Wk &lt;1&gt; &amp; co* — 2 open items")).toBe(true);
    expect(t.indexOf("*Ann*")).toBeLessThan(t.indexOf("*Unassigned*"));
    expect(t).toContain("• A &lt;x&gt; _(Proj)_ — due Oct 12");
    expect(t).toContain("<https://m.test/d|Open digest> · <https://m.test/b|Open board>");
  });

  it("caps at 50 item lines then reports the rest", () => {
    const items = Array.from({ length: 53 }, (_, i) => ({ title: `t${i}`, ownerLabels: ["Ann"], projectLabel: null, dueDate: null }));
    const t = buildDigestSlackText({ ...base, items });
    expect(t.split("\n").filter((l) => l.startsWith("• ")).length).toBe(50);
    expect(t).toContain("…and 3 more");
  });
});

describe("slack text with shared items (Part 38)", () => {
  const shared = { title: "Send deck", ownerLabels: ["Jane Founder", "Sam Partner"], projectLabel: null, dueDate: null };

  it("lists a shared item under each owner and counts it once in the header", () => {
    const t = buildDigestSlackText({ ...base, items: [shared, { title: "solo", ownerLabels: ["Jane Founder"], projectLabel: null, dueDate: null }] });
    expect(t).toContain("— 2 open items");
    expect(t.split("\n").filter((l) => l.startsWith("• Send deck")).length).toBe(2);
    expect(t.indexOf("*Jane Founder*")).toBeGreaterThan(-1);
    expect(t.indexOf("*Sam Partner*")).toBeGreaterThan(-1);
  });

  it("ends each shared line with who else owns it (Q104-A), and not on a solo line", () => {
    const t = buildDigestSlackText({ ...base, items: [shared, { title: "solo", ownerLabels: ["Jane Founder"], projectLabel: null, dueDate: null }] });
    const lines = t.split("\n");
    const jane = lines.indexOf("*Jane Founder*");
    const sam = lines.indexOf("*Sam Partner*");
    expect(lines[jane + 1]).toBe("• Send deck — with Sam Partner");
    expect(lines[sam + 1]).toBe("• Send deck — with Jane Founder");
    expect(t).toContain("• solo\n");
  });

  it("escapes the suffix", () => {
    const t = buildDigestSlackText({
      ...base,
      items: [{ title: "x", ownerLabels: ["Ann", "B <&> Co"], projectLabel: null, dueDate: null }],
    });
    expect(t).toContain("— with B &lt;&amp;&gt; Co");
  });

  it("keeps Unassigned last", () => {
    const t = buildDigestSlackText({ ...base, items: [{ title: "n", ownerLabels: [], projectLabel: null, dueDate: null }, shared] });
    expect(t.indexOf("*Unassigned*")).toBeGreaterThan(t.indexOf("*Sam Partner*"));
  });

  it("the 50-line cap counts lines, and '…and N more' counts omitted lines", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ ...shared, title: `s${i}` })); // 60 lines
    const t = buildDigestSlackText({ ...base, items });
    expect(t.split("\n").filter((l) => l.startsWith("• ")).length).toBe(50);
    expect(t).toContain("…and 10 more");
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
