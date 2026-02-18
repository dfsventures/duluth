"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Send,
  Save,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Plus,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { RichEditor } from "@/components/ui/rich-editor";

interface MetricDefinition {
  id: string;
  name: string;
  unit: string | null;
}

interface Company {
  id: string;
  name: string;
}

export default function AdminCreateUpdatePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const companyId = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
    async function load() {
      try {
        // Fetch company info
        const companyRes = await fetch(`/api/companies/${companyId}`);
        if (!companyRes.ok) throw new Error("Failed to load company");
        const companyData = await companyRes.json();
        const c = companyData.data ?? companyData;
        setCompany({ id: c.id, name: c.name });

        // Fetch metric definitions
        const metricsRes = await fetch(`/api/companies/${companyId}/metrics`);
        if (metricsRes.ok) {
          const metricsData = await metricsRes.json();
          setMetrics(metricsData.data ?? metricsData ?? []);
        }
      } catch {
        setMessage({ type: "error", text: "Failed to load company data." });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [companyId]);

  function updateMetricInput(metricId: string, value: string) {
    setMetricInputs((prev) => ({ ...prev, [metricId]: value }));
  }

  async function handleSubmit(status: "DRAFT" | "SENT") {
    if (!period.trim() || !title.trim()) {
      setMessage({ type: "error", text: "Period and title are required." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const metricValues = Object.entries(metricInputs)
        .filter(([, val]) => val.trim() !== "")
        .map(([metricDefinitionId, value]) => ({
          metricDefinitionId,
          value: parseFloat(value),
        }));

      const res = await fetch(`/api/companies/${companyId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: period.trim(),
          title: title.trim(),
          body: body.trim(),
          status,
          metricValues,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to create update");
      }

      setMessage({
        type: "success",
        text:
          status === "SENT"
            ? "Update sent successfully."
            : "Update saved as draft.",
      });

      // Redirect back to company detail
      router.push(`/admin/companies/${companyId}`);
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

  return (
    <AppShell>
      <PageHeader
        title={`Create Update${company ? ` for ${company.name}` : ""}`}
        description="Create an update on behalf of this company."
        action={
          <Button
            variant="ghost"
            onClick={() => router.push(`/admin/companies/${companyId}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Company
          </Button>
        }
      />

      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            New Update
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
              placeholder="Share progress, challenges, and plans..."
              companyId={companyId}
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

          {/* Action buttons */}
          <div className="flex justify-end gap-3 border-t pt-4">
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
              onClick={() => handleSubmit("SENT")}
            >
              <Send className="mr-2 h-4 w-4" />
              {submitting ? "Sending..." : "Send Update"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
