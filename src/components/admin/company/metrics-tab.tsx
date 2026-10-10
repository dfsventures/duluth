"use client";

import { useState } from "react";
import { BarChart3, Minus, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricChart } from "@/components/ui/metric-chart";
import { formatDate } from "@/lib/utils";
import type { FlashMessage } from "@/lib/use-flash-message";
import type { MetricDefinition } from "./types";

function getTrend(values: { value: number; date: string }[]) {
  if (values.length < 2) return "flat";
  const sorted = [...values].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  if (sorted[0].value > sorted[1].value) return "up";
  if (sorted[0].value < sorted[1].value) return "down";
  return "flat";
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-tone-sage-ink" />;
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-tone-clay-ink" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export function MetricsTab({
  companyId,
  metrics,
  setMetrics,
  reloadMetrics,
  setMessage,
}: {
  companyId: string;
  metrics: MetricDefinition[];
  setMetrics: React.Dispatch<React.SetStateAction<MetricDefinition[]>>;
  reloadMetrics: () => Promise<void>;
  setMessage: (m: FlashMessage | null) => void;
}) {
  const [showAddMetric, setShowAddMetric] = useState(false);
  const [newMetricName, setNewMetricName] = useState("");
  const [newMetricUnit, setNewMetricUnit] = useState("");
  const [addingMetric, setAddingMetric] = useState(false);
  const [deletingMetricId, setDeletingMetricId] = useState<string | null>(null);

  async function handleAddMetric() {
    if (!newMetricName.trim()) return;
    setAddingMetric(true);
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
      setShowAddMetric(false);
      await reloadMetrics();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to add metric.",
      });
    } finally {
      setAddingMetric(false);
    }
  }

  async function handleDeleteMetric(metricId: string) {
    setDeletingMetricId(metricId);
    try {
      const res = await fetch(
        `/api/companies/${companyId}/metrics/definitions/${metricId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to delete metric");
      }
      setMetrics((prev) => prev.filter((m) => m.id !== metricId));
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete metric.",
      });
    } finally {
      setDeletingMetricId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Metrics</h3>
        {!showAddMetric && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowAddMetric(true)}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add Metric
          </Button>
        )}
      </div>

      {showAddMetric && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <p className="mb-3 text-sm font-medium">New Metric Definition</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                id="metric-name"
                label="Name"
                value={newMetricName}
                onChange={(e) => setNewMetricName(e.target.value)}
                placeholder="e.g. MRR, Active Users"
              />
              <Input
                id="metric-unit"
                label="Unit (optional)"
                value={newMetricUnit}
                onChange={(e) => setNewMetricUnit(e.target.value)}
                placeholder="e.g. USD, %, count"
              />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowAddMetric(false);
                  setNewMetricName("");
                  setNewMetricUnit("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={addingMetric || !newMetricName.trim()}
                onClick={handleAddMetric}
              >
                {addingMetric ? "Adding..." : "Add Metric"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {metrics.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-8 w-8" />}
          title="No metrics defined"
          description="Add metric definitions to track key performance indicators."
        />
      ) : (
        <div className="space-y-4">
          {metrics.map((metric) => {
            const sortedValues = [...(metric.values ?? [])].sort(
              (a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            const latestValue = sortedValues.length > 0 ? sortedValues[0] : null;
            const trend = getTrend(metric.values ?? []);

            return (
              <Card key={metric.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {metric.name}
                      {metric.unit && (
                        <span className="ml-1 text-sm font-normal text-muted-foreground">
                          ({metric.unit})
                        </span>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-3">
                      {latestValue && (
                        <span className="text-lg font-semibold">
                          {latestValue.value}
                          {metric.unit ? ` ${metric.unit}` : ""}
                        </span>
                      )}
                      <TrendIcon trend={trend} />
                      <button
                        onClick={() => handleDeleteMetric(metric.id)}
                        disabled={deletingMetricId === metric.id}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                        title="Delete metric"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <MetricChart
                    name={metric.name}
                    unit={metric.unit}
                    values={sortedValues.map((v) => ({
                      date: v.date,
                      value: Number(v.value),
                    }))}
                  />
                  {sortedValues.length > 0 && (
                    <table className="mt-4 w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 font-medium">Date</th>
                          <th className="pb-2 text-right font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedValues.map((v, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2">{formatDate(v.date)}</td>
                            <td className="py-2 text-right font-medium">
                              {Number(v.value).toLocaleString()}
                              {metric.unit ? ` ${metric.unit}` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
