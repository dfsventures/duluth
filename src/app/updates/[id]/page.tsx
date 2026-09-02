"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Globe,
  Download,
  FileText,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Paperclip,
  Pencil,
  X,
  Calendar,
  ChevronDown,
  ChevronUp,
  Trash2,
  Eye,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichEditor } from "@/components/ui/rich-editor";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatPeriod } from "@/lib/utils";
import { DOC_TYPES } from "@/lib/constants";
import { isInlineViewable } from "@/lib/documents";
import { ORG_NAME } from "@/lib/org";
import { ComposerTopBar } from "@/components/composer/composer-top-bar";
import { ComposerTitleField } from "@/components/composer/composer-title-field";
import { ComposerDisclosure } from "@/components/composer/composer-disclosure";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";

interface MetricDefinition {
  id: string;
  name: string;
  unit: string | null;
}

interface UpdateDetail {
  id: string;
  title: string;
  period: string;
  status: "DRAFT" | "SENT";
  body: string;
  sentAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
  companyId: string;
  metricValues?: {
    id: string;
    value: number;
    date: string;
    metricDefinition: {
      id: string;
      name: string;
      unit: string | null;
    };
  }[];
  documents?: {
    id: string;
    name: string;
    mimeType: string | null;
    size: number | null;
    docType: string | null;
  }[];
  comments?: {
    id: string;
    body: string;
    createdAt: string;
    author: {
      id: string;
      name: string | null;
      email: string;
      roles: string[];
    };
  }[];
}

export default function UpdateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const updateId = params.id as string;

  const [update, setUpdate] = useState<UpdateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduling, setScheduling] = useState(false);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editPeriod, setEditPeriod] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editMetrics, setEditMetrics] = useState<Record<string, string>>({});
  const [metricDefs, setMetricDefs] = useState<MetricDefinition[]>([]);
  const [editDirty, setEditDirty] = useState(false);

  // Autosave (Part 8, Q16 = B) — existing drafts only, suppressed while a
  // manual save/publish/schedule is already in flight.
  const autosave = useDraftAutosave({
    enabled: editing,
    dirty: editDirty,
    suppressed: saving || sending || scheduling || confirmPublish,
    onSave: () => handleSaveEdit({ silent: true }),
  });

  function handleEditTitleChange(v: string) {
    setEditTitle(v);
    setEditDirty(true);
  }
  function handleEditPeriodChange(v: string) {
    setEditPeriod(v);
    setEditDirty(true);
  }
  function handleEditBodyChange(v: string) {
    setEditBody(v);
    setEditDirty(true);
  }
  function handleEditMetricChange(metricId: string, value: string) {
    setEditMetrics((prev) => ({ ...prev, [metricId]: value }));
    setEditDirty(true);
  }

  // Comment form
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    loadUpdate();
  }, [updateId]);

  async function loadUpdate() {
    try {
      const res = await fetch(`/api/updates/${updateId}`);
      if (!res.ok) throw new Error("Failed to load update");
      const data = await res.json();
      const u = data.data ?? data;
      setUpdate(u);
    } catch {
      setMessage({ type: "error", text: "Failed to load update." });
    } finally {
      setLoading(false);
    }
  }

  async function enterEditMode() {
    if (!update) return;
    setEditTitle(update.title);
    setEditPeriod(update.period);
    setEditBody(update.body ?? "");

    // Pre-fill existing metric values
    const existing: Record<string, string> = {};
    update.metricValues?.forEach((mv) => {
      existing[mv.metricDefinition.id] = String(mv.value);
    });
    setEditMetrics(existing);

    // Load all metric definitions for this company
    if (update.companyId && metricDefs.length === 0) {
      const res = await fetch(`/api/companies/${update.companyId}/metrics`);
      if (res.ok) {
        const data = await res.json();
        setMetricDefs(data.data ?? data ?? []);
      }
    }

    setEditDirty(false);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditDirty(false);
    setMessage(null);
  }

  async function handleDeleteDraft() {
    if (!update) return;
    // Unlike the list page's one-click delete, the draft's content is on
    // screen here — confirm before destroying visible work.
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/updates/${update.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to delete draft.");
      }
      router.push("/updates");
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete draft.",
      });
      setDeleting(false);
    }
  }

  async function handleSaveEdit(opts: { silent?: boolean } = {}) {
    const silent = opts.silent ?? false;
    if (!update) return;
    if (!editTitle.trim() || !editPeriod.trim()) {
      if (!silent) setMessage({ type: "error", text: "Title and period are required." });
      throw new Error("Title and period are required.");
    }

    if (!silent) {
      setSaving(true);
      setMessage(null);
    }

    try {
      const metricValues = Object.entries(editMetrics)
        .filter(([, v]) => v.trim() !== "")
        .map(([metricDefinitionId, value]) => ({
          metricDefinitionId,
          value: parseFloat(value),
          date: new Date().toISOString(),
        }));

      const res = await fetch(`/api/updates/${updateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          period: editPeriod.trim(),
          body: editBody,
          metricValues,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to save");
      }

      setEditDirty(false);
      if (!silent) {
        setEditing(false);
        setMessage({ type: "success", text: "Update saved." });
        await loadUpdate();
      }
    } catch (err) {
      if (!silent) {
        setMessage({
          type: "error",
          text: err instanceof Error ? err.message : "Failed to save.",
        });
      }
      throw err;
    } finally {
      if (!silent) setSaving(false);
    }
  }

  async function handleSendToDFS() {
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/updates/${updateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SENT" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to send update");
      }
      setMessage({ type: "success", text: `Update published. The ${ORG_NAME} team has been notified.` });
      setConfirmPublish(false);
      await loadUpdate();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to send update.",
      });
    } finally {
      setSending(false);
    }
  }

  async function handleSchedule() {
    if (!scheduleDate) return;
    setScheduling(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/updates/${updateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor: new Date(`${scheduleDate}T00:00:00Z`).toISOString() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to schedule update");
      }
      setMessage({ type: "success", text: "Draft scheduled." });
      setShowSchedule(false);
      setScheduleDate("");
      await loadUpdate();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to schedule update.",
      });
    } finally {
      setScheduling(false);
    }
  }

  async function handleCancelSchedule() {
    setScheduling(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/updates/${updateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor: null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to cancel schedule");
      }
      setMessage({ type: "success", text: "Schedule canceled." });
      await loadUpdate();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to cancel schedule.",
      });
    } finally {
      setScheduling(false);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setPostingComment(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/updates/${updateId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newComment.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to add comment");
      }
      setNewComment("");
      await loadUpdate();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to add comment.",
      });
    } finally {
      setPostingComment(false);
    }
  }

  async function handleDownloadDoc(docId: string, docName: string) {
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

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </AppShell>
    );
  }

  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const sentAgeMs = update?.sentAt ? Date.now() - new Date(update.sentAt).getTime() : Infinity;
  const isEditablePublished = update?.status === "SENT" && sentAgeMs < THREE_DAYS_MS;
  const canEdit = update?.status === "DRAFT" || isEditablePublished;
  // Hours remaining to edit a published update (shown as a hint)
  const editHoursLeft = isEditablePublished
    ? Math.max(0, Math.ceil((THREE_DAYS_MS - sentAgeMs) / (60 * 60 * 1000)))
    : 0;

  if (!update) {
    return (
      <AppShell>
        <PageHeader title="Update Not Found" />
        <p className="text-sm text-muted-foreground">
          This update could not be found or you don&apos;t have access.
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => router.push("/updates")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Updates
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Edit mode replaces the page header with the composer top bar below
          (Part 8, WS20.4) — view mode keeps the original header untouched. */}
      {!editing && (
        <PageHeader
          title={update.title}
          description={`${formatPeriod(update.period)} · Created ${formatDate(update.createdAt)}`}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={update.status === "SENT" ? "success" : "warning"}>
                {update.status === "SENT"
                  ? "Published"
                  : update.scheduledFor
                    ? `Scheduled · ${formatDate(update.scheduledFor)}`
                    : "Draft"}
              </Badge>
              {canEdit && (
                <Button variant="secondary" size="sm" onClick={enterEditMode}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
              <Link href={`/updates/${updateId}/download`}>
                <Button variant="secondary" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </Link>
            </div>
          }
        />
      )}

      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-acacia/30 bg-acacia/10 text-acacia"
              : "border-laterite/30 bg-laterite/10 text-laterite"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Scheduled banner (view mode only) */}
      {!editing && update.status === "DRAFT" && update.scheduledFor && (
        <div className="mb-3 flex flex-col gap-3 rounded-md border border-primary/20 bg-primary-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-primary-600">
            Scheduled to publish on {formatDate(update.scheduledFor)}.
          </p>
          <Button variant="secondary" size="sm" disabled={scheduling} onClick={handleCancelSchedule}>
            {scheduling ? "Canceling..." : "Cancel schedule"}
          </Button>
        </div>
      )}

      {/* Publish banner (view mode only) */}
      {!editing && update.status === "DRAFT" && (
        <div className="mb-6 flex flex-col gap-3 rounded-md border border-ochre/30 bg-ochre/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ochre">
            This update is still a draft. Publish it when ready.
          </p>
          {confirmPublish ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ochre">Publish and notify the {ORG_NAME} team?</span>
              <Button variant="secondary" size="sm" disabled={sending} onClick={() => setConfirmPublish(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={sending} onClick={handleSendToDFS}>
                {sending ? "Publishing..." : "Confirm Publish"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteDraft}
                disabled={deleting}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                title="Delete draft"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <Button size="sm" disabled={sending || deleting} onClick={() => setConfirmPublish(true)}>
                <Globe className="mr-2 h-4 w-4" />
                Publish
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Schedule for later (collapsed by default; only offered when not already scheduled) */}
      {!editing && update.status === "DRAFT" && !update.scheduledFor && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowSchedule((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Calendar className="h-3.5 w-3.5" />
            Schedule for later
            {showSchedule ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showSchedule && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Input
                id="schedule-date"
                label="Publish date"
                type="date"
                min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!scheduleDate || scheduling}
                onClick={handleSchedule}
              >
                {scheduling ? "Scheduling..." : "Schedule"}
              </Button>
              <p className="w-full text-xs text-muted-foreground">
                Publishes on the morning of the selected date (UTC). You can keep editing until then.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── EDIT MODE ─────────────────────────────────── */}
      {editing ? (
        <div>
          <ComposerTopBar
            draftLabel={isEditablePublished ? `Editing published · ${editHoursLeft}h left` : "Draft"}
            saveStateLabel={autosave.label}
            secondaryActions={
              <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={saving}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            }
            publishLabel={saving ? "Saving..." : "Save Changes"}
            onPublishClick={() => handleSaveEdit()}
            publishDisabled={!editTitle.trim() || !editPeriod.trim()}
            publishing={saving}
          />

          {/* Validation errors repeat next to the buttons that trigger them —
              the top-of-page banner is out of view on this long form */}
          {message?.type === "error" && (
            <div className="mb-6 flex items-center gap-2 rounded-md border border-laterite/30 bg-laterite/10 px-4 py-3 text-sm text-laterite">
              <AlertCircle className="h-4 w-4" />
              {message.text}
            </div>
          )}

          <div className="mx-auto max-w-3xl">
            <ComposerTitleField
              title={editTitle}
              onTitleChange={handleEditTitleChange}
              period={editPeriod}
              onPeriodChange={handleEditPeriodChange}
            />

            <RichEditor
              variant="chromeless"
              value={editBody}
              onChange={handleEditBodyChange}
              placeholder="Tell your investors what happened…"
              companyId={update.companyId}
            />

            {metricDefs.length > 0 && (
              <ComposerDisclosure label="Details — metrics & attachments" defaultOpen>
                <div>
                  <p className="mb-3 text-sm font-medium">Metric Values</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {metricDefs.map((m) => (
                      <Input
                        key={m.id}
                        id={`edit-metric-${m.id}`}
                        label={`${m.name}${m.unit ? ` (${m.unit})` : ""}`}
                        type="number"
                        step="any"
                        value={editMetrics[m.id] ?? ""}
                        onChange={(e) => handleEditMetricChange(m.id, e.target.value)}
                        placeholder="Enter value"
                      />
                    ))}
                  </div>
                </div>
              </ComposerDisclosure>
            )}
          </div>
        </div>
      ) : (
        /* ── VIEW MODE ─────────────────────────────────── */
        <>
          {/* Update body */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Update Content</CardTitle>
            </CardHeader>
            <CardContent>
              {update.body ? (
                <div
                  className="prose prose-sm max-w-none text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: update.body }}
                />
              ) : (
                <span className="text-sm italic text-muted-foreground">
                  No content provided.
                </span>
              )}
            </CardContent>
          </Card>

          {/* Metric values */}
          {update.metricValues && update.metricValues.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Metric</th>
                      <th className="pb-2 font-medium">Value</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {update.metricValues.map((mv) => (
                      <tr key={mv.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{mv.metricDefinition.name}</td>
                        <td className="py-2">
                          {mv.value}
                          {mv.metricDefinition.unit ? ` ${mv.metricDefinition.unit}` : ""}
                        </td>
                        <td className="py-2">{formatDate(mv.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Attachments */}
          {update.documents && update.documents.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Attachments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {update.documents.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{doc.name}</p>
                          {doc.docType && (
                            <Badge variant="neutral">
                              {DOC_TYPES.find((t) => t.value === doc.docType)?.label ?? doc.docType}
                            </Badge>
                          )}
                        </div>
                        {doc.size && (
                          <p className="text-xs text-muted-foreground">
                            {(doc.size / 1024).toFixed(1)} KB
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isInlineViewable(doc.mimeType) && (
                          <a
                            href={`/api/documents/${doc.id}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-primary"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          onClick={() => handleDownloadDoc(doc.id, doc.name)}
                          className="text-muted-foreground hover:text-primary"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Comments
                {update.comments && update.comments.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    ({update.comments.length})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {update.comments && update.comments.length > 0 ? (
                <div className="mb-6 space-y-4">
                  {update.comments.map((comment) => (
                    <div key={comment.id} className="rounded-md border bg-muted/30 px-4 py-3">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {comment.author.name ?? comment.author.email}
                        </span>
                        {comment.author.roles.includes("ADMIN") && (
                          <Badge variant="info">{ORG_NAME}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-6 text-sm text-muted-foreground">No comments yet.</p>
              )}

              <form onSubmit={handleAddComment}>
                <Textarea
                  id="newComment"
                  label="Add a Comment"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write your comment..."
                  rows={3}
                />
                <div className="mt-3 flex justify-end">
                  <Button type="submit" size="sm" disabled={postingComment || !newComment.trim()}>
                    {postingComment ? "Posting..." : "Post Comment"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="mt-6">
            <Button variant="ghost" onClick={() => router.push("/updates")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Updates
            </Button>
          </div>
        </>
      )}
    </AppShell>
  );
}
