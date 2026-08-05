import { redirect } from "next/navigation";
import { Mail, Bell, BookOpen, HardDrive } from "lucide-react";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { EmailSettingsPanel } from "./email-settings-panel";
import { DigestRecipientsPanel } from "./digest-recipients-panel";
import { StorageSettingsPanel } from "./storage-settings-panel";
import { OrphanedDocumentsPanel } from "./orphaned-documents-panel";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN")) {
    redirect("/login");
  }

  const hasApiKey = !!process.env.RESEND_API_KEY;
  const teamEmail = process.env.TEAM_EMAIL || "joseph@dfs.vc";
  const emailFrom = process.env.EMAIL_FROM || "Molly <noreply@dfs.vc>";

  return (
    <AppShell>
    <div className="max-w-2xl">
      <PageHeader
        title="Settings"
        description="Platform configuration and diagnostics."
      />

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Email</h2>
            <p className="text-xs text-muted-foreground">Transactional email via Resend</p>
          </div>
        </div>

        <div className="mb-4 rounded-md border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">Emails sent by Molly:</p>
          <ul className="space-y-1.5">
            <li><span className="font-medium text-foreground">Approval</span> — to the founder when their account is approved (includes set-password link)</li>
            <li><span className="font-medium text-foreground">Rejection</span> — to the founder when their access request is declined</li>
            <li>
              <span className="font-medium text-foreground">New application</span>
              {" "}— to <span className="font-mono text-foreground">{teamEmail}</span> when a founder applies for access
            </li>
            <li>
              <span className="font-medium text-foreground">Update published</span>
              {" "}— to <span className="font-mono text-foreground">{teamEmail}</span> when a founder publishes an update (includes metrics + full body)
            </li>
            <li>
              <span className="font-medium text-foreground">Update reminder</span>
              {" "}— to founders when they haven&apos;t submitted an update within their configured reminder window (set per-company in company settings)
            </li>
          </ul>
        </div>

        <EmailSettingsPanel hasApiKey={hasApiKey} emailFrom={emailFrom} />
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
            <HardDrive className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Storage</h2>
            <p className="text-xs text-muted-foreground">Document uploads via S3-compatible storage</p>
          </div>
        </div>
        <StorageSettingsPanel />
        <hr className="my-6 border-border" />
        <OrphanedDocumentsPanel />
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Reminders</h2>
            <p className="text-xs text-muted-foreground">Automated update reminders via Vercel Cron</p>
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground space-y-1.5">
          <p>
            <span className="font-medium text-foreground">Schedule</span>
            {" "}— runs daily at <span className="font-mono text-foreground">9:00 AM UTC</span> via Vercel Cron
          </p>
          <p>
            <span className="font-medium text-foreground">Per-company frequency</span>
            {" "}— configure reminder cadence (weekly, bi-weekly, monthly, or quarterly) on each company&apos;s detail page
          </p>
          <p>
            <span className="font-medium text-foreground">CRON_SECRET</span>
            {" "}— set this environment variable in Vercel to secure the cron endpoint. Without it, reminders will not be triggered.{" "}
            {process.env.CRON_SECRET ? (
              <span className="text-acacia font-medium">Configured</span>
            ) : (
              <span className="text-ochre font-medium">Not set</span>
            )}
          </p>
        </div>
      </section>
      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Weekly Digest Recipients</h2>
            <p className="text-xs text-muted-foreground">Choose which admins receive the weekly digest email</p>
          </div>
        </div>

        <DigestRecipientsPanel />
      </section>

    </div>
    </AppShell>
  );
}
