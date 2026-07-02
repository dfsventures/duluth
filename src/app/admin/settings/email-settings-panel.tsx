"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmailStatus = "idle" | "sending" | "success" | "error";

export function EmailSettingsPanel({
  hasApiKey,
  emailFrom,
}: {
  hasApiKey: boolean;
  emailFrom: string;
}) {
  const [status, setStatus] = useState<EmailStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleTestEmail() {
    setStatus("sending");
    setMessage(null);

    try {
      const res = await fetch("/api/admin/test-email", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Something went wrong.");
      } else {
        setStatus("success");
        setMessage(`Sent to ${data.sentTo}`);
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Check your connection and try again.");
    }
  }

  return (
    <>
      {!hasApiKey && (
        <div className="mb-4 flex gap-2.5 rounded-md border border-ochre/30 bg-ochre/10 px-4 py-3 text-xs text-ochre">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>RESEND_API_KEY</strong> is not set. Add it to your environment variables to enable email delivery.{" "}
            <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">
              Get your key at resend.com
            </a>.
          </span>
        </div>
      )}

      <div className="mb-1 text-xs text-muted-foreground">
        Sending from: <span className="font-mono text-foreground">{emailFrom}</span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleTestEmail}
          disabled={status === "sending"}
        >
          <Send className="mr-2 h-3.5 w-3.5" />
          {status === "sending" ? "Sending..." : "Send Test Email"}
        </Button>

        {status === "success" && (
          <span className="flex items-center gap-1.5 text-sm text-acacia">
            <CheckCircle2 className="h-4 w-4" />
            {message}
          </span>
        )}
        {status === "error" && (
          <span className="flex items-center gap-1.5 text-sm text-laterite">
            <XCircle className="h-4 w-4" />
            {message}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Sends a test email to your admin account to verify the configuration.
      </p>
    </>
  );
}
