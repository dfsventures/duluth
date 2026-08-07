"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHead, Th, TableRow } from "@/components/ui/table";
import { useCompany } from "@/context/company-context";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";
import { cn } from "@/lib/utils";
import {
  computeCapTable,
  effectiveCapsForGroup,
  type ScenarioInput,
  type SafeInvestor,
} from "@/lib/cap-table";

// Part 29, WS68 — Dilution Planner editor. "use client", useCompany() for
// selectedCompany.id (same as /diligence). Computes the stage-by-stage
// breakdown live, client-side, by importing computeCapTable directly
// (JC-CT-B — instant feedback, no round-trip). Autosave mirrors the
// WS20 update-draft convention; a brand-new scenario is always created
// explicitly from /planner first (never auto-created on this route).

interface FounderRow {
  name: string;
}
interface SafeRow {
  name: string;
  amount: string;
  cap: string;
  mfn: boolean;
}

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function toSafeInvestors(rows: SafeRow[]): SafeInvestor[] {
  return rows.map((r) => ({ name: r.name, amount: num(r.amount), cap: num(r.cap), mfn: r.mfn }));
}

const emptyFounder = (): FounderRow => ({ name: "" });
const emptySafeRow = (): SafeRow => ({ name: "", amount: "", cap: "", mfn: false });

export default function ScenarioEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { selectedCompany, loading: companyLoading } = useCompany();
  const scenarioId = params.id as string;
  const companyId = selectedCompany?.id;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  const [scenarioName, setScenarioName] = useState("Base case");
  const [founders, setFounders] = useState<FounderRow[]>([emptyFounder()]);
  const [esopPct, setEsopPct] = useState("0");

  const [acceleratorEnabled, setAcceleratorEnabled] = useState(false);
  const [acceleratorTranche1Pct, setAcceleratorTranche1Pct] = useState("");
  const [acceleratorTranche2Amount, setAcceleratorTranche2Amount] = useState("");

  const [ffList, setFfList] = useState<SafeRow[]>([]);
  const [preSeedList, setPreSeedList] = useState<SafeRow[]>([]);

  const [seedEnabled, setSeedEnabled] = useState(false);
  const [seedRaiseAmount, setSeedRaiseAmount] = useState("");
  const [seedPostMoney, setSeedPostMoney] = useState("");

  const [seriesAEnabled, setSeriesAEnabled] = useState(false);
  const [seriesAPctSold, setSeriesAPctSold] = useState("");
  const [seriesAPostMoney, setSeriesAPostMoney] = useState("");

  const markDirty = useCallback(() => setDirty(true), []);

  const loadScenario = useCallback(
    async (cId: string) => {
      const res = await fetch(`/api/companies/${cId}/scenarios/${scenarioId}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("Failed to load scenario");
      const data = await res.json();
      const inputs: ScenarioInput = data.inputs ?? {};

      setScenarioName(data.name ?? "Base case");
      setFounders(
        inputs.founders && inputs.founders.length > 0
          ? inputs.founders.map((f) => ({ name: f.name }))
          : [emptyFounder()]
      );
      setEsopPct(String(inputs.esopPct ?? 0));

      if (inputs.accelerator) {
        setAcceleratorEnabled(true);
        setAcceleratorTranche1Pct(String(inputs.accelerator.tranche1Pct ?? 0));
        setAcceleratorTranche2Amount(
          inputs.accelerator.tranche2Amount !== undefined ? String(inputs.accelerator.tranche2Amount) : ""
        );
      } else {
        setAcceleratorEnabled(false);
        setAcceleratorTranche1Pct("");
        setAcceleratorTranche2Amount("");
      }

      setFfList(
        (inputs.friendsAndFamily ?? []).map((r) => ({
          name: r.name,
          amount: String(r.amount),
          cap: String(r.cap),
          mfn: r.mfn,
        }))
      );
      setPreSeedList(
        (inputs.preSeed ?? []).map((r) => ({
          name: r.name,
          amount: String(r.amount),
          cap: String(r.cap),
          mfn: r.mfn,
        }))
      );

      if (inputs.seed) {
        setSeedEnabled(true);
        setSeedRaiseAmount(String(inputs.seed.raiseAmount ?? 0));
        setSeedPostMoney(String(inputs.seed.postMoneyValuation ?? 0));
      } else {
        setSeedEnabled(false);
        setSeedRaiseAmount("");
        setSeedPostMoney("");
      }

      if (inputs.seriesA) {
        setSeriesAEnabled(true);
        setSeriesAPctSold(String(inputs.seriesA.pctSold ?? 0));
        setSeriesAPostMoney(String(inputs.seriesA.postMoneyValuation ?? 0));
      } else {
        setSeriesAEnabled(false);
        setSeriesAPctSold("");
        setSeriesAPostMoney("");
      }

      setDirty(false);
    },
    [scenarioId]
  );

  useEffect(() => {
    if (companyLoading) return;
    if (!companyId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        await loadScenario(companyId);
      } catch (err) {
        setMessage({ type: "error", text: err instanceof Error ? err.message : "Something went wrong." });
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId, companyLoading, loadScenario]);

  const scenarioInput: ScenarioInput = useMemo(
    () => ({
      founders: founders.map((f) => ({ name: f.name })),
      esopPct: num(esopPct),
      accelerator: acceleratorEnabled
        ? {
            tranche1Pct: num(acceleratorTranche1Pct),
            tranche2Amount: acceleratorTranche2Amount.trim() === "" ? undefined : num(acceleratorTranche2Amount),
          }
        : undefined,
      friendsAndFamily: toSafeInvestors(ffList),
      preSeed: toSafeInvestors(preSeedList),
      seed: seedEnabled ? { raiseAmount: num(seedRaiseAmount), postMoneyValuation: num(seedPostMoney) } : undefined,
      seriesA: seriesAEnabled
        ? { pctSold: num(seriesAPctSold), postMoneyValuation: num(seriesAPostMoney) }
        : undefined,
    }),
    [
      founders,
      esopPct,
      acceleratorEnabled,
      acceleratorTranche1Pct,
      acceleratorTranche2Amount,
      ffList,
      preSeedList,
      seedEnabled,
      seedRaiseAmount,
      seedPostMoney,
      seriesAEnabled,
      seriesAPctSold,
      seriesAPostMoney,
    ]
  );

  const result = useMemo(() => computeCapTable(scenarioInput), [scenarioInput]);
  const ffEffectiveCaps = useMemo(() => effectiveCapsForGroup(toSafeInvestors(ffList)), [ffList]);
  const preSeedEffectiveCaps = useMemo(() => effectiveCapsForGroup(toSafeInvestors(preSeedList)), [preSeedList]);

  async function handleSave(opts: { silent?: boolean } = {}) {
    const silent = opts.silent ?? false;
    if (!companyId) return;
    if (!silent) {
      setSaving(true);
      setMessage(null);
    }
    try {
      const res = await fetch(`/api/companies/${companyId}/scenarios/${scenarioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: scenarioName.trim() || "Base case", inputs: scenarioInput }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to save");
      }
      setDirty(false);
      if (!silent) setMessage({ type: "success", text: "Saved." });
    } catch (err) {
      if (!silent) {
        setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save." });
      }
      throw err;
    } finally {
      if (!silent) setSaving(false);
    }
  }

  const autosave = useDraftAutosave({
    enabled: !loading && !notFound,
    dirty,
    suppressed: saving || deleting,
    onSave: () => handleSave({ silent: true }),
  });

  async function handleDelete() {
    if (!companyId) return;
    if (!window.confirm("Delete this scenario? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/scenarios/${scenarioId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete scenario.");
      router.push("/planner");
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to delete scenario." });
      setDeleting(false);
    }
  }

  // ---- founders ----
  function addFounder() {
    setFounders((prev) => [...prev, emptyFounder()]);
    markDirty();
  }
  function removeFounder(i: number) {
    setFounders((prev) => prev.filter((_, idx) => idx !== i));
    markDirty();
  }
  function updateFounderName(i: number, name: string) {
    setFounders((prev) => prev.map((f, idx) => (idx === i ? { ...f, name } : f)));
    markDirty();
  }

  // ---- SAFE lists (shared by Friends & Family and Pre-seed) ----
  function addSafeRow(setter: Dispatch<SetStateAction<SafeRow[]>>) {
    setter((prev) => [...prev, emptySafeRow()]);
    markDirty();
  }
  function removeSafeRow(setter: Dispatch<SetStateAction<SafeRow[]>>, i: number) {
    setter((prev) => prev.filter((_, idx) => idx !== i));
    markDirty();
  }
  function updateSafeRow(setter: Dispatch<SetStateAction<SafeRow[]>>, i: number, patch: Partial<SafeRow>) {
    setter((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    markDirty();
  }

  function renderSafeList(
    rows: SafeRow[],
    setter: Dispatch<SetStateAction<SafeRow[]>>,
    effectiveCaps: number[],
    idPrefix: string
  ) {
    return (
      <div className="space-y-4">
        {rows.map((row, i) => (
          <div key={`${idPrefix}-${i}`} className="flex flex-wrap items-end gap-3 border-b border-bone pb-4 last:border-0 last:pb-0">
            <Input
              id={`${idPrefix}-name-${i}`}
              label="Name"
              className="w-full sm:w-40"
              value={row.name}
              onChange={(e) => updateSafeRow(setter, i, { name: e.target.value })}
              placeholder="Investor name"
            />
            <Input
              id={`${idPrefix}-amount-${i}`}
              label="Amount ($)"
              type="number"
              step="any"
              className="w-full sm:w-36"
              value={row.amount}
              onChange={(e) => updateSafeRow(setter, i, { amount: e.target.value })}
              placeholder="0"
            />
            <Input
              id={`${idPrefix}-cap-${i}`}
              label="Cap ($)"
              type="number"
              step="any"
              className="w-full sm:w-36"
              value={row.cap}
              onChange={(e) => updateSafeRow(setter, i, { cap: e.target.value })}
              placeholder="0"
            />
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={row.mfn}
                onChange={(e) => updateSafeRow(setter, i, { mfn: e.target.checked })}
                className="h-4 w-4 rounded-sm border-border accent-primary"
              />
              MFN
            </label>
            <p className="text-xs text-muted-foreground">
              Computed cap:{" "}
              {effectiveCaps[i] > 0 ? `$${effectiveCaps[i].toLocaleString()}` : "—"}
            </p>
            <button
              type="button"
              onClick={() => removeSafeRow(setter, i)}
              className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
              title="Remove investor"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={() => addSafeRow(setter)}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add investor
        </Button>
      </div>
    );
  }

  if (companyLoading || loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </AppShell>
    );
  }

  if (notFound || !companyId) {
    return (
      <AppShell>
        <PageHeader title="Scenario Not Found" />
        <p className="text-sm text-muted-foreground">
          This scenario could not be found or you don&apos;t have access.
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => router.push("/planner")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dilution Planner
        </Button>
      </AppShell>
    );
  }

  const startStage = result.stages.find((s) => s.id === "start");
  const enabledStages = result.stages.filter((s) => s.enabled);
  const lastStage = enabledStages[enabledStages.length - 1];
  const resultRows = lastStage ? lastStage.stakeholders : [];

  return (
    <AppShell>
      <PageHeader
        title={scenarioName || "Untitled scenario"}
        description="A hypothetical model — nothing here is your real cap table."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">{autosave.label}</span>
            <Button variant="secondary" size="sm" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? "Deleting..." : "Delete"}
            </Button>
            <Button size="sm" onClick={() => handleSave()} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      />

      {message && (
        <div
          className={cn(
            "mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm",
            message.type === "success"
              ? "border-acacia/30 bg-acacia/10 text-acacia"
              : "border-laterite/30 bg-laterite/10 text-laterite"
          )}
        >
          {message.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Scenario</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              id="scenarioName"
              label="Scenario name"
              value={scenarioName}
              onChange={(e) => {
                setScenarioName(e.target.value);
                markDirty();
              }}
              placeholder="e.g. Base case"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Founders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {founders.map((f, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3">
                <Input
                  id={`founder-${i}`}
                  label={`Founder ${i + 1}`}
                  className="w-full sm:w-64"
                  value={f.name}
                  onChange={(e) => updateFounderName(i, e.target.value)}
                  placeholder="Founder name"
                />
                <p className="text-xs text-muted-foreground">
                  {startStage && startStage.stakeholders[i] ? `${startStage.stakeholders[i].pct.toFixed(2)}%` : ""} starting split
                </p>
                <button
                  type="button"
                  onClick={() => removeFounder(i)}
                  className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  title="Remove founder"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={addFounder}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add founder
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ESOP</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              id="esopPct"
              label="ESOP pool (%, taken before external money)"
              type="number"
              step="any"
              className="w-full sm:w-48"
              value={esopPct}
              onChange={(e) => {
                setEsopPct(e.target.value);
                markDirty();
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accelerator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={acceleratorEnabled}
                onChange={(e) => {
                  setAcceleratorEnabled(e.target.checked);
                  markDirty();
                }}
                className="h-4 w-4 rounded-sm border-border accent-primary"
              />
              Include an accelerator investment
            </label>
            {acceleratorEnabled && (
              <div className="flex flex-wrap gap-3">
                <Input
                  id="acceleratorTranche1Pct"
                  label="Tranche 1 (%, fixed)"
                  type="number"
                  step="any"
                  className="w-full sm:w-48"
                  value={acceleratorTranche1Pct}
                  onChange={(e) => {
                    setAcceleratorTranche1Pct(e.target.value);
                    markDirty();
                  }}
                />
                <Input
                  id="acceleratorTranche2Amount"
                  label="Tranche 2 ($, optional — converts at seed)"
                  type="number"
                  step="any"
                  className="w-full sm:w-56"
                  value={acceleratorTranche2Amount}
                  onChange={(e) => {
                    setAcceleratorTranche2Amount(e.target.value);
                    markDirty();
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Friends &amp; Family</CardTitle>
          </CardHeader>
          <CardContent>{renderSafeList(ffList, setFfList, ffEffectiveCaps, "ff")}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pre-seed</CardTitle>
          </CardHeader>
          <CardContent>{renderSafeList(preSeedList, setPreSeedList, preSeedEffectiveCaps, "preseed")}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={seedEnabled}
                onChange={(e) => {
                  setSeedEnabled(e.target.checked);
                  markDirty();
                }}
                className="h-4 w-4 rounded-sm border-border accent-primary"
              />
              Include a seed round
            </label>
            {seedEnabled && (
              <div className="flex flex-wrap gap-3">
                <Input
                  id="seedRaiseAmount"
                  label="Raise amount ($)"
                  type="number"
                  step="any"
                  className="w-full sm:w-48"
                  value={seedRaiseAmount}
                  onChange={(e) => {
                    setSeedRaiseAmount(e.target.value);
                    markDirty();
                  }}
                />
                <Input
                  id="seedPostMoney"
                  label="Post-money valuation ($)"
                  type="number"
                  step="any"
                  className="w-full sm:w-56"
                  value={seedPostMoney}
                  onChange={(e) => {
                    setSeedPostMoney(e.target.value);
                    markDirty();
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Series A</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={seriesAEnabled}
                onChange={(e) => {
                  setSeriesAEnabled(e.target.checked);
                  markDirty();
                }}
                className="h-4 w-4 rounded-sm border-border accent-primary"
              />
              Include a Series A round
            </label>
            {seriesAEnabled && (
              <div className="flex flex-wrap gap-3">
                <Input
                  id="seriesAPctSold"
                  label="% of company sold"
                  type="number"
                  step="any"
                  className="w-full sm:w-48"
                  value={seriesAPctSold}
                  onChange={(e) => {
                    setSeriesAPctSold(e.target.value);
                    markDirty();
                  }}
                />
                <Input
                  id="seriesAPostMoney"
                  label="Post-money valuation ($, informational)"
                  type="number"
                  step="any"
                  className="w-full sm:w-56"
                  value={seriesAPostMoney}
                  onChange={(e) => {
                    setSeriesAPostMoney(e.target.value);
                    markDirty();
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent>
            {result.issues.length > 0 && (
              <div className="mb-4 space-y-2">
                {result.issues.map((issue, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-2 rounded-md border px-4 py-3 text-sm",
                      issue.level === "error"
                        ? "border-laterite/30 bg-laterite/10 text-laterite"
                        : "border-ochre/30 bg-ochre/10 text-ochre"
                    )}
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{issue.message}</span>
                  </div>
                ))}
              </div>
            )}

            <Table tableClassName="min-w-[640px]">
              <TableHead>
                <Th>Stakeholder</Th>
                {enabledStages.map((s) => (
                  <Th key={s.id} className="text-right">
                    {s.label}
                  </Th>
                ))}
              </TableHead>
              <tbody>
                {resultRows.map((row) => (
                  <TableRow key={row.id}>
                    <td className="px-4 py-2.5 font-medium">{row.label}</td>
                    {enabledStages.map((s) => {
                      const found = s.stakeholders.find((st) => st.id === row.id);
                      return (
                        <td key={s.id} className="px-4 py-2.5 text-right">
                          {found ? `${found.pct.toFixed(2)}%` : "—"}
                        </td>
                      );
                    })}
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Button variant="ghost" onClick={() => router.push("/planner")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dilution Planner
        </Button>
      </div>
    </AppShell>
  );
}
