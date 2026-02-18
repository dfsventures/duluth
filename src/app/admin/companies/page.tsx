"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Users,
  Clock,
  AlertCircle,
  Upload,
  X,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

interface Company {
  id: string;
  name: string;
  sector: string | null;
  geography: string | null;
  fundingStage: string | null;
  memberCount: number;
  lastUpdate: string | null;
}

interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export default function AdminCompaniesPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function fetchCompanies() {
    try {
      const res = await fetch("/api/admin/companies");
      if (!res.ok) throw new Error("Failed to load companies");
      const data = await res.json();
      setCompanies(data.data ?? data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCompanies();
  }, []);

  function parseCSV(text: string): { name: string; website: string | null }[] {
    // Strip BOM if present
    const cleaned = text.replace(/^\uFEFF/, "");
    const lines = cleaned.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    // Parse header to find name and url/website columns
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
    const nameIdx = headers.findIndex((h) => h === "name" || h === "company name" || h === "company");
    const urlIdx = headers.findIndex((h) => h === "url" || h === "website" || h === "website url");

    if (nameIdx === -1) return [];

    const rows: { name: string; website: string | null }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
      const name = cols[nameIdx]?.trim();
      if (!name) continue;
      const website = urlIdx !== -1 ? cols[urlIdx]?.trim() || null : null;
      rows.push({ name, website });
    }
    return rows;
  }

  async function handleCSVFile(file: File) {
    setImporting(true);
    setImportResult(null);
    setImportError(null);

    try {
      const text = await file.text();
      const companies = parseCSV(text);

      if (companies.length === 0) {
        setImportError(
          'No valid rows found. CSV must have a "name" column (and optionally a "url" column).'
        );
        return;
      }

      const res = await fetch("/api/admin/companies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companies }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Import failed");
      }

      const result: ImportResult = await res.json();
      setImportResult(result);

      if (result.created > 0) {
        await fetchCompanies();
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  if (error) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      </AppShell>
    );
  }

  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <PageHeader
        title="Companies"
        description="Manage all portfolio companies."
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
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
                if (file) handleCSVFile(file);
              }}
            />
            <Button onClick={() => router.push("/admin/companies/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Add Company
            </Button>
          </div>
        }
      />

      {/* Import result banner */}
      {importResult && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <span className="font-medium">Import complete.</span>{" "}
            {importResult.created} company{importResult.created !== 1 ? "s" : ""} created
            {importResult.skipped > 0 && `, ${importResult.skipped} skipped (already exist)`}.
            {importResult.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-red-600">
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
        <div className="mb-6 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{importError}</span>
          <button onClick={() => setImportError(null)}>
            <X className="h-4 w-4 opacity-50 hover:opacity-100" />
          </button>
        </div>
      )}

      {/* CSV format hint */}
      <div className="mb-6 rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium">CSV format:</span> Include a{" "}
        <code className="rounded bg-muted px-1 text-xs">name</code> column and optionally a{" "}
        <code className="rounded bg-muted px-1 text-xs">url</code> column. Founders can fill in
        remaining details after gaining access.
      </div>

      {/* Search */}
      <div className="mb-6">
        <Input
          placeholder="Search by company name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {companies.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-10 w-10" />}
          title="No companies yet"
          description="Add your first portfolio company manually or import from a CSV."
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Import CSV
              </Button>
              <Button onClick={() => router.push("/admin/companies/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Add Company
              </Button>
            </div>
          }
        />
      ) : filteredCompanies.length === 0 ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="No results"
          description="No companies match your search. Try a different term."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCompanies.map((company) => (
            <Link
              key={company.id}
              href={`/admin/companies/${company.id}`}
              className="block"
            >
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {company.name}
                  </CardTitle>
                  {company.sector && (
                    <CardDescription>
                      <Badge variant="neutral">{company.sector}</Badge>
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {company.geography && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{company.geography}</span>
                      </div>
                    )}
                    {company.fundingStage && (
                      <div className="flex items-center gap-2">
                        <Badge variant="info">{company.fundingStage}</Badge>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      <span>
                        {company.memberCount} member{company.memberCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {company.lastUpdate
                          ? `Last update: ${formatDate(company.lastUpdate)}`
                          : "No updates yet"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
