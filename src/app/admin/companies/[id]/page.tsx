"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  FileText,
  BarChart3,
  FolderOpen,
  Users,
  Globe,
  MapPin,
  Pencil,
  Plus,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Save,
  Upload,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Trash2,
  Download,
  X,
  Search,
  Archive,
  ArchiveRestore,
  Bell,
  NotebookPen,
  History,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, normalizeUrl } from "@/lib/utils";
import { SectorCombobox } from "@/components/ui/sector-combobox";
import { MetricChart } from "@/components/ui/metric-chart";
import { DOC_TYPES } from "@/lib/constants";
import { RichEditor } from "@/components/ui/rich-editor";

const FUNDING_STAGES = ["Pre-seed", "Seed", "Series A", "Series B+"];

const REMINDER_OPTIONS = [
  { label: "Disabled", value: null },
  { label: "Weekly", value: 7 },
  { label: "Bi-weekly", value: 14 },
  { label: "Monthly", value: 30 },
  { label: "Quarterly", value: 90 },
] as const;

interface Company {
  id: string;
  name: string;
  logo: string | null;
  description: string | null;
  website: string | null;
  sector: string | null;
  geography: string | null;
  fundingStage: string | null;
  aliases: string[];
  reminderFrequencyDays: number | null;
  lastReminderSentAt: string | null;
}

interface Update {
  id: string;
  title: string;
  period: string;
  status: "DRAFT" | "SENT";
  createdAt: string;
}

interface MetricDefinition {
  id: string;
  name: string;
  unit: string | null;
  values: { value: number; date: string }[];
}

interface Document {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  isInternal: boolean;
  docType: string | null;
  archivedAt: string | null;
  createdAt: string;
  uploadedBy: string | null;
}

interface Member {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  userRoles: string[];
  membershipRole: "OWNER" | "MEMBER" | "VIEWER";
}

interface NoteUser {
  id: string;
  name: string | null;
  email: string;
}

interface NoteRevision {
  id: string;
  noteId: string;
  title: string;
  body: string;
  occurredAt: string;
  transcriptUrl: string | null;
  editedById: string;
  editedBy: NoteUser;
  createdAt: string;
}

interface Note {
  id: string;
  title: string;
  body: string;
  occurredAt: string;
  transcriptUrl: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: NoteUser;
  revisions: NoteRevision[];
  _count: { revisions: number };
}

type Tab = "updates" | "metrics" | "documents" | "members" | "notes";

export default function AdminCompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("updates");

  // Company edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Metric add form
  const [showAddMetric, setShowAddMetric] = useState(false);
  const [newMetricName, setNewMetricName] = useState("");
  const [newMetricUnit, setNewMetricUnit] = useState("");
  const [addingMetric, setAddingMetric] = useState(false);
  const [deletingMetricId, setDeletingMetricId] = useState<string | null>(null);

  // Member management
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  // Company deletion
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Notes
  const [notes, setNotes] = useState<Note[]>([]);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteForm, setNoteForm] = useState({ title: "", body: "", occurredAt: "", transcriptUrl: "" });
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  // History modal
  const [historyNote, setHistoryNote] = useState<Note | null>(null);
  const [revisions, setRevisions] = useState<NoteRevision[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  // Diff modal
  const [diffLeft, setDiffLeft] = useState<NoteRevision | null>(null);
  const [diffRight, setDiffRight] = useState<NoteRevision | null>(null);

  // Document upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadInternal, setUploadInternal] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<string>("");
  const [docSearch, setDocSearch] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [archivingDocId, setArchivingDocId] = useState<string | null>(null);

  const loadCompany = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}`);
      if (!res.ok) throw new Error("Failed to load company");
      const data = await res.json();
      const c = data.data ?? data;
      setCompany(c);
      setEditForm(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
      await Promise.all([loadUpdates(), loadMetrics(), loadDocuments(), loadMembers(), loadNotes()]);
      setLoading(false);
    }

    fetchAll();
  }, [loadCompany, loadUpdates, loadMetrics, loadDocuments, loadMembers, loadNotes]);

  function updateEditField(field: keyof Company, value: string | number | null) {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleSaveEdit() {
    if (!editForm) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          website: normalizeUrl(editForm.website ?? ""),
          sector: editForm.sector,
          geography: editForm.geography,
          fundingStage: editForm.fundingStage,
          aliases: editForm.aliases,
          reminderFrequencyDays: editForm.reminderFrequencyDays,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to save");
      }
      setCompany(editForm);
      setEditing(false);
      setMessage({ type: "success", text: "Company profile updated." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save.",
      });
    } finally {
      setSaving(false);
    }
  }

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
      await loadMetrics();
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

  async function handleAddMember() {
    if (!addMemberEmail.trim()) return;
    setAddingMember(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addMemberEmail.trim(), role: "MEMBER" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to add member");
      setMembers((prev) => {
        if (prev.find((m) => m.userId === data.userId)) return prev;
        return [...prev, data];
      });
      setAddMemberEmail("");
      setShowAddMember(false);
      setMessage({ type: "success", text: `${data.email} added as a member.` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to add member.",
      });
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    setRemovingMemberId(userId);
    try {
      const res = await fetch(`/api/companies/${companyId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to remove member");
      }
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to remove member.",
      });
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleMemberRoleChange(userId: string, role: "OWNER" | "MEMBER" | "VIEWER") {
    setUpdatingRoleId(userId);
    try {
      const res = await fetch(`/api/companies/${companyId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to update role");
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, membershipRole: data.membershipRole } : m))
      );
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update role.",
      });
    } finally {
      setUpdatingRoleId(null);
    }
  }

  async function handleDeleteCompany() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "DELETE",
      });
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
      setConfirmDelete(false);
      setDeleting(false);
    }
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      // Step 1: Get presigned upload URL and create document record
      const initRes = await fetch(`/api/documents/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          isInternal: uploadInternal,
          docType: uploadDocType || null,
        }),
      });
      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to initiate upload");
      }
      const { uploadUrl } = await initRes.json();

      // Step 2: PUT file directly to R2/S3
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      await loadDocuments({ search: docSearch, docType: docTypeFilter, archived: showArchived });
      setMessage({ type: "success", text: `"${file.name}" uploaded successfully.` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Upload failed.",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownload(docId: string, docName: string) {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (!res.ok) throw new Error("Failed to get download link");
      const data = await res.json();
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = docName;
      a.click();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Download failed.",
      });
    }
  }

  async function handleArchiveDoc(docId: string, archive: boolean) {
    setArchivingDocId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive }),
      });
      if (!res.ok) throw new Error("Failed to update document");
      await loadDocuments({ search: docSearch, docType: docTypeFilter, archived: showArchived });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update document.",
      });
    } finally {
      setArchivingDocId(null);
    }
  }

  function getTrend(values: { value: number; date: string }[]) {
    if (values.length < 2) return "flat";
    const sorted = [...values].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    if (sorted[0].value > sorted[1].value) return "up";
    if (sorted[0].value < sorted[1].value) return "down";
    return "flat";
  }

  function TrendIcon({ trend }: { trend: string }) {
    if (trend === "up") return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (trend === "down") return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "updates", label: "Updates", icon: <FileText className="h-4 w-4" /> },
    { key: "metrics", label: "Metrics", icon: <BarChart3 className="h-4 w-4" /> },
    { key: "documents", label: "Documents", icon: <FolderOpen className="h-4 w-4" /> },
    { key: "members", label: "Members", icon: <Users className="h-4 w-4" /> },
    { key: "notes", label: "Notes", icon: <NotebookPen className="h-4 w-4" /> },
  ];

  return (
    <AppShell>
      <PageHeader
        title={company.name}
        description="Company detail view"
        action={
          <div className="flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-sm text-muted-foreground">Delete this company?</span>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleting}
                  onClick={handleDeleteCompany}
                >
                  {deleting ? "Deleting..." : "Confirm Delete"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={() => router.push("/admin/companies")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)}>
            <X className="h-4 w-4 opacity-50 hover:opacity-100" />
          </button>
        </div>
      )}

      {/* Company profile summary */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="flex items-center gap-3">
              {company.logo ? (
                <img
                  src={company.logo}
                  alt={company.name}
                  className="h-10 w-10 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                  <Building2 className="h-5 w-5" />
                </div>
              )}
              {editing ? "Edit Company" : company.name}
            </CardTitle>
            {!editing && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditForm(company);
                  setEditing(true);
                  setMessage(null);
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editing && editForm ? (
            <div className="space-y-4">
              <Input
                id="edit-name"
                label="Company Name"
                value={editForm.name}
                onChange={(e) => updateEditField("name", e.target.value)}
                required
              />
              <Textarea
                id="edit-description"
                label="Description"
                value={editForm.description ?? ""}
                onChange={(e) => updateEditField("description", e.target.value)}
                rows={3}
              />
              <Input
                id="edit-website"
                label="Website"
                type="text"
                value={editForm.website ?? ""}
                onChange={(e) => updateEditField("website", e.target.value)}
                placeholder="example.com"
              />
              <SectorCombobox
                id="edit-sector"
                label="Sector"
                value={editForm.sector ?? ""}
                onChange={(v) => updateEditField("sector", v || null)}
                isAdmin
              />
              <Input
                id="edit-geography"
                label="Geography"
                value={editForm.geography ?? ""}
                onChange={(e) => updateEditField("geography", e.target.value)}
              />
              <div className="space-y-1">
                <label htmlFor="edit-aliases" className="label">
                  Aliases
                </label>
                <input
                  id="edit-aliases"
                  className="input-field"
                  placeholder="e.g. Initech, HashrailsHQ"
                  value={editForm.aliases.join(", ")}
                  onChange={(e) =>
                    setEditForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            aliases: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          }
                        : prev
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">Comma-separated alternative names used for Granola matching</p>
              </div>
              <div className="space-y-1">
                <label htmlFor="edit-fundingStage" className="label">
                  Funding Stage
                </label>
                <select
                  id="edit-fundingStage"
                  value={editForm.fundingStage ?? ""}
                  onChange={(e) => updateEditField("fundingStage", e.target.value)}
                  className="input-field"
                >
                  <option value="">Select a stage</option>
                  {FUNDING_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="edit-reminderFrequency" className="label">
                  Update Reminder Frequency
                </label>
                <select
                  id="edit-reminderFrequency"
                  value={editForm.reminderFrequencyDays ?? ""}
                  onChange={(e) =>
                    updateEditField(
                      "reminderFrequencyDays",
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                  className="input-field"
                >
                  {REMINDER_OPTIONS.map((o) => (
                    <option key={String(o.value)} value={o.value ?? ""}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Founders will receive an email reminder when they haven&apos;t submitted an update within this window.
                </p>
              </div>
              <div className="flex justify-end gap-3 border-t pt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setEditForm(company);
                    setMessage(null);
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" disabled={saving} onClick={handleSaveEdit}>
                  <Save className="mr-2 h-3.5 w-3.5" />
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {company.description && (
                <p className="text-sm text-muted-foreground">{company.description}</p>
              )}
              <div className="flex flex-wrap gap-4 text-sm">
                {company.sector && (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="neutral">{company.sector}</Badge>
                  </div>
                )}
                {company.geography && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {company.geography}
                  </div>
                )}
                {company.fundingStage && (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="info">{company.fundingStage}</Badge>
                  </div>
                )}
                {company.website && (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Website
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Bell className="h-3.5 w-3.5" />
                {company.reminderFrequencyDays ? (
                  <>
                    Reminders:{" "}
                    <span className="font-medium text-foreground">
                      {REMINDER_OPTIONS.find((o) => o.value === company.reminderFrequencyDays)?.label ?? `Every ${company.reminderFrequencyDays}d`}
                    </span>
                    {company.lastReminderSentAt ? (
                      <span className="ml-1">
                        &middot; Last sent{" "}
                        {Math.floor(
                          (Date.now() - new Date(company.lastReminderSentAt).getTime()) /
                            86_400_000
                        )}
                        d ago
                      </span>
                    ) : (
                      <span className="ml-1">&middot; Never sent</span>
                    )}
                  </>
                ) : (
                  <span>Reminders: Off</span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Updates tab */}
      {activeTab === "updates" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Updates</h3>
            <Button
              size="sm"
              onClick={() =>
                router.push(`/admin/companies/${companyId}/updates/new`)
              }
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Create Update
            </Button>
          </div>
          {updates.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title="No updates yet"
              description="No updates have been submitted for this company."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    router.push(`/admin/companies/${companyId}/updates/new`)
                  }
                >
                  Create Update
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {updates.map((update) => (
                <Link
                  key={update.id}
                  href={`/updates/${update.id}`}
                  className="block"
                >
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardContent className="flex items-center justify-between py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{update.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {update.period} &middot; {formatDate(update.createdAt)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          update.status === "SENT" ? "success" : "warning"
                        }
                      >
                        {update.status === "SENT" ? "Sent" : "Draft"}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Metrics tab */}
      {activeTab === "metrics" && (
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
      )}

      {/* Documents tab */}
      {activeTab === "documents" && (
        <div>
          {/* Upload controls */}
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <p className="mb-1 text-sm font-medium">Upload Document</p>
              <div className="flex items-center gap-2">
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">No type</option>
                  {DOC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={uploadInternal}
                    onChange={(e) => setUploadInternal(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Internal only
                </label>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-3.5 w-3.5" />
                  {uploading ? "Uploading..." : "Upload"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Filter bar */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search documents..."
                value={docSearch}
                onChange={(e) => {
                  setDocSearch(e.target.value);
                  loadDocuments({ search: e.target.value, docType: docTypeFilter, archived: showArchived });
                }}
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
              />
            </div>
            <select
              value={docTypeFilter}
              onChange={(e) => {
                setDocTypeFilter(e.target.value);
                loadDocuments({ search: docSearch, docType: e.target.value, archived: showArchived });
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All types</option>
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => {
                  setShowArchived(e.target.checked);
                  loadDocuments({ search: docSearch, docType: docTypeFilter, archived: e.target.checked });
                }}
                className="h-3.5 w-3.5"
              />
              Show archived
            </label>
          </div>

          {documents.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-8 w-8" />}
              title="No documents"
              description={showArchived ? "No archived documents." : "No documents have been uploaded for this company."}
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Uploaded By</th>
                      <th className="px-4 py-3 font-medium">Size</th>
                      <th className="px-4 py-3 font-medium">Visibility</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr
                        key={doc.id}
                        className={`border-b last:border-0 hover:bg-muted/50 ${doc.archivedAt ? "opacity-60" : ""}`}
                      >
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            {doc.name}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {doc.docType ? (
                            <Badge variant="neutral">
                              {DOC_TYPES.find((t) => t.value === doc.docType)?.label ?? doc.docType}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(doc.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {doc.uploadedBy ?? "Unknown"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatFileSize(doc.size)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={doc.isInternal ? "warning" : "neutral"}>
                            {doc.isInternal ? "Internal" : "Shared"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDownload(doc.id, doc.name)}
                              className="text-muted-foreground hover:text-primary"
                              title="Download"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleArchiveDoc(doc.id, !doc.archivedAt)}
                              disabled={archivingDocId === doc.id}
                              className="text-muted-foreground hover:text-amber-600 disabled:opacity-40"
                              title={doc.archivedAt ? "Unarchive" : "Archive"}
                            >
                              {doc.archivedAt ? (
                                <ArchiveRestore className="h-4 w-4" />
                              ) : (
                                <Archive className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Members tab */}
      {activeTab === "members" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Members</h3>
            {!showAddMember && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowAddMember(true)}
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add Member
              </Button>
            )}
          </div>

          {showAddMember && (
            <Card className="mb-4">
              <CardContent className="pt-4">
                <p className="mb-3 text-sm font-medium">Add member by email</p>
                <div className="flex gap-2">
                  <Input
                    id="member-email"
                    label=""
                    type="email"
                    placeholder="founder@example.com"
                    value={addMemberEmail}
                    onChange={(e) => setAddMemberEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddMember();
                    }}
                    className="flex-1"
                  />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowAddMember(false);
                      setAddMemberEmail("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={addingMember || !addMemberEmail.trim()}
                    onClick={handleAddMember}
                  >
                    {addingMember ? "Adding..." : "Add Member"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {members.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No members"
              description="No users are associated with this company. Add a member by their email address."
            />
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <Card key={member.membershipId}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-medium">
                        {member.name?.[0]?.toUpperCase() ??
                          member.email[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">
                          {member.name ?? member.email}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {member.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={member.userRoles.includes("ADMIN") ? "info" : "neutral"}>
                        {member.userRoles.includes("ADMIN") ? "Admin" : "Founder"}
                      </Badge>
                      {/* Membership role select (admins can set OWNER/MEMBER/VIEWER) */}
                      {!member.userRoles.includes("ADMIN") && (
                        <select
                          value={member.membershipRole}
                          disabled={updatingRoleId === member.userId}
                          onChange={(e) =>
                            handleMemberRoleChange(
                              member.userId,
                              e.target.value as "OWNER" | "MEMBER" | "VIEWER"
                            )
                          }
                          className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        >
                          <option value="OWNER">Owner</option>
                          <option value="MEMBER">Editor</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                      )}
                      <button
                        onClick={() => handleRemoveMember(member.userId)}
                        disabled={removingMemberId === member.userId}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                        title="Remove member"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Notes tab */}
      {activeTab === "notes" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Notes</h3>
            {!showNoteForm && !editingNote && (
              <Button
                size="sm"
                onClick={() => {
                  setNoteForm({ title: "", body: "", occurredAt: new Date().toISOString().split("T")[0], transcriptUrl: "" });
                  setShowNoteForm(true);
                }}
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add Note
              </Button>
            )}
          </div>

          {/* Create / Edit form */}
          {(showNoteForm || editingNote) && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">
                  {editingNote ? "Edit Note" : "New Note"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Title</label>
                    <input
                      type="text"
                      value={noteForm.title}
                      onChange={(e) => setNoteForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder="e.g. Q1 check-in call"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Date of event</label>
                    <input
                      type="date"
                      value={noteForm.occurredAt}
                      onChange={(e) => setNoteForm((p) => ({ ...p, occurredAt: e.target.value }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Transcript / Recording URL <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <input
                    type="url"
                    value={noteForm.transcriptUrl}
                    onChange={(e) => setNoteForm((p) => ({ ...p, transcriptUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Notes</label>
                  <RichEditor
                    value={noteForm.body}
                    onChange={(val) => setNoteForm((p) => ({ ...p, body: val }))}
                    placeholder="Add your call notes here..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={savingNote}
                    onClick={async () => {
                      setSavingNote(true);
                      try {
                        const url = editingNote
                          ? `/api/companies/${companyId}/notes/${editingNote.id}`
                          : `/api/companies/${companyId}/notes`;
                        const res = await fetch(url, {
                          method: editingNote ? "PATCH" : "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(noteForm),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data?.error ?? "Failed to save note");
                        if (editingNote) {
                          setNotes((prev) => prev.map((n) => n.id === data.id ? data : n));
                          setEditingNote(null);
                        } else {
                          setNotes((prev) => [data, ...prev]);
                          setShowNoteForm(false);
                        }
                        setMessage({ type: "success", text: "Note saved." });
                      } catch (err) {
                        setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save note." });
                      } finally {
                        setSavingNote(false);
                      }
                    }}
                  >
                    <Save className="mr-2 h-3.5 w-3.5" />
                    {savingNote ? "Saving..." : "Save Note"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { setShowNoteForm(false); setEditingNote(null); }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes list */}
          {notes.length === 0 && !showNoteForm ? (
            <EmptyState
              icon={<NotebookPen className="h-8 w-8" />}
              title="No notes yet"
              description="Add call notes, meeting summaries, or any admin observations about this company."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setNoteForm({ title: "", body: "", occurredAt: new Date().toISOString().split("T")[0], transcriptUrl: "" });
                    setShowNoteForm(true);
                  }}
                >
                  Add First Note
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              {notes.map((note) => (
                <Card key={note.id}>
                  <CardContent className="py-4">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold">{note.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(note.occurredAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                          {" · "}Added by {note.createdBy.name ?? note.createdBy.email}
                          {note._count.revisions > 1 && (
                            <> · <span className="text-muted-foreground">{note._count.revisions} revisions</span></>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {note.transcriptUrl && (
                          <a
                            href={note.transcriptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary-50"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Transcript
                          </a>
                        )}
                        <button
                          onClick={async () => {
                            setHistoryNote(note);
                            setLoadingRevisions(true);
                            setDiffLeft(null);
                            setDiffRight(null);
                            try {
                              const res = await fetch(`/api/companies/${companyId}/notes/${note.id}/revisions`);
                              if (res.ok) setRevisions(await res.json());
                            } finally {
                              setLoadingRevisions(false);
                            }
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="View history"
                        >
                          <History className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingNote(note);
                            setNoteForm({
                              title: note.title,
                              body: note.body,
                              occurredAt: new Date(note.occurredAt).toISOString().split("T")[0],
                              transcriptUrl: note.transcriptUrl ?? "",
                            });
                            setShowNoteForm(false);
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Edit note"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          disabled={deletingNoteId === note.id}
                          onClick={async () => {
                            setDeletingNoteId(note.id);
                            try {
                              const res = await fetch(`/api/companies/${companyId}/notes/${note.id}`, { method: "DELETE" });
                              if (!res.ok) throw new Error("Failed to delete note");
                              setNotes((prev) => prev.filter((n) => n.id !== note.id));
                            } catch {
                              setMessage({ type: "error", text: "Failed to delete note." });
                            } finally {
                              setDeletingNoteId(null);
                            }
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
                          title="Delete note"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div
                      className="prose prose-sm max-w-none text-foreground line-clamp-4 dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: note.body }}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* History modal */}
          {historyNote && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="flex w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl" style={{ maxHeight: "90vh" }}>
                <div className="flex items-center justify-between border-b px-6 py-4">
                  <div>
                    <p className="font-semibold">{historyNote.title}</p>
                    <p className="text-sm text-muted-foreground">Edit history</p>
                  </div>
                  <button
                    onClick={() => { setHistoryNote(null); setDiffLeft(null); setDiffRight(null); }}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {diffLeft && diffRight ? (
                  /* Side-by-side diff view */
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex items-center gap-2 border-b px-6 py-3">
                      <button
                        onClick={() => { setDiffLeft(null); setDiffRight(null); }}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Back to history
                      </button>
                      <span className="text-sm text-muted-foreground">
                        Comparing revision {revisions.indexOf(diffRight) + 1} → {revisions.indexOf(diffLeft) + 1}
                      </span>
                    </div>
                    <div className="grid flex-1 grid-cols-2 overflow-hidden divide-x">
                      <DiffPane label="Before" revision={diffRight} otherRevision={diffLeft} />
                      <DiffPane label="After" revision={diffLeft} otherRevision={diffRight} isNewer />
                    </div>
                  </div>
                ) : (
                  /* Revision list */
                  <div className="overflow-y-auto p-6">
                    {loadingRevisions ? (
                      <p className="text-sm text-muted-foreground">Loading revisions...</p>
                    ) : (
                      <div className="space-y-3">
                        {revisions.map((rev, idx) => (
                          <div
                            key={rev.id}
                            className="flex items-center justify-between rounded-lg border p-3"
                          >
                            <div>
                              <p className="text-sm font-medium">
                                {idx === 0 ? "Current version" : `Revision ${revisions.length - idx}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {rev.editedBy.name ?? rev.editedBy.email} · {new Date(rev.createdAt).toLocaleString()}
                              </p>
                            </div>
                            {idx < revisions.length - 1 && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setDiffLeft(rev);
                                  setDiffRight(revisions[idx + 1]);
                                }}
                              >
                                Compare with previous
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

// ─── Diff pane component ──────────────────────────────────

function stripHtml(html: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent ?? "";
}

function DiffPane({
  label,
  revision,
  otherRevision,
  isNewer = false,
}: {
  label: string;
  revision: NoteRevision;
  otherRevision: NoteRevision;
  isNewer?: boolean;
}) {
  const { diffWords } = require("diff") as typeof import("diff");

  const oldText = stripHtml(isNewer ? otherRevision.body : revision.body);
  const newText = stripHtml(isNewer ? revision.body : otherRevision.body);
  const parts = diffWords(oldText, newText);

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="border-b bg-muted/40 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">
          {revision.editedBy.name ?? revision.editedBy.email} · {new Date(revision.createdAt).toLocaleString()}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-sm leading-relaxed">
        {revision.title !== otherRevision.title && (
          <p className={`mb-3 rounded px-2 py-1 font-semibold ${isNewer ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800 line-through"}`}>
            {revision.title}
          </p>
        )}
        <p className="whitespace-pre-wrap">
          {parts.map((part, i) => {
            if (isNewer) {
              if (part.added) return <mark key={i} className="bg-green-100 text-green-900 rounded px-0.5">{part.value}</mark>;
              if (part.removed) return null;
            } else {
              if (part.removed) return <mark key={i} className="bg-red-100 text-red-900 line-through rounded px-0.5">{part.value}</mark>;
              if (part.added) return null;
            }
            return <span key={i}>{part.value}</span>;
          })}
        </p>
      </div>
    </div>
  );
}
