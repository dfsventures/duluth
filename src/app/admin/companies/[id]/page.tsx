"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FileText, BarChart3, FolderOpen, Users, AlertCircle, ArrowLeft, Trash2, NotebookPen, ClipboardCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useFlashMessage } from "@/lib/use-flash-message";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { TabBar } from "@/components/ui/tab-bar";
import { parseTab } from "@/lib/url-tab";
import {
  TABS,
  type Tab,
  type Company,
  type CompanyDiligenceView,
  type Document,
  type MetricDefinition,
  type Member,
  type Note,
  type Update,
} from "@/components/admin/company/types";
import { ProfileCard } from "@/components/admin/company/profile-card";
import { UpdatesTab } from "@/components/admin/company/updates-tab";
import { MetricsTab } from "@/components/admin/company/metrics-tab";
import { DocumentsTab, type DocumentLoadOpts } from "@/components/admin/company/documents-tab";
import { MembersTab } from "@/components/admin/company/members-tab";
import { NotesTab } from "@/components/admin/company/notes-tab";
import { DiligenceTab } from "@/components/admin/company/diligence-tab";

// UI overhaul phase 7: this page used to be 1,812 lines. Data loading, the
// header and the URL tabs stay here; each tab and the profile card live in
// src/components/admin/company/. Behaviour is unchanged except that deleting
// the company now uses the type-the-name ConfirmDialog.

function AdminCompanyDetailPageInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const companyId = params.id as string;

  // The tab lives in the URL (?tab=): back button, shared links and the
  // Part 34 deep link from the diligence queue (?tab=diligence) all land on it.
  const activeTab = parseTab(searchParams.get("tab"), TABS, "updates");

  const [company, setCompany] = useState<Company | null>(null);
  // Part 31, WS79 - read-only, from the admin-only GET /api/admin/companies/[id]
  // (never the shared, founder-reachable GET /api/companies/[id] - D5).
  const [portfolioCompany, setPortfolioCompany] = useState<{ id: string; name: string } | null>(null);
  // Part 34, WS91 (F80/F81) - see CompanyDiligenceView.
  const [diligence, setDiligence] = useState<CompanyDiligenceView | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setMessage] = useFlashMessage();
  const [deleting, setDeleting] = useState(false);

  const loadCompany = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}`);
      if (!res.ok) throw new Error("Failed to load company");
      const data = await res.json();
      const c = data.data ?? data;
      setCompany(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [companyId]);

  // Part 34, WS91 — renamed from loadPortfolioLink: this endpoint now also
  // feeds the Diligence tab (data.diligence), so the name should reflect
  // that it's the admin-only company-meta fetch, not just the portfolio link.
  const loadAdminCompanyMeta = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/companies/${companyId}`);
      if (!res.ok) return; // non-fatal — the read-only line/tab just stay hidden
      const data = await res.json();
      setPortfolioCompany(data.portfolioCompany ?? null);
      setDiligence(data.diligence ?? null);
    } catch {
      // Non-fatal — secondary display-only data.
    }
  }, [companyId]);

  const loadUpdates = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/updates`);
      if (res.ok) {
        const data = await res.json();
        setUpdates(data.data ?? data ?? []);
      }
    } catch {
      // Silently fail for secondary data
    }
  }, [companyId]);

  const loadMetrics = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/metrics/history`);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.data ?? data ?? []);
      }
    } catch {
      // Silently fail
    }
  }, [companyId]);

  const loadDocuments = useCallback(async (opts?: { search?: string; docType?: string; archived?: boolean }) => {
    try {
      const params = new URLSearchParams();
      if (opts?.search) params.set("search", opts.search);
      if (opts?.docType) params.set("docType", opts.docType);
      if (opts?.archived) params.set("archived", "true");
      const res = await fetch(`/api/companies/${companyId}/documents?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.data ?? data ?? []);
      }
    } catch {
      // Silently fail
    }
  }, [companyId]);

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.data ?? data ?? []);
      }
    } catch {
      // Silently fail
    }
  }, [companyId]);

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/notes`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data ?? []);
      }
    } catch {
      // Silently fail
    }
  }, [companyId]);

  useEffect(() => {
    async function fetchAll() {
      await loadCompany();
      await Promise.all([loadUpdates(), loadMetrics(), loadDocuments(), loadMembers(), loadNotes(), loadAdminCompanyMeta()]);
      setLoading(false);
    }

    fetchAll();
  }, [loadCompany, loadUpdates, loadMetrics, loadDocuments, loadMembers, loadNotes, loadAdminCompanyMeta]);


  async function handleDeleteCompany() {
    if (!company) return;
    const ok = await confirm({
      title: `Delete ${company.name}`,
      description:
        "This permanently removes the company and its updates, metrics, documents and notes from Molly. It cannot be undone.",
      confirmLabel: "Delete company",
      typeToConfirm: company.name,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/companies/${companyId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to delete company");
      }
      router.push("/admin/companies");
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete company.",
      });
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <PageSkeleton />
      </AppShell>
    );
  }

  if (error || !company) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">
            {error ?? "Company not found."}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => router.push("/admin/companies")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        </div>
      </AppShell>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "updates", label: "Updates", icon: <FileText aria-hidden="true" className="h-4 w-4" />, count: updates.length },
    { key: "metrics", label: "Metrics", icon: <BarChart3 aria-hidden="true" className="h-4 w-4" />, count: metrics.length },
    { key: "documents", label: "Documents", icon: <FolderOpen aria-hidden="true" className="h-4 w-4" />, count: documents.length },
    { key: "members", label: "Members", icon: <Users aria-hidden="true" className="h-4 w-4" />, count: members.length },
    { key: "notes", label: "Notes", icon: <NotebookPen aria-hidden="true" className="h-4 w-4" /> },
    // Part 34, WS91 (D1) — only shown when a CompanyDiligence row exists,
    // at any stage (in diligence or long since promoted).
    ...(diligence
      ? [{ key: "diligence" as const, label: "Diligence", icon: <ClipboardCheck aria-hidden="true" className="h-4 w-4" /> }]
      : []),
  ];

  return (
    <AppShell>
      <Breadcrumb items={[{ label: "Companies", href: "/admin/companies" }, { label: company.name }]} />
      <PageHeader
        title={company.name}
        description="Company detail view"
        action={
          <Button variant="secondary" size="sm" disabled={deleting} onClick={handleDeleteCompany}>
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        }
      />

      <ProfileCard
        companyId={companyId}
        company={company}
        portfolioCompany={portfolioCompany}
        onSaved={setCompany}
        setMessage={setMessage}
      />

      {/* Tab navigation (URL tabs) */}
      <TabBar<Tab> label="Company sections" tabs={tabs} active={activeTab} fallback="updates" />

      {activeTab === "updates" && <UpdatesTab companyId={companyId} updates={updates} />}
      {activeTab === "metrics" && (
        <MetricsTab
          companyId={companyId}
          metrics={metrics}
          setMetrics={setMetrics}
          reloadMetrics={loadMetrics}
          setMessage={setMessage}
        />
      )}
      {activeTab === "documents" && (
        <DocumentsTab
          companyId={companyId}
          documents={documents}
          loadDocuments={loadDocuments}
          setMessage={setMessage}
        />
      )}
      {activeTab === "members" && (
        <MembersTab companyId={companyId} members={members} setMembers={setMembers} setMessage={setMessage} />
      )}
      {activeTab === "notes" && (
        <NotesTab companyId={companyId} notes={notes} setNotes={setNotes} setMessage={setMessage} />
      )}
      {/* Shown only when a CompanyDiligence row exists (see `tabs`). */}
      {activeTab === "diligence" && diligence && <DiligenceTab diligence={diligence} />}
    </AppShell>
  );
}

export default function AdminCompanyDetailPage() {
  return (
    <Suspense fallback={null}>
      <AdminCompanyDetailPageInner />
    </Suspense>
  );
}
