import { Mail } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { EmailSettingsPanel } from "./email-settings-panel";

export default function SettingsPage() {
  const hasApiKey = !!process.env.RESEND_API_KEY;
  const teamEmail = process.env.TEAM_EMAIL || "joseph@dfslab.net";
  const emailFrom = process.env.EMAIL_FROM || "Molly <noreply@dfslab.net>";

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
          </ul>
        </div>

        <EmailSettingsPanel hasApiKey={hasApiKey} emailFrom={emailFrom} />
      </section>
    </div>
    </AppShell>
  );
}
