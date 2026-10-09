// Part 37, WS111.1 — optional Slack incoming-webhook post of a digest's open
// items. SLACK_DIGEST_WEBHOOK_URL is a SECRET (Slack treats the URL as the
// credential): never log it, never return it to a client, never put it in
// audit metadata. Error strings returned from here are fixed text only.

export function slackDigestEnabled(): boolean {
  return Boolean(process.env.SLACK_DIGEST_WEBHOOK_URL);
}

/** Slack treats only &, <, > as control characters (docs.slack.dev, "Escaping text"). */
export function slackEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type SlackDigestItem = {
  title: string;
  ownerLabel: string | null;
  projectLabel: string | null;
  dueDate: Date | null;
};

const MAX_LINES = 50;

function formatDue(d: Date): string {
  // Due dates are date-only, stored at 00:00 UTC.
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function buildDigestSlackText(o: {
  title: string;
  digestUrl: string;
  boardUrl: string;
  items: SlackDigestItem[];
}): string {
  const n = o.items.length;
  const lines: string[] = [`*${slackEscape(o.title)}* — ${n} open item${n === 1 ? "" : "s"}`];

  // Group by owner, first-seen order, Unassigned last.
  const groups = new Map<string, SlackDigestItem[]>();
  for (const it of o.items) {
    const key = it.ownerLabel?.trim() || "";
    const g = groups.get(key);
    if (g) g.push(it);
    else groups.set(key, [it]);
  }
  const keys = [...groups.keys()].filter((k) => k !== "");
  if (groups.has("")) keys.push("");

  let used = 0;
  let omitted = 0;
  for (const key of keys) {
    const items = groups.get(key)!;
    if (used >= MAX_LINES) {
      omitted += items.length;
      continue;
    }
    lines.push("", `*${key ? slackEscape(key) : "Unassigned"}*`);
    for (const it of items) {
      if (used >= MAX_LINES) {
        omitted++;
        continue;
      }
      let line = `• ${slackEscape(it.title)}`;
      if (it.projectLabel) line += ` _(${slackEscape(it.projectLabel)})_`;
      if (it.dueDate) line += ` — due ${formatDue(it.dueDate)}`;
      lines.push(line);
      used++;
    }
  }
  if (omitted > 0) lines.push(`…and ${omitted} more`);

  lines.push("", `<${o.digestUrl}|Open digest> · <${o.boardUrl}|Open board>`);
  return lines.join("\n");
}

export async function postToSlack(
  text: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = process.env.SLACK_DIGEST_WEBHOOK_URL;
  if (!url) return { ok: false, error: "not configured" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `Slack responded ${res.status}` };
    return { ok: true };
  } catch (err) {
    // Deliberately do not echo err.message: fetch errors can include the URL.
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, error: timedOut ? "timed out" : "network error" };
  }
}
