import Link from "next/link";
import { cn } from "@/lib/utils";
import { settingsTabHref, type SettingsTab } from "./settings-tabs-util";

type Tone = "ok" | "warn" | "neutral";

const MARKER: Record<Tone, string> = {
  ok: "bg-acacia v2:bg-[color:var(--color-done)]",
  warn: "bg-ochre v2:bg-[color:var(--color-warn)]",
  neutral: "bg-border v2:bg-[color:var(--color-ctl)]",
};

interface Props {
  resendOn: boolean;
  cronOn: boolean;
  uploadFailureCount: number;
  granola: { on: boolean; webhookOn?: boolean; last: { status: string; createdAt: Date } | null };
  slackOn: boolean;
}

// Presence booleans only; no env value is ever passed in or rendered.
export function SettingsStatusStrip({ resendOn, cronOn, uploadFailureCount, granola, slackOn }: Props) {
  const rows: { label: string; text: string; tone: Tone; tab: SettingsTab }[] = [
    { label: "Email (Resend)", text: resendOn ? "Configured" : "Not set", tone: resendOn ? "ok" : "warn", tab: "email" },
    { label: "Cron secret", text: cronOn ? "Configured" : "Not set", tone: cronOn ? "ok" : "warn", tab: "email" },
    {
      label: "Storage uploads",
      text:
        uploadFailureCount > 0
          ? `${uploadFailureCount} failure${uploadFailureCount === 1 ? "" : "s"} in 7 days`
          : "No failures in 7 days",
      tone: uploadFailureCount > 0 ? "warn" : "ok",
      tab: "storage",
    },
    {
      label: "Granola intake",
      text: !granola.on
        ? "Not configured"
        : granola.last
          ? `Last intake: ${granola.last.status}, ${granola.last.createdAt.toISOString().slice(0, 10)}`
          : granola.webhookOn
          ? "Webhook active, no intake yet"
          : "Configured, webhook inactive",
      tone: granola.on ? "ok" : "neutral",
      tab: "integrations",
    },
    { label: "Slack digest post", text: slackOn ? "Configured" : "Not configured", tone: slackOn ? "ok" : "neutral", tab: "integrations" },
  ];

  const renderRow = (r: (typeof rows)[number]) => (
    <Link
      key={r.label}
      href={settingsTabHref(r.tab)}
      className="flex min-h-[44px] min-w-0 items-center gap-3 border-b border-border px-4 py-3 text-xs last:border-b-0 hover:bg-muted/40 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0 v2:min-h-[44px] v2:border-row-divider v2:px-0 v2:py-0 v2:text-body v2:hover:bg-row-hover v2:sm:[&:nth-last-child(2):nth-child(odd)]:border-b"
    >
      <span className={cn("h-2 w-2 shrink-0 v2:h-1.5 v2:w-1.5 v2:rounded-full", MARKER[r.tone])} aria-hidden />
      <span className="font-medium text-foreground">{r.label}</span>
      <span className="min-w-0 truncate text-muted-foreground">{r.text}</span>
    </Link>
  );

  // New look (audit #43): when nothing needs attention the strip is one line that opens to the list;
  // otherwise only the services that need attention show, and the working ones sit behind a line.
  const problems = rows.filter((r) => r.tone === "warn");
  const working = rows.filter((r) => r.tone !== "warn");
  const workingList = (
    <div className="grid grid-cols-1 border-t border-row-divider" aria-label="System status">
      {(problems.length === 0 ? rows : working).map(renderRow)}
    </div>
  );

  return (
    <>
      <div className="mb-6 grid grid-cols-1 border border-border sm:grid-cols-2 v2:hidden" aria-label="System status">
        {rows.map(renderRow)}
      </div>
      <div className="mb-8 hidden v2:block v2:max-w-[calc(168px+2.5rem+var(--column-narrow))]">
        {problems.length > 0 && <div className="mb-3 grid grid-cols-1" aria-label="Needs attention">{problems.map(renderRow)}</div>}
        <details className="group">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-3 text-body text-foreground [&::-webkit-details-marker]:hidden">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", problems.length === 0 ? MARKER.ok : MARKER.neutral)} aria-hidden />
            <span>
              {problems.length === 0
                ? `All ${rows.length} services are working`
                : `${working.length} other service${working.length === 1 ? " is" : "s are"} working`}
            </span>
            <span className="text-muted-foreground transition-transform group-open:rotate-90" aria-hidden>
              &rsaquo;
            </span>
          </summary>
          {workingList}
        </details>
      </div>
    </>
  );
}
