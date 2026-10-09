import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Part 37, WS111.2 — Slack post on digest send: never blocks email, never double-posts.

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));
const mockAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAdminAction: (...a: unknown[]) => mockAudit(...a) }));
vi.mock("@/lib/board-server", () => ({ buildDigestActionItems: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendWeeklyDigestEmail: vi.fn(), BASE_URL: "https://m.test" }));
const mockPost = vi.fn();
vi.mock("@/lib/slack", async (orig) => ({
  ...(await orig<typeof import("@/lib/slack")>()),
  postToSlack: (...a: unknown[]) => mockPost(...a),
}));

const { db } = vi.hoisted(() => ({
  db: {
    weeklyDigest: { findUnique: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn() },
    digestExtraRecipient: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db }));

import { requireAdmin } from "@/lib/auth-guard";
import { sendWeeklyDigestEmail } from "@/lib/email";
import { POST } from "@/app/api/admin/digest/[id]/send/route";

const call = () =>
  POST(new Request("https://m.test/x", { method: "POST" }), { params: Promise.resolve({ id: "d1" }) });

function digest(slackPostedAt: Date | null) {
  return {
    id: "d1", title: "T", sections: [], slackPostedAt, sentAt: null,
    todos: [
      { text: "open", completed: false, assignee: null, ownerLabel: "Ann", projectLabel: null, card: { dueDate: null } },
      { text: "done", completed: true, assignee: null, ownerLabel: "Ann", projectLabel: null, card: null },
    ],
  };
}

describe("digest send + Slack", () => {
  beforeEach(() => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "a", email: "a@x.com" }, error: null } as never);
    db.weeklyDigest.findUnique.mockReset();
    db.weeklyDigest.update.mockReset();
    db.user.findMany.mockResolvedValue([{ email: "a@x.com" }]);
    db.digestExtraRecipient.findMany.mockResolvedValue([]);
    mockPost.mockReset();
    mockAudit.mockReset();
    vi.mocked(sendWeeklyDigestEmail).mockReset();
    process.env.SLACK_DIGEST_WEBHOOK_URL = "https://hooks.slack.test/SECRET";
  });
  afterEach(() => { delete process.env.SLACK_DIGEST_WEBHOOK_URL; });

  function setDigest(d: ReturnType<typeof digest>) {
    db.weeklyDigest.findUnique.mockResolvedValueOnce({ sentAt: null }).mockResolvedValueOnce(d);
  }

  it("posts open items only, stamps slackPostedAt, audits status only", async () => {
    setDigest(digest(null));
    mockPost.mockResolvedValue({ ok: true });
    const body = await (await call()).json();
    expect(body.slack).toBe("posted");
    const text = mockPost.mock.calls[0][0] as string;
    expect(text).toContain("open");
    expect(text).not.toContain("done");
    expect(db.weeklyDigest.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { slackPostedAt: expect.any(Date) } });
    expect(JSON.stringify(mockAudit.mock.calls)).not.toContain("SECRET");
    expect(mockAudit.mock.calls[0][2].metadata.slack).toBe("posted");
  });

  it("does not re-post when slackPostedAt is set", async () => {
    setDigest(digest(new Date()));
    const body = await (await call()).json();
    expect(body.slack).toBe("already-posted");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("a failed post leaves slackPostedAt null and still succeeds", async () => {
    setDigest(digest(null));
    mockPost.mockResolvedValue({ ok: false, error: "Slack responded 500" });
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).slack).toBe("failed");
    expect(db.weeklyDigest.update).toHaveBeenCalledTimes(1); // sentAt only
  });

  it("is disabled without the env var", async () => {
    delete process.env.SLACK_DIGEST_WEBHOOK_URL;
    setDigest(digest(null));
    expect((await (await call()).json()).slack).toBe("disabled");
    expect(mockPost).not.toHaveBeenCalled();
  });
});
