"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";

type EmailStatus = "idle" | "sending" | "success" | "error";

export default function SettingsPage() {
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  async function handleTestEmail() {
    setEmailStatus("sending");
    setEmailMessage(null);

    try {
      const res = await fetch("/api/admin/test-email", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setEmailStatus("error");
        setEmailMessage(data.error || "Something went wrong.");
      } else {
        setEmailStatus("success");
        setEmailMessage(`Sent to ${data.sentTo}`);
      }
    } catch {
      setEmailStatus("error");
      setEmailMessage("Network error. Check your connection and try again.");
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Settings"
        description="Platform configuration and diagnostics."
      />

      {/* Email configuration */}
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
            <li><span className="font-medium text-foreground">Approval</span> — to founders when their account is approved (includes set-password link)</li>
            <li><span className="font-medium text-foreground">Rejection</span> — to founders when their access request is declined</li>
            <li><span className="font-medium text-foreground">New application</span> — to team@dfslab.net when a founder applies for access</li>
            <li><span className="font-medium text-foreground">Update published</span> — to team@dfslab.net when a founder publishes an update (includes metrics + full body)</li>
          </ul>
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 mb-4">
          <strong>Setup required:</strong> Add <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">RESEND_API_KEY</code> and <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">EMAIL_FROM</code> to your <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">.env.local</code> file to enable email delivery. Get your API key at{" "}
          <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">resend.com</a>.
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTestEmail}
            disabled={emailStatus === "sending"}
          >
            <Send className="mr-2 h-3.5 w-3.5" />
            {emailStatus === "sending" ? "Sending..." : "Send Test Email"}
          </Button>

          {emailStatus === "success" && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              {emailMessage}
            </span>
          )}
          {emailStatus === "error" && (
            <span className="flex items-center gap-1.5 text-sm text-red-600">
              <XCircle className="h-4 w-4" />
              {emailMessage}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Sends a test email to your admin account to verify the configuration.</p>
      </section>
    </div>
  );
}
