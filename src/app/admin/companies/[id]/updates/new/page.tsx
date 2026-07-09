"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichEditor } from "@/components/ui/rich-editor";
import { ComposerTopBar } from "@/components/composer/composer-top-bar";
import { ComposerTitleField } from "@/components/composer/composer-title-field";
import { ComposerDisclosure } from "@/components/composer/composer-disclosure";

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

  const canPublish = period.trim() !== "" && title.trim() !== "";

  return (
    <AppShell>
      <button
        onClick={() => router.push(`/admin/companies/${companyId}`)}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Company
      </button>

      <ComposerTopBar
        draftLabel={company ? `Draft in ${company.name}` : "Draft"}
        secondaryActions={
          <Button variant="secondary" size="sm" disabled={submitting} onClick={() => handleSubmit("DRAFT")}>
            {submitting ? "Saving..." : "Save as Draft"}
          </Button>
        }
        publishLabel="Send Update"
        onPublishClick={() => handleSubmit("SENT")}
        publishDisabled={!canPublish}
        publishing={submitting}
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

      <div className="mx-auto max-w-3xl">
        <ComposerTitleField title={title} onTitleChange={setTitle} period={period} onPeriodChange={setPeriod} />

        <RichEditor
          variant="chromeless"
          value={body}
          onChange={setBody}
          placeholder="Share progress, challenges, and plans…"
          companyId={companyId}
        />

        {metrics.length > 0 && (
          <ComposerDisclosure label="Details — metrics">
            <div>
              <p className="mb-3 text-sm font-medium">Metric Values for This Period</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {metrics.map((metric) => (
                  <Input
                    key={metric.id}
                    id={`metric-${metric.id}`}
                    label={`${metric.name}${metric.unit ? ` (${metric.unit})` : ""}`}
                    type="number"
                    step="any"
                    value={metricInputs[metric.id] ?? ""}
                    onChange={(e) => updateMetricInput(metric.id, e.target.value)}
                    placeholder="Enter value"
                  />
                ))}
              </div>
            </div>
          </ComposerDisclosure>
        )}
      </div>
    </AppShell>
  );
}
