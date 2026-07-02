"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Building2,
  BarChart3,
  FileText,
  Plus,
  Trash2,
  AlertCircle,
  Upload,
} from "lucide-react";
import { normalizeUrl } from "@/lib/utils";
import { SectorCombobox } from "@/components/ui/sector-combobox";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const STEPS = [
  { label: "Company Profile", icon: Building2 },
  { label: "Define Metrics", icon: BarChart3 },
  { label: "Upload Documents", icon: FileText },
];

interface MetricDraft {
  name: string;
  unit: string;
}

export default function SetupWizardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Company profile
  const [companyName, setCompanyName] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companySector, setCompanySector] = useState("");
  const [companyGeography, setCompanyGeography] = useState("");

  // Step 2: Metrics
  const [metricDrafts, setMetricDrafts] = useState<MetricDraft[]>([
    { name: "", unit: "" },
  ]);

  // Created company ID (set after step 1 completes)
  const [companyId, setCompanyId] = useState<string | null>(null);

  function addMetricRow() {
    setMetricDrafts((prev) => [...prev, { name: "", unit: "" }]);
  }

  function removeMetricRow(index: number) {
    setMetricDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  function updateMetricDraft(
    index: number,
    field: "name" | "unit",
    value: string
  ) {
    setMetricDrafts((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  }

  function canProceed(): boolean {
    if (currentStep === 0) {
      return companyName.trim().length > 0;
    }
    return true;
  }

  async function handleNext() {
    setError(null);

    if (currentStep === 0) {
      // Create or update company
      setSubmitting(true);
      try {
        const res = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: companyName.trim(),
            description: companyDescription.trim() || null,
            website: normalizeUrl(companyWebsite) || null,
            sector: companySector || null,
            geography: companyGeography.trim() || null,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error ?? "Failed to create company");
        }

        const data = await res.json();
        const company = data.data ?? data;
        setCompanyId(company.id);
        setCurrentStep(1);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create company."
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (currentStep === 1) {
      // Save metric definitions
      if (!companyId) {
        setError("Company not created yet. Please go back and try again.");
        return;
      }

      setSubmitting(true);
      try {
        const validMetrics = metricDrafts.filter(
          (m) => m.name.trim().length > 0
        );

        for (const metric of validMetrics) {
          const res = await fetch(`/api/companies/${companyId}/metrics`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: metric.name.trim(),
              unit: metric.unit.trim() || null,
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => null);
            throw new Error(
              errData?.error ?? `Failed to create metric: ${metric.name}`
            );
          }
        }

        setCurrentStep(2);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save metrics."
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (currentStep === 2) {
      // Complete setup - redirect to dashboard
      router.push("/dashboard");
    }
  }

  function handleBack() {
    setError(null);
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Setup Your Account"
        description="Complete these steps to start using the Molly platform."
      />

      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;

            return (
              <div key={step.label} className="flex flex-1 items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                      isCompleted
                        ? "border-primary bg-primary text-primary-foreground"
                        : isActive
                          ? "border-primary text-primary"
                          : "border-muted-foreground/30 text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <StepIcon className="h-5 w-5" />
                    )}
                  </div>
                  <span
                    className={`mt-2 text-xs font-medium ${
                      isActive
                        ? "text-primary"
                        : isCompleted
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`mx-4 h-0.5 flex-1 ${
                      index < currentStep ? "bg-primary" : "bg-muted-foreground/20"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-md border border-laterite/30 bg-laterite/10 px-4 py-3 text-sm text-laterite">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Step 1: Company Profile */}
      {currentStep === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Company Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              id="companyName"
              label="Company Name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Your company name"
              required
            />

            <Textarea
              id="companyDescription"
              label="Description"
              value={companyDescription}
              onChange={(e) => setCompanyDescription(e.target.value)}
              placeholder="What does your company do?"
              rows={3}
            />

            <Input
              id="companyWebsite"
              label="Website"
              type="text"
              value={companyWebsite}
              onChange={(e) => setCompanyWebsite(e.target.value)}
              placeholder="yourcompany.com"
            />

            <SectorCombobox
              id="companySector"
              label="Sector"
              value={companySector}
              onChange={setCompanySector}
            />

            <Input
              id="companyGeography"
              label="Geography"
              value={companyGeography}
              onChange={(e) => setCompanyGeography(e.target.value)}
              placeholder="e.g. Kenya, West Africa, Pan-African"
            />
          </CardContent>
        </Card>
      )}

      {/* Step 2: Define Metrics */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Define Your Key Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Add the metrics you want to track and report on. You can always add
              more later.
            </p>

            <div className="space-y-3">
              {metricDrafts.map((metric, index) => (
                <div key={index} className="flex items-end gap-3">
                  <div className="flex-1">
                    <Input
                      id={`metricName-${index}`}
                      label={index === 0 ? "Metric Name" : undefined}
                      value={metric.name}
                      onChange={(e) =>
                        updateMetricDraft(index, "name", e.target.value)
                      }
                      placeholder="e.g. MRR, Active Users, GMV"
                    />
                  </div>
                  <div className="w-32">
                    <Input
                      id={`metricUnit-${index}`}
                      label={index === 0 ? "Unit" : undefined}
                      value={metric.unit}
                      onChange={(e) =>
                        updateMetricDraft(index, "unit", e.target.value)
                      }
                      placeholder="e.g. USD, %"
                    />
                  </div>
                  {metricDrafts.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMetricRow(index)}
                      title="Remove metric"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={addMetricRow}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Another Metric
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Upload Documents */}
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Initial Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Upload any relevant documents such as pitch decks, financial
              models, or reports. You can skip this step and upload later.
            </p>

            <div className="rounded-md border-2 border-dashed border-muted-foreground/25 p-8 text-center">
              <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="mb-3 text-sm text-muted-foreground">
                Drag and drop files here, or click to browse
              </p>
              <input
                type="file"
                multiple
                className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary-500"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation buttons */}
      <div className="mt-6 flex justify-between">
        <div>
          {currentStep > 0 && (
            <Button variant="secondary" onClick={handleBack} disabled={submitting}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
        </div>
        <div>
          {currentStep < STEPS.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed() || submitting}
            >
              {submitting ? "Saving..." : "Next"}
              {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          ) : (
            <Button onClick={handleNext} disabled={submitting}>
              <Check className="mr-2 h-4 w-4" />
              {submitting ? "Completing..." : "Complete Setup"}
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
