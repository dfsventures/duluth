"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Upload, Bell } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ComposerDisclosure } from "@/components/composer/composer-disclosure";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusDot } from "@/components/ui/status-dot";
import { NameTile, StageChip } from "@/components/ui/name-tile";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { cadenceStatus } from "@/lib/update-cadence";
import { parseCompanyCsv, type CompanyCsvRow } from "@/lib/company-csv";
import { toast } from "@/lib/toast";
import type { FilterChipDef } from "@/lib/data-table";

interface Company {
  id: string;
  name: string;
  sector: string | null;
  geography: string | null;
  fundingStage: string | null;
  memberCount: number;
  lastUpdateDate: string | null;
  createdAt: string;
  recentPublishedUpdates: { sentAt: string | null }[];
}

interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

type CadenceKey = "new" | "current" | "aging" | "behind";

interface Row extends Company {
  cadence: CadenceKey;
  statusLabel: string;
  daysSince: number | null;
}

// Part 32, WS85 (D1) — the shared, already-shipped grace+cadence logic (F68).
// A brand-new company with zero updates gets a neutral "No updates yet", never
// the same red as a 90-day-delinquent one: clay is reserved for a state that
// actually requires intervention (C02).
const STATUS: Record<CadenceKey, string> = {
  new: "No updates yet",
  current: "Current",
  aging: "Aging",
  behind: "Behind",
};

function toRow(c: Company): Row {
  const s = cadenceStatus({
    createdAt: new Date(c.createdAt),
    publishedUpdates: c.recentPublishedUpdates.map((u) => ({ sentAt: u.sentAt ? new Date(u.sentAt) : null })),
  });
  const cadence = s.toLowerCase() as CadenceKey;
  const daysSince = c.lastUpdateDate
    ? Math.max(0, Math.floor((Date.now() - new Date(c.lastUpdateDate).getTime()) / 86_400_000))
    : null;
  return { ...c, cadence, statusLabel: STATUS[cadence], daysSince };
}

// "Who is behind" first: the chips answer it in one click.
const CHIPS: FilterChipDef<Row>[] = [
  { key: "behind", label: "Behind", test: (r) => r.cadence === "behind" },
  { key: "aging", label: "Aging", test: (r) => r.cadence === "aging" },
  { key: "current", label: "Current", test: (r) => r.cadence === "current" },
  { key: "new", label: "No updates yet", test: (r) => r.cadence === "new" },
];

const CADENCE_ORDER: Record<CadenceKey, number> = { behind: 0, aging: 1, new: 2, current: 3 };

export default function AdminCompaniesPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reminding, setReminding] = useState<Record<string, boolean>>({});

  // Import: pick a file, preview the parsed rows, then commit. Nothing is sent
  // until the admin confirms.
  const [preview, setPreview] = useState<{ fileName: string; rows: CompanyCsvRow[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/companies");
      if (!res.ok) throw new Error("Failed to load companies");
      const data = await res.json();
      setCompanies(data.data ?? data ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const rows = useMemo(() => companies.map(toRow), [companies]);
  const existingNames = useMemo(() => new Set(companies.map((c) => c.name.trim().toLowerCase())), [companies]);

  async function handleCSVFile(file: File) {
    const text = await file.text();
    const parsed = parseCompanyCsv(text);
    if (parsed.length === 0) {
      toast.error('No valid rows found. The CSV needs a "name" column and, optionally, a "url" column.');
      return;
    }
    setImportResult(null);
    setPreview({ fileName: file.name, rows: parsed });
  }

  function closePreview() {
    setPreview(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function commitImport() {
    if (!preview) return;
    setImporting(true);
    try {
      const res = await fetch("/api/admin/companies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companies: preview.rows }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Import failed");
      }
      const result: ImportResult = await res.json();
      if (result.errors.length > 0) {
        // Keep the dialog open so the errors can be read.
        setImportResult(result);
      } else {
        closePreview();
      }
      toast.success(
        `Imported ${result.created} ${result.created === 1 ? "company" : "companies"}` +
          (result.skipped > 0 ? `, ${result.skipped} skipped (already exist)` : "") +
          "."
      );
      if (result.created > 0) await fetchCompanies();
    } catch (err) {
      // Not idempotent-safe to auto-retry blindly, but the import skips existing
      // names, so Retry is safe here.
      toast.error(err instanceof Error ? err.message : "Import failed", { retry: commitImport });
    } finally {
      setImporting(false);
    }
  }

  async function sendReminder(c: Row) {
    setReminding((p) => ({ ...p, [c.id]: true }));
    try {
      const res = await fetch(`/api/companies/${c.id}/remind`, { method: "POST" });
      if (res.ok) toast.success(`Reminder sent to ${c.name}.`);
      // Server-confirmed and not idempotent (a resend emails founders twice): no Retry.
      else toast.error(`Couldn't send the reminder to ${c.name}.`);
    } catch {
      toast.error(`Couldn't send the reminder to ${c.name}.`);
    } finally {
      setReminding((p) => ({ ...p, [c.id]: false }));
    }
  }

  const columns: DataTableColumn<Row>[] = [
    {
      key: "name",
      header: "Company",
      sortValue: (r) => r.name,
      cell: (r) => (
        <>
          <NameTile name={r.name} />
          {r.name}
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => CADENCE_ORDER[r.cadence],
      mobile: "badge",
      cell: (r) => <StatusDot status={r.cadence}>{r.statusLabel}</StatusDot>,
    },
    {
      key: "sector",
      header: "Sector",
      sortValue: (r) => r.sector,
      mobile: "meta",
      cell: (r) => r.sector ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "stage",
      header: "Stage",
      sortValue: (r) => r.fundingStage,
      cell: (r) => <StageChip stage={r.fundingStage} />,
    },
    {
      key: "geography",
      header: "Location",
      sortValue: (r) => r.geography,
      mobile: "meta",
      cell: (r) => r.geography ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "lastUpdate",
      header: "Last update",
      align: "num",
      // Oldest update (largest day count) first; "never" sorts last.
      sortValue: (r) => r.daysSince,
      firstDir: "desc",
      mobile: "meta",
      cell: (r) =>
        r.lastUpdateDate ? (
          <span title={formatDate(r.lastUpdateDate)} className={r.cadence === "behind" ? "text-tone-clay-ink" : undefined}>
            {r.daysSince === 0 ? "Today" : `${r.daysSince}d ago`}
          </span>
        ) : (
          <span className="text-muted-foreground">None</span>
        ),
    },
    {
      key: "members",
      header: "Members",
      align: "num",
      sortValue: (r) => r.memberCount,
      firstDir: "desc",
      cell: (r) => r.memberCount,
    },
  ];

  const importBlockedNames = preview ? preview.rows.filter((r) => existingNames.has(r.name.trim().toLowerCase())).length : 0;

  return (
    <AppShell>
      <PageHeader
        title="Companies"
        description="Manage all portfolio companies."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              aria-label="Choose a CSV file of companies to import"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCSVFile(file);
              }}
            />
            <Button onClick={() => router.push("/admin/companies/new")}>
              <Plus className="h-4 w-4" />
              Add Company
            </Button>
          </div>
        }
      />

      <div className="mb-4">
        <ComposerDisclosure label="CSV format">
          <p className="text-sm text-muted-foreground">
            To bulk import, upload a CSV with a <code className="rounded bg-muted px-1 text-xs">name</code> column and
            optional <code className="rounded bg-muted px-1 text-xs">url</code> column. You will see a preview before
            anything is created. Founders fill in remaining details after gaining access.
          </p>
        </ComposerDisclosure>
      </div>

      <DataTable<Row>
        label="Companies"
        noun="company"
        pluralNoun="companies"
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/companies/${r.id}`}
        columns={columns}
        defaultSort={{ key: "name", dir: "asc" }}
        searchText={(r) => [r.name, r.sector, r.geography, r.fundingStage]}
        searchPlaceholder="Filter companies"
        chips={CHIPS}
        loading={loading}
        error={error}
        onRetry={() => {
          setLoading(true);
          fetchCompanies();
        }}
        minWidth={820}
        actionsLabel="Row actions"
        rowActions={(r) =>
          r.cadence === "behind" || r.cadence === "aging" ? (
            <Button variant="ghost" size="sm" loading={reminding[r.id]} onClick={() => sendReminder(r)}>
              <Bell className="h-3.5 w-3.5" />
              Remind
              <span className="sr-only"> {r.name}</span>
            </Button>
          ) : null
        }
        empty={
          <EmptyState
            icon={<Building2 className="h-10 w-10" />}
            title="No companies yet"
            description="Add your first portfolio company manually, or import a list from a CSV (a name column, optionally a url column)."
            action={
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Import CSV
                </Button>
                <Button onClick={() => router.push("/admin/companies/new")}>
                  <Plus className="h-4 w-4" />
                  Add Company
                </Button>
              </div>
            }
          />
        }
      />

      <Dialog open={preview !== null} onOpenChange={(o) => !o && !importing && closePreview()}>
        {preview && (
          <DialogContent
            title="Import companies"
            description={`${preview.fileName}: ${preview.rows.length} ${preview.rows.length === 1 ? "row" : "rows"} found.`}
            size="lg"
          >
            <DialogBody>
              {importBlockedNames > 0 && (
                <p className="mb-3 border-l-2 border-attention bg-attention-bg px-3 py-2 text-sm text-foreground">
                  {importBlockedNames} {importBlockedNames === 1 ? "company already exists" : "companies already exist"} and
                  will be skipped.
                </p>
              )}
              <div className="max-h-72 overflow-y-auto border border-border">
                <table className="w-full text-[13px]">
                  <caption className="sr-only">Rows that will be imported</caption>
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="h-8 px-3 font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">
                        Name
                      </th>
                      <th scope="col" className="h-8 px-3 font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">
                        Website
                      </th>
                      <th scope="col" className="h-8 px-3 font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">
                        Result
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => {
                      const exists = existingNames.has(r.name.trim().toLowerCase());
                      return (
                        <tr key={`${r.name}-${i}`} className="border-b border-row-divider last:border-0">
                          <td className="px-3 py-1.5 font-medium">{r.name}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{r.website ?? "—"}</td>
                          <td className="px-3 py-1.5">
                            {exists ? (
                              <span className="text-muted-foreground">Skipped, already exists</span>
                            ) : (
                              "Will be created"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {importResult && importResult.errors.length > 0 && (
                <div role="alert" className="mt-3 text-sm">
                  <p className="font-medium">Some rows could not be imported:</p>
                  <ul className="mt-1 list-disc pl-5 text-foreground">
                    {importResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={closePreview} disabled={importing}>
                {importResult ? "Close" : "Cancel"}
              </Button>
              {!importResult && (
                <Button onClick={commitImport} loading={importing}>
                  Import {preview.rows.length - importBlockedNames}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </AppShell>
  );
}
