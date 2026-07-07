"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Plus,
  BarChart3,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricChart } from "@/components/ui/metric-chart";
import { formatDate } from "@/lib/utils";
import { useCompany } from "@/context/company-context";

interface MetricWithValues {
  id: string;
  name: string;
  unit: string | null;
  values: { id: string; value: number; date: string }[];
}

export default function MetricsPage() {
  const { data: session } = useSession();
  const { selectedCompany, loading: companyLoading } = useCompany();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricWithValues[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // New metric definition form
  const [newMetricName, setNewMetricName] = useState("");
  const [newMetricUnit, setNewMetricUnit] = useState("");
  const [addingMetric, setAddingMetric] = useState(false);

  // New value forms (per metric)
  const [valueForms, setValueForms] = useState<
    Record<string, { date: string; value: string }>
  >({});
  const [addingValue, setAddingValue] = useState<string | null>(null);

  useEffect(() => {
    if (companyLoading) return;

    async function load() {
      try {
        if (!selectedCompany) {
          setLoading(false);
          return;
        }
        setCompanyId(selectedCompany.id);
        await loadMetrics(selectedCompany.id);
      } catch {
        setMessage({ type: "error", text: "Failed to load data." });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [companyLoading, selectedCompany?.id]);

  async function loadMetrics(cId: string) {
    const res = await fetch(`/api/companies/${cId}/metrics/history`);
    if (!res.ok) return;
    const data = await res.json();
    setMetrics(data.data ?? data ?? []);
  }

  async function handleAddMetric(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !newMetricName.trim()) return;

    setAddingMetric(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newMetricName.trim(),
          unit: newMetricUnit.trim() || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to add metric");
      }

      setNewMetricName("");
      setNewMetricUnit("");
      setMessage({ type: "success", text: "Metric added successfully." });
      await loadMetrics(companyId);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to add metric.",
      });
    } finally {
      setAddingMetric(false);
    }
  }

  async function handleAddValue(metricDefId: string) {
    if (!companyId) return;

    const formData = valueForms[metricDefId];
    if (!formData?.date || !formData?.value) return;

    setAddingValue(metricDefId);
    setMessage(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/metrics/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metricDefinitionId: metricDefId,
          date: formData.date,
          value: parseFloat(formData.value),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to add value");
      }

      setValueForms((prev) => ({
        ...prev,
        [metricDefId]: { date: "", value: "" },
      }));
      setMessage({ type: "success", text: "Metric value recorded." });
      await loadMetrics(companyId);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to add value.",
      });
    } finally {
      setAddingValue(null);
    }
  }

  function updateValueForm(
    metricDefId: string,
    field: "date" | "value",
    val: string
  ) {
    setValueForms((prev) => ({
      ...prev,
      [metricDefId]: { ...prev[metricDefId], [field]: val },
    }));
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
        <PageHeader title="Metrics" />
        <EmptyState
          icon={<BarChart3 className="h-10 w-10" />}
          title="No company found"
          description="Please complete the setup wizard first."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Metrics"
        description="Define and track your key metrics."
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

      {/* Define a new metric */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Define a New Metric</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddMetric} className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Input
                id="metricName"
                label="Metric Name"
                value={newMetricName}
                onChange={(e) => setNewMetricName(e.target.value)}
                placeholder="e.g. MRR, Active Users"
                required
              />
            </div>
            <div className="w-32">
              <Input
                id="metricUnit"
                label="Unit"
                value={newMetricUnit}
                onChange={(e) => setNewMetricUnit(e.target.value)}
                placeholder="e.g. USD, %"
              />
            </div>
            <Button type="submit" disabled={addingMetric}>
              <Plus className="mr-2 h-4 w-4" />
              {addingMetric ? "Adding..." : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Metrics list */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Your Metrics</h2>

        {metrics.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="h-8 w-8" />}
            title="No metrics defined"
            description="Add your first metric above to start tracking key indicators."
          />
        ) : (
          <div className="space-y-6">
            {metrics.map((metric) => {
              const formData = valueForms[metric.id] ?? { date: "", value: "" };

              return (
                <Card key={metric.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {metric.name}
                      {metric.unit && (
                        <span className="text-sm font-normal text-muted-foreground">
                          ({metric.unit})
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Chart */}
                    <div className="mb-4">
                      <MetricChart
                        name={metric.name}
                        unit={metric.unit}
                        values={metric.values.map((v) => ({
                          date: v.date,
                          value: Number(v.value),
                        }))}
                      />
                    </div>

                    {/* Add value form */}
                    <div className="mb-4 flex flex-wrap items-end gap-3 border-t pt-4">
                      <div className="w-44">
                        <Input
                          id={`date-${metric.id}`}
                          label="Date"
                          type="date"
                          value={formData.date}
                          onChange={(e) =>
                            updateValueForm(metric.id, "date", e.target.value)
                          }
                        />
                      </div>
                      <div className="w-36">
                        <Input
                          id={`value-${metric.id}`}
                          label="Value"
                          type="number"
                          step="any"
                          value={formData.value}
                          onChange={(e) =>
                            updateValueForm(
                              metric.id,
                              "value",
                              e.target.value
                            )
                          }
                          placeholder="0"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          addingValue === metric.id ||
                          !formData.date ||
                          !formData.value
                        }
                        onClick={() => handleAddValue(metric.id)}
                      >
                        {addingValue === metric.id ? "Adding..." : "Add Value"}
                      </Button>
                    </div>

                    {/* Recent values table */}
                    {metric.values.length > 0 && (
                      <div>
                        <p className="mb-2 text-sm font-medium text-muted-foreground">
                          Recent Values
                        </p>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="pb-2 font-medium">Date</th>
                              <th className="pb-2 font-medium">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {metric.values.slice(0, 10).map((v) => (
                              <tr key={v.id} className="border-b last:border-0">
                                <td className="py-2">{formatDate(v.date)}</td>
                                <td className="py-2">
                                  {Number(v.value).toLocaleString()}
                                  {metric.unit ? ` ${metric.unit}` : ""}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
