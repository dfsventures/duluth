"use client";

import { useEffect, useState } from "react";
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
  Calendar,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RichEditor } from "@/components/ui/rich-editor";
import { useCompany } from "@/context/company-context";
import { ORG_NAME } from "@/lib/org";

interface MetricDefinition {
  id: string;
  name: string;
  unit: string | null;
}

interface UpdateTemplate {
  id: string;
  name: string;
  description: string | null;
  body: string;
}

export default function NewUpdatePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { selectedCompany, loading: companyLoading } = useCompany();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [templates, setTemplates] = useState<UpdateTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
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

        // Fetch metric definitions
        const metricsRes = await fetch(`/api/companies/${cId}/metrics`);
        if (metricsRes.ok) {
          const metricsData = await metricsRes.json();
          setMetrics(metricsData.data ?? metricsData ?? []);
        }

        // Fetch available update templates (optional — page works fine with none)
        const templatesRes = await fetch(`/api/templates`);
        if (templatesRes.ok) {
          const templatesData = await templatesRes.json();
          setTemplates(templatesData.data ?? templatesData ?? []);
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

  function applyTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    const isBodyEmpty = body.replace(/<[^>]*>/g, "").trim() === "";
    if (!isBodyEmpty && !window.confirm("Replace your current draft text with this template?")) {
      return;
    }

    setBody(template.body);
  }

  async function handleSubmit(status: "DRAFT" | "SENT", scheduledForISO?: string) {
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
          ...(scheduledForISO ? { scheduledFor: scheduledForISO } : {}),
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
            ? `Update published. The ${ORG_NAME} team has been notified.`
            : scheduledForISO
              ? `Draft scheduled to publish on ${new Date(scheduledForISO).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}.`
              : "Update saved as draft.",
      });
      setConfirmPublish(false);
      setShowSchedule(false);
      setScheduleDate("");

      // Reset form
      setPeriod("");
      setTitle("");
      setBody("");
      setMetricInputs({});

      // Redirect to the new update (fall back to the list page)
      router.push(newUpdate?.id ? `/updates/${newUpdate.id}` : "/updates");
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
        <PageHeader title="New Update" />
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
      <button
        onClick={() => router.push("/updates")}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Updates
      </button>

      <PageHeader
        title="New Update"
        description="Share your progress with your investors."
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

      {/* Create new update form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Update
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {templates.length > 0 && (
            <div>
              <label className="label mb-1.5 block" htmlFor="template-select">
                Start from a template
              </label>
              <select
                id="template-select"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyTemplate(e.target.value);
                  e.target.value = "";
                }}
                className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Optional — pick a template to prefill the update body</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.description ? ` — ${t.description}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

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

          {/* Validation errors repeat next to the buttons that trigger them —
              the top-of-page banner is out of view on this long form */}
          {message?.type === "error" && (
            <div className="flex items-center gap-2 rounded-md border border-laterite/30 bg-laterite/10 px-4 py-3 text-sm text-laterite">
              <AlertCircle className="h-4 w-4" />
              {message.text}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
            {confirmPublish ? (
              <>
                <span className="text-sm text-muted-foreground">
                  Publish and notify the {ORG_NAME} team?
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

          {/* Schedule for later (collapsed by default — pixel-identical flow for founders who ignore it) */}
          {!confirmPublish && (
            <div className="border-t pt-4">
              <button
                type="button"
                onClick={() => setShowSchedule((v) => !v)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <Calendar className="h-3.5 w-3.5" />
                Schedule for later
                {showSchedule ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>

              {showSchedule && (
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <Input
                    id="schedule-date"
                    label="Publish date"
                    type="date"
                    min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!scheduleDate || submitting}
                    onClick={() =>
                      handleSubmit("DRAFT", new Date(`${scheduleDate}T00:00:00Z`).toISOString())
                    }
                  >
                    {submitting ? "Scheduling..." : "Schedule"}
                  </Button>
                  <p className="w-full text-xs text-muted-foreground">
                    Publishes on the morning of the selected date (UTC). You can keep editing until then.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
