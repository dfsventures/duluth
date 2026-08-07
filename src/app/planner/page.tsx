"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Calculator, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { useCompany } from "@/context/company-context";

// Part 29, WS68 — Dilution Planner list page, mirroring /updates/page.tsx
// (list-plus-editor split, Q71-B: multiple named scenarios per company).
// Nothing here is persisted-and-shared beyond the founder's own company —
// see JC-CT-D (founder-private, no admin surface in v1).

interface Scenario {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export default function PlannerListPage() {
  const router = useRouter();
  const { selectedCompany, loading: companyLoading } = useCompany();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (companyLoading) return;

    async function load() {
      try {
        if (!selectedCompany) {
          setLoading(false);
          return;
        }
        const res = await fetch(`/api/companies/${selectedCompany.id}/scenarios`);
        if (res.ok) {
          setScenarios(await res.json());
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [companyLoading, selectedCompany?.id]);

  async function handleNewScenario() {
    if (!selectedCompany) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${selectedCompany.id}/scenarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to create scenario");
      }
      const scenario = await res.json();
      router.push(`/planner/${scenario.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create scenario.");
      setCreating(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, scenarioId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedCompany) return;
    if (!window.confirm("Delete this scenario? This cannot be undone.")) return;
    setDeletingId(scenarioId);
    try {
      const res = await fetch(`/api/companies/${selectedCompany.id}/scenarios/${scenarioId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setScenarios((prev) => prev.filter((s) => s.id !== scenarioId));
      }
    } finally {
      setDeletingId(null);
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

  if (!selectedCompany) {
    return (
      <AppShell>
        <PageHeader title="Dilution Planner" />
        <EmptyState
          icon={<Calculator className="h-10 w-10" />}
          title="No company found"
          description="Please complete the setup wizard first."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Dilution Planner"
        description="Model hypothetical fundraising scenarios and see how they'd dilute your ownership. Nothing here is your real cap table — you enter every assumption yourself."
        action={
          <Button onClick={handleNewScenario} disabled={creating}>
            <Plus className="mr-2 h-4 w-4" />
            {creating ? "Creating..." : "New Scenario"}
          </Button>
        }
      />

      {error && <p className="mb-6 text-sm text-laterite">{error}</p>}

      {scenarios.length === 0 ? (
        <EmptyState
          icon={<Calculator className="h-10 w-10" />}
          title="No scenarios yet"
          description="Create a scenario to start modeling founder equity dilution."
          action={
            <Button onClick={handleNewScenario} disabled={creating}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first scenario
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {scenarios.map((scenario) => (
            <Card key={scenario.id} className="transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between py-3">
                <Link href={`/planner/${scenario.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{scenario.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Updated {formatDate(scenario.updatedAt)}
                  </p>
                </Link>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <button
                    onClick={(e) => handleDelete(e, scenario.id)}
                    disabled={deletingId === scenario.id}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                    title="Delete scenario"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
