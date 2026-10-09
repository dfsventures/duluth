import Link from "next/link";
import { cn } from "@/lib/utils";
import { settingsTabHref, type SettingsTab } from "./settings-tabs-util";

type Tone = "ok" | "warn" | "neutral";

const MARKER: Record<Tone, string> = {
  ok: "bg-acacia",
  warn: "bg-ochre",
  neutral: "bg-border",
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

  return (
    <div className="mb-6 grid grid-cols-1 border border-border sm:grid-cols-2" aria-label="System status">
      {rows.map((r) => (
        <Link
          key={r.label}
          href={settingsTabHref(r.tab)}
          className="flex min-h-[44px] min-w-0 items-center gap-3 border-b border-border px-4 py-3 text-xs last:border-b-0 hover:bg-muted/40 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
        >
          <span className={cn("h-2 w-2 shrink-0", MARKER[r.tone])} aria-hidden />
          <span className="font-medium text-foreground">{r.label}</span>
          <span className="min-w-0 truncate text-muted-foreground">{r.text}</span>
        </Link>
      ))}
    </div>
  );
}
