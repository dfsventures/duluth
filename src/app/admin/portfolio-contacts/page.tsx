"use client";

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, LinkIcon, Unlink, Upload, CheckCircle2, AlertCircle, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { noticeClasses } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { PortcoLinkDialog } from "@/components/admin/portco-link-dialog";
import { ComposerDisclosure } from "@/components/composer/composer-disclosure";
import { formatDate } from "@/lib/utils";
import { parseContactsCSV } from "@/lib/csv";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

type ContactsTab = "contacts" | "links";

interface PortfolioCompanyRow {
  id: string;
  name: string;
  companyId: string | null;
  company: { id: string; name: string } | null;
  contactCount: number;
  dealCount: number;
}

interface UnlinkedPortfolioCompany {
  id: string;
  name: string;
  contactCount: number;
}

interface LinkSuggestionRow {
  companyId: string;
  companyName: string;
  tier: "STRONG" | "MEDIUM" | "WEAK";
  reasons: string[];
}

interface OrphanCompany {
  id: string;
  name: string;
  createdAt: string;
  ownerEmail: string | null;
}

interface ContactsImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  unmatchedCompanies: string[];
}

// WS170: one-line rows in the shared table.
const contactColumns: DataTableColumn<PortfolioCompanyRow>[] = [
  { key: "name", header: "Company", sortValue: (c) => c.name, cell: (c) => c.name },
  {
    key: "contacts",
    header: "Contacts",
    align: "num",
    sortValue: (c) => c.contactCount,
    firstDir: "desc",
    mobile: "badge",
    cell: (c) => <span className={c.contactCount === 0 ? "text-tone-amber-ink" : undefined}>{c.contactCount}</span>,
  },
  {
    key: "account",
    header: "Molly account",
    sortValue: (c) => c.company?.name ?? null,
    mobile: "meta",
    exportValue: (c) => c.company?.name ?? "Not linked",
    title: (c) => c.company?.name ?? "Not linked",
    cell: (c) =>
      c.company ? (
        <Link href={`/admin/companies/${c.company.id}`} className="text-primary hover:underline">
          {c.company.name}
        </Link>
      ) : (
        <span className="text-muted-foreground">Not linked</span>
      ),
  },
  { key: "deals", header: "Deals", align: "num", sortValue: (c) => c.dealCount, firstDir: "desc", mobile: "meta", cell: (c) => c.dealCount },
];

const orphanColumns: DataTableColumn<OrphanCompany>[] = [
  { key: "name", header: "Company", sortValue: (c) => c.name, cell: (c) => c.name },
  {
    key: "created",
    header: "Created",
    sortValue: (c) => new Date(c.createdAt).getTime(),
    firstDir: "desc",
    mobile: "meta",
    className: "whitespace-nowrap",
    exportValue: (c) => formatDate(c.createdAt),
    cell: (c) => formatDate(c.createdAt),
  },
  { key: "owner", header: "Owner", sortValue: (c) => c.ownerEmail, mobile: "meta", cell: (c) => c.ownerEmail ?? "—" },
];

export default function AdminPortfolioContactsPage() {
  return (
    <Suspense fallback={null}>
      <AdminPortfolioContactsPageInner />
    </Suspense>
  );
}

function AdminPortfolioContactsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") === "links" ? "links" : "contacts";
  const [activeTab, setActiveTab] = useState<ContactsTab>(requestedTab);

  function selectTab(tab: ContactsTab) {
    setActiveTab(tab);
    router.replace(tab === "links" ? "/admin/portfolio-contacts?tab=links" : "/admin/portfolio-contacts");
  }

  // D4 (Q82, option B) — the contact-coverage table. Fetched on mount;
  // re-run after a successful import so counts update in place.
  const [companies, setCompanies] = useState<PortfolioCompanyRow[]>([]);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [showCsvFormat, setShowCsvFormat] = useState(false);

  const loadCompanies = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/portfolio-companies");
      if (res.ok) {
        setCompanies(await res.json());
      }
    } finally {
      setCompaniesLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const companiesWithContacts = useMemo(() => companies.filter((c) => c.contactCount > 0).length, [companies]);

  // Part 30, WS70.4 (moved here in Part 33, WS89) — portfolio-wide
  // contacts CSV import entry point. No defaultPortfolioCompanyId in the
  // body: unlike the scoped import on /admin/portfolio/[id], every row
  // here must name its own company.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ContactsImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleContactsCSVFile(file: File) {
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const text = await file.text();
      const rows = parseContactsCSV(text);
      if (rows.length === 0) {
        setImportError('No valid rows found. CSV must have an "email" column.');
        return;
      }
      const res = await fetch("/api/admin/portfolio-companies/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: rows }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Import failed");
      }
      const result: ContactsImportResult = await res.json();
      setImportResult(result);
      await loadCompanies();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Part 31, WS78.2 — the standing "Links" tab, moved verbatim off
  // /admin/portfolio in Part 33, WS89. Loaded lazily on first visit
  // (JC-LK-B: in-memory scoring over ~50 rows, no need to fetch it on
  // the default Contacts tab).
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [unlinkedPortcos, setUnlinkedPortcos] = useState<UnlinkedPortfolioCompany[]>([]);
  const [suggestionsByPortco, setSuggestionsByPortco] = useState<Record<string, LinkSuggestionRow[]>>({});
  const [orphanCompanies, setOrphanCompanies] = useState<OrphanCompany[]>([]);
  const [linkDialogFor, setLinkDialogFor] = useState<{ id: string; name: string; contactEmails: string[] } | null>(
    null
  );

  // Fetches this row's own contacts first so the shared dialog's D3
  // checkbox can hide itself when the owner is already a contact here —
  // the same "never offer a no-op" rule as WS77/WS78.1, just fetched
  // on demand since this tab doesn't otherwise load per-company contacts.
  async function openLinkDialog(pc: { id: string; name: string }) {
    let contactEmails: string[] = [];
    try {
      const res = await fetch(`/api/admin/portfolio/companies/${pc.id}`);
      if (res.ok) {
        const detail: { contacts: { email: string }[] } = await res.json();
        contactEmails = detail.contacts.map((c) => c.email);
      }
    } catch {
      // Non-fatal — dialog still works, just may offer a redundant checkbox.
    }
    setLinkDialogFor({ ...pc, contactEmails });
  }

  const loadLinks = useCallback(async () => {
    try {
      const [portcosRes, suggRes] = await Promise.all([
        fetch("/api/admin/portfolio-companies"),
        fetch("/api/admin/portfolio-companies/link-suggestions"),
      ]);
      if (portcosRes.ok) {
        const all: { id: string; name: string; companyId: string | null; contactCount: number }[] = await portcosRes.json();
        setUnlinkedPortcos(
          all
            .filter((p) => !p.companyId)
            .map((p) => ({ id: p.id, name: p.name, contactCount: p.contactCount }))
        );
      }
      if (suggRes.ok) {
        const data: {
          results: { portfolioCompanyId: string; matches: LinkSuggestionRow[] }[];
          companiesWithoutPortfolioCompany: OrphanCompany[];
        } = await suggRes.json();
        const map: Record<string, LinkSuggestionRow[]> = {};
        for (const r of data.results ?? []) map[r.portfolioCompanyId] = r.matches;
        setSuggestionsByPortco(map);
        setOrphanCompanies(data.companiesWithoutPortfolioCompany ?? []);
      }
    } finally {
      setLinksLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "links" && !linksLoaded) loadLinks();
  }, [activeTab, linksLoaded, loadLinks]);

  function handleLinked() {
    setLinkDialogFor(null);
    loadLinks();
  }

  // The unlinked table's columns need the suggestions, so they are built here.
  const unlinkedColumns = useMemo<DataTableColumn<UnlinkedPortfolioCompany>[]>(
    () => [
      { key: "name", header: "Portfolio company", sortValue: (pc) => pc.name, cell: (pc) => pc.name },
      { key: "contacts", header: "Contacts", align: "num", sortValue: (pc) => pc.contactCount, firstDir: "desc", mobile: "badge", cell: (pc) => pc.contactCount },
      {
        key: "suggestion",
        header: "Top suggestion",
        mobile: "meta",
        sortValue: (pc) => suggestionsByPortco[pc.id]?.[0]?.companyName ?? null,
        exportValue: (pc) => suggestionsByPortco[pc.id]?.[0]?.companyName ?? "",
        title: (pc) => {
          const top = suggestionsByPortco[pc.id]?.[0];
          return top ? `${top.companyName} (${top.tier.toLowerCase()})` : "No suggestion";
        },
        cell: (pc) => {
          const top = suggestionsByPortco[pc.id]?.[0];
          return top ? (
            <>
              {top.companyName}
              <span className="ml-2 text-muted-foreground">({top.tier.toLowerCase()})</span>
            </>
          ) : (
            <span className="text-muted-foreground">No suggestion</span>
          );
        },
      },
    ],
    [suggestionsByPortco]
  );

  return (
    <AppShell width="wide">
      <PageHeader
        title="Portfolio Contacts"
        description="Who we email at each portfolio company, and which cap-table entries are linked to a Molly account."
        // The action holds the hidden file input (a ref): the slim scroll bar carries the title only.
        condensedAction={null}
        action={
          activeTab === "contacts" ? (
            <div className="flex flex-wrap gap-2">
              {/* Audit #42: the format note sits behind this link, not above the table. */}
              <Button
                variant="ghost"
                aria-expanded={showCsvFormat}
                className="hidden v2:inline-flex"
                onClick={() => setShowCsvFormat((v) => !v)}
              >
                CSV format
              </Button>
              <Button variant="secondary" disabled={importing} onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                {importing ? "Importing..." : "Import CSV"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleContactsCSVFile(file);
                }}
              />
            </div>
          ) : undefined
        }
      />

      <div data-align="tabs" className="page-tabs mb-6 flex gap-1 overflow-x-auto border-b">
        <button
          onClick={() => selectTab("contacts")}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 v2:px-0 text-sm font-medium transition-colors ${
            activeTab === "contacts"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4 v2:hidden" />
          Contacts
        </button>
        <button
          onClick={() => selectTab("links")}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 v2:px-0 text-sm font-medium transition-colors ${
            activeTab === "links"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
          }`}
        >
          <LinkIcon className="h-4 w-4 v2:hidden" />
          Links
        </button>
      </div>

      {activeTab === "contacts" ? (
        <>
          {importResult && (
            <div className={noticeClasses("sage", "mb-6 flex items-start gap-2 v2:mb-0 v2:mt-4")}>
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <span className="font-medium">Import complete.</span> {importResult.created} created, {importResult.updated} updated
                {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}.
                {importResult.unmatchedCompanies.length > 0 && (
                  <p className="mt-1">Unmatched companies: {importResult.unmatchedCompanies.join(", ")}</p>
                )}
                {importResult.errors.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-tone-clay-ink">
                    {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
              <button onClick={() => setImportResult(null)}>
                <X className="h-4 w-4 opacity-50 hover:opacity-100" />
              </button>
            </div>
          )}
          {importError && (
            <div className={noticeClasses("clay", "mb-6 flex items-center gap-2 v2:mb-0 v2:mt-4")}>
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{importError}</span>
              <button onClick={() => setImportError(null)}>
                <X className="h-4 w-4 opacity-50 hover:opacity-100" />
              </button>
            </div>
          )}
          <div className="mb-6 v2:hidden">
            <ComposerDisclosure label="CSV format" className="v2:border-t-0">
              <p className="text-sm text-muted-foreground">
                CSV columns: <code className="rounded bg-muted px-1">company</code>,{" "}
                <code className="rounded bg-muted px-1">name</code>, <code className="rounded bg-muted px-1">email</code>, optional{" "}
                <code className="rounded bg-muted px-1">role</code>. <code className="rounded bg-muted px-1">company</code> must match an
                existing portfolio company — unmatched rows are reported, never created.
              </p>
            </ComposerDisclosure>
          </div>
          {showCsvFormat && (
            <p className={noticeClasses("sky", "v2:mx-[var(--row-pad)] v2:mt-4")}>
              CSV columns: <code>company</code>, <code>name</code>, <code>email</code>, optional <code>role</code>. <code>company</code> must
              match an existing portfolio company. Unmatched rows are reported, never created.
            </p>
          )}

          {companiesLoaded && companies.length === 0 ? (
            <EmptyState icon={<Users className="h-8 w-8" />} title="No portfolio companies yet" />
          ) : (
            <>
              <DataTable<PortfolioCompanyRow>
                toolbarExtra={
                  companiesLoaded ? (
                    <span className="whitespace-nowrap text-meta text-muted-foreground">
                      {companiesWithContacts} of {companies.length} companies have contacts
                    </span>
                  ) : undefined
                }
                label="Contacts"
                noun="company"
                pluralNoun="companies"
                rows={companies}
                rowKey={(c) => c.id}
                columns={contactColumns}
                rowHref={(c) => `/admin/portfolio/${c.id}`}
                defaultSort={{ key: "name", dir: "asc" }}
                searchText={(c) => [c.name]}
                searchPlaceholder="Filter contacts"
                chips={[{ key: "none", label: "No contacts", test: (c) => c.contactCount === 0 }]}
                loading={!companiesLoaded}
                minWidth={640}
                empty={<EmptyState icon={<Users className="h-8 w-8" />} title="No portfolio companies yet" />}
              />
            </>
          )}
        </>
      ) : (
        <div className="space-y-8 v2:space-y-12 v2:pt-6">
          <div>
            <h2 className="mb-1 text-sm font-semibold text-foreground">Unlinked portfolio companies</h2>
            <p className="mb-4 text-sm text-muted-foreground v2:mb-3">
              Cap-table entries with no linked Molly account. Linking is always an explicit choice — nothing here is
              automatic.
            </p>
            <DataTable<UnlinkedPortfolioCompany>
                label="Unlinked portfolio companies"
                noun="company"
                pluralNoun="companies"
                rows={unlinkedPortcos}
                rowKey={(pc) => pc.id}
                columns={unlinkedColumns}
                rowHref={(pc) => `/admin/portfolio/${pc.id}`}
                defaultSort={{ key: "name", dir: "asc" }}
                urlState={false}
                loading={!linksLoaded}
                minWidth={560}
                actionsLabel="Link"
                actionsAlwaysVisible
                rowActions={(pc) => (
                  <Button variant="secondary" size="sm" onClick={() => openLinkDialog({ id: pc.id, name: pc.name })}>
                    {suggestionsByPortco[pc.id]?.[0] ? "Link" : "Find match"}
                  </Button>
                )}
                empty={<EmptyState icon={<LinkIcon className="h-8 w-8" />} title="Every portfolio company is linked." />}
              />
          </div>

          <div>
            <h2 className="mb-1 text-sm font-semibold text-foreground">Operational companies with no portfolio company</h2>
            <p className="mb-4 text-sm text-muted-foreground v2:mb-3">
              Molly accounts not yet represented in the cap table. Read-only — linking always happens from the
              portfolio-company side.
            </p>
            <DataTable<OrphanCompany>
                label="Operational companies with no portfolio company"
                noun="company"
                pluralNoun="companies"
                rows={orphanCompanies}
                rowKey={(c) => c.id}
                columns={orphanColumns}
                rowHref={(c) => `/admin/companies/${c.id}`}
                defaultSort={{ key: "name", dir: "asc" }}
                urlState={false}
                loading={!linksLoaded}
                minWidth={560}
                empty={<EmptyState icon={<Unlink className="h-8 w-8" />} title="Every Molly account has a portfolio company." />}
              />
          </div>
        </div>
      )}

      {linkDialogFor && (
        <PortcoLinkDialog
          portfolioCompanyId={linkDialogFor.id}
          portfolioCompanyName={linkDialogFor.name}
          existingContactEmails={linkDialogFor.contactEmails}
          onClose={() => setLinkDialogFor(null)}
          onLinked={handleLinked}
        />
      )}
    </AppShell>
  );
}
