"use client";

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, LinkIcon, Unlink, Upload, CheckCircle2, AlertCircle, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHead, Th, TableRow } from "@/components/ui/table";
import { PortcoLinkDialog } from "@/components/admin/portco-link-dialog";
import { ComposerDisclosure } from "@/components/composer/composer-disclosure";
import { formatDate } from "@/lib/utils";
import { parseContactsCSV } from "@/lib/csv";

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
  ownerEmail: string;
}

interface ContactsImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  unmatchedCompanies: string[];
}

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
  const [search, setSearch] = useState("");
  const [noContactsOnly, setNoContactsOnly] = useState(false);

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

  const filteredCompanies = useMemo(() => {
    return companies
      .filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
      .filter((c) => !noContactsOnly || c.contactCount === 0);
  }, [companies, search, noContactsOnly]);

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
  const [linksLoading, setLinksLoading] = useState(false);
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
    setLinksLoading(true);
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
      setLinksLoading(false);
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

  return (
    <AppShell>
      <PageHeader
        title="Portfolio Contacts"
        description="Who we email at each portfolio company, and which cap-table entries are linked to a Molly account."
        action={
          activeTab === "contacts" ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={importing} onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                {importing ? "Importing..." : "Import contacts (CSV)"}
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

      <div className="mb-6 flex gap-1 overflow-x-auto border-b">
        <button
          onClick={() => selectTab("contacts")}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "contacts"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          Contacts
        </button>
        <button
          onClick={() => selectTab("links")}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "links"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
          }`}
        >
          <LinkIcon className="h-4 w-4" />
          Links
        </button>
      </div>

      {activeTab === "contacts" ? (
        <>
          {importResult && (
            <div className="mb-6 flex items-start gap-2 rounded-md border border-acacia/30 bg-acacia/10 px-4 py-3 text-sm text-acacia">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <span className="font-medium">Import complete.</span> {importResult.created} created, {importResult.updated} updated
                {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}.
                {importResult.unmatchedCompanies.length > 0 && (
                  <p className="mt-1">Unmatched companies: {importResult.unmatchedCompanies.join(", ")}</p>
                )}
                {importResult.errors.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-laterite">
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
            <div className="mb-6 flex items-center gap-2 rounded-md border border-laterite/30 bg-laterite/10 px-4 py-3 text-sm text-laterite">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{importError}</span>
              <button onClick={() => setImportError(null)}>
                <X className="h-4 w-4 opacity-50 hover:opacity-100" />
              </button>
            </div>
          )}
          <div className="mb-6">
            <ComposerDisclosure label="CSV format">
              <p className="text-sm text-muted-foreground">
                CSV columns: <code className="rounded bg-muted px-1">company</code>,{" "}
                <code className="rounded bg-muted px-1">name</code>, <code className="rounded bg-muted px-1">email</code>, optional{" "}
                <code className="rounded bg-muted px-1">role</code>. <code className="rounded bg-muted px-1">company</code> must match an
                existing portfolio company — unmatched rows are reported, never created.
              </p>
            </ComposerDisclosure>
          </div>

          {!companiesLoaded ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : companies.length === 0 ? (
            <EmptyState icon={<Users className="h-8 w-8" />} title="No portfolio companies yet" />
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                {companiesWithContacts} of {companies.length} portfolio companies have at least one contact.
              </p>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="min-w-[200px] flex-1">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by company..."
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={noContactsOnly}
                    onChange={(e) => setNoContactsOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  Only companies with no contacts
                </label>
              </div>

              {filteredCompanies.length === 0 ? (
                <EmptyState title="No matches" description="Try a different search term." />
              ) : (
                <Table tableClassName="min-w-[720px]">
                  <TableHead>
                    <Th>Company</Th>
                    <Th>Contacts</Th>
                    <Th>Molly account</Th>
                    <Th>Deals</Th>
                  </TableHead>
                  <tbody>
                    {filteredCompanies.map((c) => (
                      <TableRow key={c.id}>
                        <td className="px-4 py-2.5 font-medium">
                          <Link href={`/admin/portfolio/${c.id}`} className="hover:underline">
                            {c.name}
                          </Link>
                        </td>
                        <td className={`px-4 py-2.5 text-sm ${c.contactCount === 0 ? "text-ochre" : "text-muted-foreground"}`}>
                          {c.contactCount}
                        </td>
                        <td className="px-4 py-2.5 text-sm">
                          {c.company ? (
                            <Link href={`/admin/companies/${c.company.id}`} className="text-primary hover:underline">
                              {c.company.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Not linked</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">{c.dealCount}</td>
                      </TableRow>
                    ))}
                  </tbody>
                </Table>
              )}
            </>
          )}
        </>
      ) : (
        <div className="space-y-8">
          <div>
            <h2 className="mb-1 text-sm font-semibold text-foreground">Unlinked portfolio companies</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Cap-table entries with no linked Molly account. Linking is always an explicit choice — nothing here is
              automatic.
            </p>
            {linksLoading && !linksLoaded ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
                ))}
              </div>
            ) : unlinkedPortcos.length === 0 ? (
              <EmptyState icon={<LinkIcon className="h-8 w-8" />} title="Every portfolio company is linked." />
            ) : (
              <Table>
                <TableHead>
                  <Th>Portfolio company</Th>
                  <Th>Contacts</Th>
                  <Th>Top suggestion</Th>
                  <Th></Th>
                </TableHead>
                <tbody>
                  {unlinkedPortcos.map((pc) => {
                    const matches = suggestionsByPortco[pc.id] ?? [];
                    const top = matches[0];
                    return (
                      <TableRow key={pc.id}>
                        <td className="px-4 py-2.5 font-medium">
                          <Link href={`/admin/portfolio/${pc.id}`} className="hover:underline">
                            {pc.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">{pc.contactCount}</td>
                        <td className="px-4 py-2.5 text-sm">
                          {top ? (
                            <span>
                              {top.companyName}{" "}
                              <span className="text-xs text-muted-foreground">({top.tier.toLowerCase()})</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No suggestion</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openLinkDialog({ id: pc.id, name: pc.name })}
                          >
                            {top ? "Link" : "Find match"}
                          </Button>
                        </td>
                      </TableRow>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </div>

          <div>
            <h2 className="mb-1 text-sm font-semibold text-foreground">Operational companies with no portfolio company</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Molly accounts not yet represented in the cap table. Read-only — linking always happens from the
              portfolio-company side.
            </p>
            {linksLoading && !linksLoaded ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
                ))}
              </div>
            ) : orphanCompanies.length === 0 ? (
              <EmptyState icon={<Unlink className="h-8 w-8" />} title="Every Molly account has a portfolio company." />
            ) : (
              <Table>
                <TableHead>
                  <Th>Company</Th>
                  <Th>Created</Th>
                  <Th>Owner</Th>
                  <Th></Th>
                </TableHead>
                <tbody>
                  {orphanCompanies.map((c) => (
                    <TableRow key={c.id}>
                      <td className="px-4 py-2.5 font-medium">{c.name}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-sm text-muted-foreground">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground">{c.ownerEmail}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Link href={`/admin/companies/${c.id}`} className="text-sm text-primary hover:underline">
                          View company
                        </Link>
                      </td>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            )}
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
