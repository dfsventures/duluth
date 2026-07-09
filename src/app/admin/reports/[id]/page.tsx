"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle, CheckCircle2, Eye } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { RichEditor } from "@/components/ui/rich-editor";
import { portcoMention } from "@/components/ui/portco-mention";
import { ComposerTopBar } from "@/components/composer/composer-top-bar";

interface ReportDetail {
  id: string;
  title: string;
  periodLabel: string | null;
  body: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  fundId: string;
  fund: { id: string; name: string; slug: string };
}

export default function AdminReportEditorPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadReport = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`);
      if (!res.ok) throw new Error("Failed to load report");
      const data: ReportDetail = await res.json();
      setReport(data);
      setTitle(data.title);
      setPeriodLabel(data.periodLabel ?? "");
      setBody(data.body ?? "");
    } catch {
      setMessage({ type: "error", text: "Failed to load report." });
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const fetchMentionItems = useCallback(
    async (query: string) => {
      if (!report) return [];
      const params = new URLSearchParams({ fundId: report.fundId });
      if (query) params.set("q", query);
      const res = await fetch(`/api/admin/portfolio-companies?${params}`);
      if (!res.ok) return [];
      const companies: { id: string; name: string }[] = await res.json();
      return companies.map((c) => ({ id: c.id, label: c.name }));
    },
    [report]
  );

  // The editor only reads its extensions once, at mount — building this
  // array is safe to repeat on every render (see rich-editor.tsx).
  const extraExtensions = useMemo(() => (report ? [portcoMention(fetchMentionItems)] : []), [report, fetchMentionItems]);

  async function handleSave() {
    if (!report) return;
    if (!title.trim()) {
      setMessage({ type: "error", text: "Title is required." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), periodLabel: periodLabel.trim() || null, body }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to save");
      }
      setMessage({ type: "success", text: "Report saved." });
      await loadReport();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/publish`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to publish");
      }
      setConfirmPublish(false);
      setMessage({ type: "success", text: "Report published — valuation snapshots frozen." });
      await loadReport();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to publish." });
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish() {
    setUnpublishing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/unpublish`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to unpublish");
      }
      setMessage({ type: "success", text: "Report unpublished — you can edit it again." });
      await loadReport();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to unpublish." });
    } finally {
      setUnpublishing(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </AppShell>
    );
  }

  if (!report) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Report not found.</p>
        <Button variant="secondary" className="mt-4" onClick={() => router.push("/admin/reports")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Reports
        </Button>
      </AppShell>
    );
  }

  const isDraft = report.status === "DRAFT";
  const canPublish = title.trim() !== "";

  return (
    <AppShell>
      <button
        onClick={() => router.push("/admin/reports")}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </button>

      <ComposerTopBar
        draftLabel={`${isDraft ? "Draft" : "Published"} in ${report.fund.name}`}
        secondaryActions={
          <>
            <Link href={`/admin/reports/${reportId}/preview`}>
              <Button variant="secondary" size="sm">
                <Eye className="mr-2 h-3.5 w-3.5" />
                Preview
              </Button>
            </Link>
            {isDraft && (
              <Button variant="secondary" size="sm" disabled={saving} onClick={handleSave}>
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </>
        }
        publishLabel={isDraft ? "Publish" : unpublishing ? "Unpublishing..." : "Unpublish to edit"}
        onPublishClick={isDraft ? () => setConfirmPublish(true) : handleUnpublish}
        publishDisabled={isDraft && !canPublish}
        publishing={isDraft ? publishing : unpublishing}
      />

      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
            message.type === "success" ? "border-acacia/30 bg-acacia/10 text-acacia" : "border-laterite/30 bg-laterite/10 text-laterite"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {confirmPublish && (
        <div className="mb-6 flex flex-wrap items-center justify-end gap-3 rounded-md border border-ochre/30 bg-ochre/10 px-4 py-3">
          <span className="text-sm text-ochre">Publishing freezes today&apos;s valuation numbers into this report. Continue?</span>
          <Button variant="secondary" size="sm" disabled={publishing} onClick={() => setConfirmPublish(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={publishing} onClick={handlePublish}>
            {publishing ? "Publishing..." : "Confirm Publish"}
          </Button>
        </div>
      )}

      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            aria-label="Title"
            disabled={!isDraft}
            className="w-full border-0 bg-transparent p-0 font-display text-3xl tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 disabled:opacity-80 sm:text-4xl"
          />
          <input
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.target.value)}
            placeholder="Period label (e.g. H1 2026)"
            aria-label="Period label"
            disabled={!isDraft}
            className="mt-2 w-64 border-0 bg-transparent p-0 font-mono text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
          />
        </div>

        {isDraft ? (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              Type <span className="font-mono">@</span> to mention a portfolio company — mentioned companies get a valuation hover card in the LP view.
            </p>
            <RichEditor variant="chromeless" value={body} onChange={setBody} placeholder="Dear limited partners…" extraExtensions={extraExtensions} />
          </>
        ) : (
          <div className="prose prose-sm max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: body }} />
        )}
      </div>
    </AppShell>
  );
}
