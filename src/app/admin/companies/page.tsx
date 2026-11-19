"use client";

import { useMemo, useState, useRef } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { RefreshIndicator, StaleRegion } from "@/components/ui/stale";
import { useRouter } from "next/navigation";
import { Building2, Plus, Upload, Bell } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { OpenParam, SplitView } from "@/components/layout/split-view";
import { TableSkeleton } from "@/components/ui/skeleton";
import { DetailPane, PaneCard, PaneChip, PaneDetails, PaneSection } from "@/components/layout/detail-pane";
import { companyNextAction } from "@/lib/company-pane";
import { crumbLabel, stepCursor } from "@/lib/split-view";
import { statusTone, TONE_CLASSES } from "@/lib/status-tone";
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
import { useNewLook } from "@/lib/use-new-look";
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
  // Part 45 (WS151) — additive.
  createdVia?: string | null;
  hasFounder?: boolean;
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

// New look (WS160): the company summary beside the list. Reads the row the list already has.
function CompanyPane({
  row,
  crumb,
  onPrev,
  onNext,
  onClose,
  reminding,
  onRemind,
  onOpenCompany,
}: {
  row: Row;
  crumb: string;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  reminding: boolean;
  onRemind: () => void;
  onOpenCompany: () => void;
}) {
  const action = companyNextAction({ cadence: row.cadence, daysSince: row.daysSince, hasFounder: row.hasFounder });
  const recent = row.recentPublishedUpdates.filter((u) => u.sentAt).slice(0, 5);
  return (
    <DetailPane
      crumb={crumb}
      title={row.name}
      mark={<NameTile name={row.name} className="mr-0 v2:h-8 v2:w-8 v2:text-[13px]" />}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      expandHref={`/admin/companies/${row.id}`}
      chips={
        <>
          {row.fundingStage && (
            <PaneChip className={TONE_CLASSES[statusTone(row.fundingStage)].chip}>{row.fundingStage}</PaneChip>
          )}
          <PaneChip>
            <StatusDot status={row.cadence}>{row.statusLabel}</StatusDot>
          </PaneChip>
          {row.createdVia === "marge" && <PaneChip>Added via Marge</PaneChip>}
          {row.hasFounder === false && <PaneChip>No founder yet</PaneChip>}
        </>
      }
      card={
        <PaneCard
          heading={action.heading}
          actions={
            action.primary === "remind" ? (
              <>
                <Button loading={reminding} onClick={onRemind}>
                  Send a reminder
                </Button>
                <Button variant="secondary" onClick={onOpenCompany}>
                  Open company
                </Button>
              </>
            ) : (
              <Button onClick={onOpenCompany}>Open company</Button>
            )
          }
        >
          {action.text}
        </PaneCard>
      }
    >
      <PaneSection title="Details">
        <PaneDetails
          rows={[
            { label: "Stage", value: row.fundingStage ?? "—" },
            { label: "Sector", value: row.sector ?? "—" },
            { label: "Location", value: row.geography ?? "—" },
            { label: "Members", value: row.memberCount },
            { label: "Last update", value: row.lastUpdateDate ? formatDate(row.lastUpdateDate) : "None yet" },
            { label: "Added", value: formatDate(row.createdAt) },
          ]}
        />
      </PaneSection>
      <PaneSection title="Recent updates">
        {recent.length === 0 ? (
          <p>No updates yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((u, i) => (
              <li key={`${u.sentAt}-${i}`} className="flex gap-4">
                <time className="w-28 flex-none text-muted-foreground" dateTime={u.sentAt ?? undefined}>
                  {formatDate(u.sentAt as string)}
                </time>
                <span>Update published</span>
              </li>
            ))}
          </ul>
        )}
      </PaneSection>
    </DetailPane>
  );
}

export default function AdminCompaniesPage() {
  const router = useRouter();
  // False on the server and the first render, so the old markup is what hydrates.
  const v2 = useNewLook();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // New look (WS160): the list as shown, for the pane's previous / next and its position.
  const [visibleRows, setVisibleRows] = useState<Row[]>([]);
  const visibleKeys = useMemo(() => visibleRows.map((r) => r.id), [visibleRows]);

  // SWR: the list stays on screen (dimmed) while it refetches, and an import or
  // a revisit refreshes it without a blank flash.
  const {
    data: companiesData,
    error: loadError,
    isValidating,
    mutate: refetchCompanies,
  } = useSWR<{ data?: Company[] } | Company[]>("/api/admin/companies", fetcher, { keepPreviousData: true });
  const companies = useMemo<Company[]>(
    () => (Array.isArray(companiesData) ? companiesData : (companiesData?.data ?? [])),
    [companiesData]
  );
  const loading = !companiesData && !loadError;
  const error = !companiesData && loadError ? loadError.message : null;
  const [reminding, setReminding] = useState<Record<string, boolean>>({});

  // Import: pick a file, preview the parsed rows, then commit. Nothing is sent
  // until the admin confirms.
  const [preview, setPreview] = useState<{ fileName: string; rows: CompanyCsvRow[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  // New look: the CSV format note lives behind a quiet button in the header, not above the list.
  const [csvHelpOpen, setCsvHelpOpen] = useState(false);

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
      if (result.created > 0) await refetchCompanies();
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

  // New look: one line per cell. Status and Stage get a width that fits their longest normal value
  // ("No updates yet", "Pre-seed" / "Series A"); Sector and Location are cut with an ellipsis.
  // Under the old look none of this is added, so its markup is unchanged.
  const colClass = (cls: string) => (v2 ? cls : undefined);
  const columns: DataTableColumn<Row>[] = [
    {
      key: "name",
      header: "Company",
      sortValue: (r) => r.name,
      cell: (r) =>
        v2 ? (
          <>
            <NameTile name={r.name} className="v2:mr-3 v2:h-5 v2:w-5 v2:text-[10px]" />
            <span className="min-w-0 truncate" title={r.name}>
              {r.name}
            </span>
            {r.hasFounder === false && (
              // Quiet words after the name; they give way first. The pane has the full wording.
              <span
                className="ml-2 min-w-0 shrink-[1000] truncate text-meta font-normal text-muted-foreground"
                title={r.createdVia === "marge" ? "Added via Marge · No founder yet" : "No founder yet"}
              >
                No founder yet
              </span>
            )}
          </>
        ) : (
          <>
            <NameTile name={r.name} className="v2:mr-3 v2:h-5 v2:w-5 v2:text-[10px]" />
            {r.name}
            {r.hasFounder === false && (
              <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                {r.createdVia === "marge" ? "Added via Marge · No founder yet" : "No founder yet"}
              </span>
            )}
          </>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => CADENCE_ORDER[r.cadence],
      mobile: "badge",
      className: colClass("w-[136px] [--cell-max:136px]"),
      cell: (r) => <StatusDot status={r.cadence}>{r.statusLabel}</StatusDot>,
    },
    {
      key: "sector",
      header: "Sector",
      sortValue: (r) => r.sector,
      dropBelow: 480,
      mobile: "meta",
      className: colClass("[--cell-max:184px]"),
      cell: (r) => r.sector ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "stage",
      header: "Stage",
      sortValue: (r) => r.fundingStage,
      dropBelow: 480,
      className: colClass("w-[112px] [--cell-max:112px]"),
      title: (r) => r.fundingStage,
      cell: (r) => <StageChip stage={r.fundingStage} />,
    },
    {
      key: "geography",
      header: "Location",
      sortValue: (r) => r.geography,
      dropBelow: 600,
      mobile: "meta",
      className: colClass("[--cell-max:224px]"),
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
      dropBelow: 600,
      cell: (r) => r.memberCount,
    },
  ];

  const csvFormatNote = (
    <p className="text-sm text-muted-foreground">
      To bulk import, upload a CSV with a <code className="rounded bg-muted px-1 text-xs">name</code> column and
      optional <code className="rounded bg-muted px-1 text-xs">url</code> column. You will see a preview before
      anything is created. Founders fill in remaining details after gaining access.
    </p>
  );

  const importBlockedNames =preview ? preview.rows.filter((r) => existingNames.has(r.name.trim().toLowerCase())).length : 0;

  return (
    <AppShell width="full">
      <PageHeader
        indicator={<RefreshIndicator active={isValidating && !!companiesData} />}
        title="Companies"
        description="Manage all portfolio companies."
        // The action holds the hidden CSV input (a ref), so the slim scroll bar gets its own Add company.
        condensedAction={
          <Button onClick={() => router.push("/admin/companies/new")}>
            <Plus className="h-4 w-4" />
            Add company
          </Button>
        }
        // New look: CSV format and Import CSV are secondary actions (a "⋯" menu on phones, so the
        // title and Add Company keep one row). Old look keeps Import CSV as a header button.
        secondaryActions={
          v2
            ? [
                { label: "CSV format", variant: "ghost", onSelect: () => setCsvHelpOpen(true) },
                {
                  label: "Import CSV",
                  icon: <Upload className="h-4 w-4" />,
                  onSelect: () => fileInputRef.current?.click(),
                },
              ]
            : undefined
        }
        action={
          <div className="flex flex-wrap gap-2">
            {!v2 && (
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Import CSV
              </Button>
            )}
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
              Add company
            </Button>
          </div>
        }
      />

      {/* Old look keeps the disclosure here; the new look has a "CSV format" button in the header instead. */}
      {!v2 && (
        <div className="mb-4">
          <ComposerDisclosure label="CSV format">{csvFormatNote}</ComposerDisclosure>
        </div>
      )}
      {v2 && (
        <Dialog open={csvHelpOpen} onOpenChange={setCsvHelpOpen}>
          <DialogContent title="CSV format" size="sm">
            <DialogBody>{csvFormatNote}</DialogBody>
          </DialogContent>
        </Dialog>
      )}

      <OpenParam fallback={<TableSkeleton rows={6} cols={5} />}>
      {(openId, setOpenId) => {
      // New look (WS160): the pane shows the open company from the rows the list already has (no extra request).
      const closePane = () => setOpenId(null);
      const step = (delta: 1 | -1) => {
        const to = stepCursor(visibleKeys, openId, delta);
        if (to) setOpenId(to);
      };
      const openCompany = openId ? (rows.find((r) => r.id === openId) ?? null) : null;
      const at = openCompany ? visibleKeys.indexOf(openCompany.id) : -1;
      const pane = openCompany ? (
        <CompanyPane
          row={openCompany}
          crumb={crumbLabel("Companies", visibleKeys, openCompany.id)}
          onPrev={at > 0 ? () => step(-1) : undefined}
          onNext={at !== -1 && at < visibleKeys.length - 1 ? () => step(1) : undefined}
          onClose={closePane}
          reminding={Boolean(reminding[openCompany.id])}
          onRemind={() => void sendReminder(openCompany)}
          onOpenCompany={() => router.push(`/admin/companies/${openCompany.id}`)}
        />
      ) : null;
      return (
      <SplitView
        open={openId}
        onClose={closePane}
        paneLabel={openCompany?.name}
        pane={pane}
        list={
      <StaleRegion refreshing={isValidating && !!companiesData}>
      <DataTable<Row>
        onOpenRow={(r) => setOpenId(r.id)}
        openKey={openId}
        onVisibleRowsChange={setVisibleRows}
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
        onRetry={() => void refetchCompanies()}
        minWidth={820}
        actionsLabel="Row actions"
        rowActions={(r) =>
          (r.cadence === "behind" || r.cadence === "aging") && r.hasFounder === false ? (
            <span className="px-2 text-xs text-muted-foreground">No founder in Molly</span>
          ) : r.cadence === "behind" || r.cadence === "aging" ? (
            <Button variant="ghost" size="sm" loading={reminding[r.id]} onClick={() => sendReminder(r)}>
              <Bell className="h-3.5 w-3.5" />
              Remind
              <span className="sr-only"> {r.name}</span>
            </Button>
          ) : null
        }
        empty={
          <EmptyState eyebrow="Companies"
            icon={<Building2 className="h-10 w-10" />}
            title="No companies yet"
            description="Add your first portfolio company by hand, or import a list. A CSV needs a name column; url is optional."
            example={
              <pre className="whitespace-pre">{"name,url\nAcmeHQ,https://acme.example\nTidewater Health,https://tidewater.example"}</pre>
            }
            action={
              <Button onClick={() => router.push("/admin/companies/new")}>
                <Plus className="h-4 w-4" />
                Add company
              </Button>
            }
            secondaryAction={
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Import CSV
              </Button>
            }
          />
        }
      />
      </StaleRegion>
        }
      />
      );
      }}
      </OpenParam>

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
