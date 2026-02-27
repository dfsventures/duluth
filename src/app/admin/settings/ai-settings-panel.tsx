"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AISettingsPanel({ hasOpenAIKey }: { hasOpenAIKey: boolean }) {
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleReindex() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/reindex", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Reindex failed");
      setStatus({
        type: "success",
        text: `Indexed ${data.indexed} update${data.indexed === 1 ? "" : "s"}${data.failed > 0 ? ` (${data.failed} failed)` : ""}.`,
      });
    } catch (err) {
      setStatus({
        type: "error",
        text: err instanceof Error ? err.message : "Reindex failed.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground space-y-1.5">
        <p>
          <span className="font-medium text-foreground">Embeddings</span>
          {" "}— OpenAI <span className="font-mono text-foreground">text-embedding-3-small</span> is used to index published updates for semantic search.
        </p>
        <p>
          <span className="font-medium text-foreground">Chat</span>
          {" "}— Anthropic <span className="font-mono text-foreground">claude-haiku-4-5</span> answers questions using the indexed data.
        </p>
        <p>
          <span className="font-medium text-foreground">OPENAI_API_KEY</span>{" "}
          {hasOpenAIKey ? (
            <span className="text-green-600 font-medium">Configured</span>
          ) : (
            <span className="text-amber-600 font-medium">Not set — AI indexing is disabled</span>
          )}
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          Re-index all published updates. Run this if the AI chat is missing data or after adding historical updates.
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || !hasOpenAIKey}
          onClick={handleReindex}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Indexing...
            </>
          ) : (
            "Re-index All Updates"
          )}
        </Button>
      </div>

      {status && (
        <div
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            status.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {status.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {status.text}
        </div>
      )}
    </div>
  );
}
