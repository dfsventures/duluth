"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

interface MetricChartProps {
  name: string;
  unit?: string | null;
  values: { date: string; value: number }[];
}

function formatAxisDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function formatTooltipDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function MetricChart({ name, unit, values }: MetricChartProps) {
  if (values.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Add at least 2 data points to see a chart.
      </p>
    );
  }

  const sorted = [...values].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={sorted} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickFormatter={formatAxisDate}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={(v) => (unit ? `${Number(v).toLocaleString()} ${unit}` : Number(v).toLocaleString())}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={unit ? 80 : 60}
        />
        <Tooltip
          formatter={(value) =>
            [`${Number(value).toLocaleString()}${unit ? ` ${unit}` : ""}`, name]
          }
          labelFormatter={(label) => (typeof label === "string" ? formatTooltipDate(label) : String(label))}
          contentStyle={{
            fontSize: 12,
            borderRadius: "6px",
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--background))",
            color: "hsl(var(--foreground))",
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ r: 3, fill: "hsl(var(--primary))" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
