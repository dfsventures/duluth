"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "idle" | "uploading" | "verifying" | "success" | "error";

export function StorageSettingsPanel() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleTestUpload() {
    setStatus("uploading");
    setMessage(null);
    try {
      const initRes = await fetch("/api/admin/storage/test-upload", { method: "POST" });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || "Could not get a presigned URL.");

      // Same code path a real document upload takes — this exercises the
      // browser-side CORS preflight, not just the server-side credentials.
      const putRes = await fetch(initData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: "molly-storage-health-check",
      });
      if (!putRes.ok) throw new Error("The browser could not PUT to storage — likely a CORS policy issue.");

      setStatus("verifying");
      const confirmRes = await fetch("/api/admin/storage/test-upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: initData.key }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error || "Verification failed.");

      setStatus("success");
      setMessage("Upload, verification, and cleanup all succeeded.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Test upload failed.");
    }
  }

  const busy = status === "uploading" || status === "verifying";

  return (
    <>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={handleTestUpload} disabled={busy}>
          <Send className="mr-2 h-3.5 w-3.5" />
          {status === "uploading" ? "Uploading..." : status === "verifying" ? "Verifying..." : "Send Test Upload"}
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
        Uploads a small file directly from your browser — the same path a real document upload takes — verifies it
        landed in storage, then deletes it. Exercises credentials and CORS together.
      </p>
    </>
  );
}
