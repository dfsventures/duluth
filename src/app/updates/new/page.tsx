"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Plus,
  Globe,
  Save,
  FileText,
  AlertCircle,
  CheckCircle2,
  Upload,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RichEditor } from "@/components/ui/rich-editor";
import { formatDate, formatPeriod } from "@/lib/utils";
import { useCompany } from "@/context/company-context";

interface Update {
  id: string;
  title: string;
  period: string;
  status: "DRAFT" | "SENT";
  createdAt: string;
}

interface MetricDefinition {
  id: string;
  name: string;
  unit: string | null;
}

export default function NewUpdatePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { selectedCompany, loading: companyLoading } = useCompany();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Form state
  const [period, setPeriod] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [metricInputs, setMetricInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (companyLoading) return;

    async function load() {
      try {
        if (!selectedCompany) {
          setLoading(false);
          return;
        }

        const cId = selectedCompany.id;
        setCompanyId(cId);

        // Fetch existing updates
        const updatesRes = await fetch(`/api/companies/${cId}/updates`);
        if (updatesRes.ok) {
          const updatesData = await updatesRes.json();
          setUpdates(updatesData.data ?? updatesData ?? []);
        }

        // Fetch metric definitions
        const metricsRes = await fetch(`/api/companies/${cId}/metrics`);
        if (metricsRes.ok) {
          const metricsData = await metricsRes.json();
          setMetrics(metricsData.data ?? metricsData ?? []);
        }
      } catch {
        setMessage({ type: "error", text: "Failed to load data." });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [companyLoading, selectedCompany?.id]);

  function updateMetricInput(metricId: string, value: string) {
    setMetricInputs((prev) => ({ ...prev, [metricId]: value }));
  }

  async function handleDelete(updateId: string) {
    setDeletingId(updateId);
    try {
      const res = await fetch(`/api/updates/${updateId}`, { method: "DELETE" });
      if (res.ok) {
        setUpdates((prev) => prev.filter((u) => u.id !== updateId));
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSubmit(status: "DRAFT" | "SENT") {
    if (!companyId) return;

    if (!period.trim() || !title.trim()) {
      setMessage({ type: "error", text: "Period and title are required." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      // Build metric values array
      const metrics = Object.entries(metricInputs)
        .filter(([, val]) => val.trim() !== "")
        .map(([metricDefinitionId, value]) => ({
          metricDefinitionId,
          value: parseFloat(value),
          date: new Date().toISOString(),
        }));

      const res = await fetch(`/api/companies/${companyId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: period.trim(),
          title: title.trim(),
          body: body.trim(),
          status,
          metrics,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to create update");
      }

      const result = await res.json();
      const newUpdate = result.data ?? result;

      setMessage({
        type: "success",
        text:
          status === "SENT"
            ? "Update published. The DFS Lab team has been notified."
            : "Update saved as draft.",
      });
      setConfirmPublish(false);

      // Reset form
      setPeriod("");
      setTitle("");
      setBody("");
      setMetricInputs({});

      // Redirect to the new update
      if (newUpdate?.id) {
        router.push(`/updates/${newUpdate.id}`);
      } else {
        // Reload updates list
        const updatesRes = await fetch(`/api/companies/${companyId}/updates`);
        if (updatesRes.ok) {
          const updatesData = await updatesRes.json();
          setUpdates(updatesData.data ?? updatesData ?? []);
        }
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create update.",
      });
    } finally {
      setSubmitting(false);
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

  if (!companyId) {
    return (
      <AppShell>
        <PageHeader title="Updates" />
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="No company found"
          description="Please complete the setup wizard first."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Updates"
        description="Create and manage portfolio updates for Molly."
      />

      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-acacia/30 bg-acacia/10 text-acacia"
              : "border-laterite/30 bg-laterite/10 text-laterite"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {message.text}
        </div>
      )}

      {/* Existing updates */}
      {updates.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Previous Updates</h2>
          <div className="space-y-2">
            {updates.map((update) => (
              <Card key={update.id} className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between py-3">
                  <Link href={`/updates/${update.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{update.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatPeriod(update.period)} &middot;{" "}
                      {formatDate(update.createdAt)}
                    </p>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <Badge variant={update.status === "SENT" ? "success" : "warning"}>
                      {update.status === "SENT" ? "Published" : "Draft"}
                    </Badge>
                    {update.status === "DRAFT" && (
                      <button
                        onClick={() => handleDelete(update.id)}
                        disabled={deletingId === update.id}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                        title="Delete draft"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Create new update form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Update
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="period"
              label="Period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="e.g. 2025-Q1"
              required
            />
            <Input
              id="title"
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q1 2025 Update"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="label">Update Body</label>
            <RichEditor
              value={body}
              onChange={setBody}
              placeholder="Share your progress, challenges, and plans..."
              companyId={companyId ?? undefined}
            />
          </div>

          {/* Metric inputs */}
          {metrics.length > 0 && (
            <div>
              <p className="mb-3 text-sm font-medium">
                Metric Values for This Period
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {metrics.map((metric) => (
                  <Input
                    key={metric.id}
                    id={`metric-${metric.id}`}
                    label={`${metric.name}${metric.unit ? ` (${metric.unit})` : ""}`}
                    type="number"
                    step="any"
                    value={metricInputs[metric.id] ?? ""}
                    onChange={(e) =>
                      updateMetricInput(metric.id, e.target.value)
                    }
                    placeholder="Enter value"
                  />
                ))}
              </div>
            </div>
          )}

          {/* File attachments placeholder */}
          <div>
            <p className="mb-2 text-sm font-medium">Attachments</p>
            <div className="flex items-center gap-3 rounded-md border-2 border-dashed border-muted-foreground/25 p-4">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <input
                type="file"
                multiple
                className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary-500"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 border-t pt-4">
            {confirmPublish ? (
              <>
                <span className="text-sm text-muted-foreground">
                  Publish and notify the DFS Lab team?
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={submitting}
                  onClick={() => setConfirmPublish(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={submitting}
                  onClick={() => handleSubmit("SENT")}
                >
                  {submitting ? "Publishing..." : "Confirm Publish"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => handleSubmit("DRAFT")}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {submitting ? "Saving..." : "Save as Draft"}
                </Button>
                <Button
                  disabled={submitting}
                  onClick={() => setConfirmPublish(true)}
                >
                  <Globe className="mr-2 h-4 w-4" />
                  Publish
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
