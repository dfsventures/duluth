"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SlackTestPanel({ configured }: { configured: boolean }) {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleTest() {
    setStatus("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/integrations/slack/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Something went wrong.");
      } else {
        setStatus("success");
        setMessage("Posted. Check the channel.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Check your connection and try again.");
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="sm" onClick={handleTest} disabled={!configured || status === "sending"}>
        <Send className="mr-2 h-3.5 w-3.5" />
        {status === "sending" ? "Posting..." : "Send test post"}
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
  );
}
