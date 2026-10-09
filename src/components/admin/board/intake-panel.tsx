"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// Part 37 (WS109.4) — the board's Intake tab. Only rendered when the server
// wrapper says Granola is configured.

interface IntakeRow {
  id: string;
  noteId: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED" | "SKIPPED";
  noteTitle: string | null;
  digestId: string | null;
  cardsCreated: number;
  cardsLinked: number;
  skipReason: string | null;
  error: string | null;
  createdAt: string;
}
interface PreviewResult {
  outcome: string;
  reason?: string;
  needsReview: number;
  preview?: {
    digestTitle: string;
    items: { title: string; owner: string | null; project: string | null; needsReview: boolean; action: string }[];
  };
}

const VARIANT: Record<IntakeRow["status"], "success" | "warning" | "info" | "neutral" | "danger"> = {
  DONE: "success",
  PENDING: "warning",
  PROCESSING: "info",
  SKIPPED: "neutral",
  FAILED: "danger",
};

async function readError(res: Response, fallback: string) {
  const d = await res.json().catch(() => null);
  return d?.error ?? fallback;
}

export function IntakePanel({ onBoardChanged }: { onBoardChanged: () => void }) {
  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [noteId, setNoteId] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/granola/intakes");
      if (!res.ok) throw new Error(await readError(res, "Failed to load intake history."));
      setRows((await res.json()).intakes);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load intake history.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function check() {
    setBusy("check");
    setMsg("");
    try {
      const res = await fetch("/api/admin/granola/check", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res, "Check failed."));
      const s = await res.json();
      setMsg(
        s.found === 0
          ? "Granola returned no notes from your folder in the last 3 days. If you expected some, see \"Which notes can Molly see?\" below."
          : `Found ${s.found} note${s.found === 1 ? "" : "s"}: ${s.enqueued} new, ${s.processed} drafted, ${s.skipped} skipped, ${s.failed} failed.`
      );
      await load();
      onBoardChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Check failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runPreview(e: React.FormEvent) {
    e.preventDefault();
    setBusy("preview");
    setMsg("");
    setPreview(null);
    try {
      const res = await fetch("/api/admin/granola/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId }),
      });
      if (!res.ok) throw new Error(await readError(res, "Preview failed."));
      setPreview(await res.json());
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setBusy(null);
    }
  }

  async function retry(id: string) {
    setBusy(id);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/granola/intakes/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error(await readError(res, "Retry failed."));
      await load();
      onBoardChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Retry failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={check} disabled={busy !== null}>
          {busy === "check" ? "Checking…" : "Check Granola now"}
        </Button>
        <p className="min-w-48 flex-1 text-xs text-muted-foreground">
          Molly also checks once a day. New calls become <strong>drafts</strong>; nothing is ever sent automatically.
        </p>
      </div>

      {msg && (
        <p role="status" className="text-sm text-foreground">
          {msg}
        </p>
      )}

      <details className="rounded-sm border border-border px-3 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">Which notes can Molly see?</summary>
        <div className="mt-2 space-y-2">
          <p>
            Molly only reads notes in the one Granola folder it is configured for, and only a summary of each. What it
            can see in that folder depends on the kind of API key that was set:
          </p>
          <p>
            <strong className="text-foreground">Workspace key</strong> (made by a workspace admin): sees notes in
            spaces or folders that have API access enabled. It does not depend on who recorded the call.
          </p>
          <p>
            <strong className="text-foreground">Personal key</strong>: sees only notes owned by the key&apos;s owner or
            shared with them. Calls recorded by other teammates and not shared with that person will <em>never appear
            here</em>, and nothing will say they were missed.
          </p>
          <p>If a teammate&apos;s call is missing, check the folder&apos;s sharing and API access in Granola first.</p>
        </div>
      </details>

      <form onSubmit={runPreview} className="space-y-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Preview a note (writes nothing, uses one Claude call)
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Granola note id"
              placeholder="not_1d3tmYTlCICgjy"
              value={noteId}
              onChange={(e) => setNoteId(e.target.value)}
              className="h-9 w-64 font-mono"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={busy !== null || !noteId.trim()}>
              {busy === "preview" ? "Previewing…" : "Preview"}
            </Button>
          </div>
        </label>
      </form>

      {preview && (
        <div className="rounded-sm border border-border p-3 text-sm">
          {preview.preview ? (
            <>
              <p className="font-medium text-foreground">{preview.preview.digestTitle}</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Dry run: {preview.preview.items.length} item{preview.preview.items.length === 1 ? "" : "s"},{" "}
                {preview.needsReview} needing review. Nothing was saved.
              </p>
              <ul className="space-y-1">
                {preview.preview.items.map((i, idx) => (
                  <li key={idx} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{i.action}</span>
                    <span>{i.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {[i.owner, i.project].filter(Boolean).join(" · ")}
                    </span>
                    {i.needsReview && <span className="text-xs text-ochre">needs review</span>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">
              Not previewable: {preview.reason ?? preview.outcome}.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p className="py-6 text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="py-6 text-sm text-laterite">{error}</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">Nothing has come in yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">When</th>
                <th className="py-2 pr-3 font-semibold">Meeting</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Cards</th>
                <th className="py-2 pr-3 font-semibold">Draft</th>
                <th className="py-2 pr-3 font-semibold">Error / skip reason</th>
                <th className="py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="max-w-56 truncate py-2 pr-3">{r.noteTitle ?? <span className="text-muted-foreground">Untitled</span>}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={VARIANT[r.status]}>{r.status.toLowerCase()}</Badge>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-xs">
                    {r.status === "DONE" ? `${r.cardsCreated} new, ${r.cardsLinked} linked` : "–"}
                  </td>
                  <td className="py-2 pr-3">
                    {r.digestId ? (
                      <Link href={`/admin/digest/${r.digestId}`} className="text-primary underline">
                        Open
                      </Link>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="max-w-56 py-2 pr-3 text-xs text-muted-foreground">{r.error ?? r.skipReason ?? ""}</td>
                  <td className="py-2 text-right">
                    {r.status !== "PROCESSING" && (
                      <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => retry(r.id)}>
                        {busy === r.id ? "…" : "Retry"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
