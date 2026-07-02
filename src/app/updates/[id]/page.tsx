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
  Save,
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
    s3Key: string;
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

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editPeriod, setEditPeriod] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editMetrics, setEditMetrics] = useState<Record<string, string>>({});
  const [metricDefs, setMetricDefs] = useState<MetricDefinition[]>([]);

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

    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setMessage(null);
  }

  async function handleSaveEdit() {
    if (!update) return;
    if (!editTitle.trim() || !editPeriod.trim()) {
      setMessage({ type: "error", text: "Title and period are required." });
      return;
    }

    setSaving(true);
    setMessage(null);

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

      setEditing(false);
      setMessage({ type: "success", text: "Update saved." });
      await loadUpdate();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save.",
      });
    } finally {
      setSaving(false);
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
      setMessage({ type: "success", text: "Update published. The DFS Lab team has been notified." });
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
        <Button variant="secondary" className="mt-4" onClick={() => router.push("/updates/new")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Updates
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title={editing ? "Edit Update" : update.title}
        description={
          editing
            ? isEditablePublished
              ? `Editing a published update · ${editHoursLeft}h left to make changes`
              : "Make changes to your draft below."
            : `${formatPeriod(update.period)} · Created ${formatDate(update.createdAt)}`
        }
        action={
          <div className="flex items-center gap-3">
            <Badge variant={update.status === "SENT" ? "success" : "warning"}>
              {update.status === "SENT" ? "Published" : "Draft"}
            </Badge>
            {!editing && (
              <>
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
              </>
            )}
          </div>
        }
      />

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

      {/* Publish banner (view mode only) */}
      {!editing && update.status === "DRAFT" && (
        <div className="mb-6 flex items-center justify-between rounded-md border border-ochre/30 bg-ochre/10 px-4 py-3">
          <p className="text-sm text-ochre">
            This update is still a draft. Publish it when ready.
          </p>
          {confirmPublish ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ochre">Publish and notify the DFS Lab team?</span>
              <Button variant="secondary" size="sm" disabled={sending} onClick={() => setConfirmPublish(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={sending} onClick={handleSendToDFS}>
                {sending ? "Publishing..." : "Confirm Publish"}
              </Button>
            </div>
          ) : (
            <Button size="sm" disabled={sending} onClick={() => setConfirmPublish(true)}>
              <Globe className="mr-2 h-4 w-4" />
              Publish
            </Button>
          )}
        </div>
      )}

      {/* ── EDIT MODE ─────────────────────────────────── */}
      {editing ? (
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="edit-period"
                  label="Period"
                  value={editPeriod}
                  onChange={(e) => setEditPeriod(e.target.value)}
                  placeholder="e.g. 2025-Q1"
                />
                <Input
                  id="edit-title"
                  label="Title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Q1 2025 Update"
                />
              </div>

              <div className="space-y-1">
                <label className="label">Update Body</label>
                <RichEditor
                  value={editBody}
                  onChange={setEditBody}
                  placeholder="Share your progress, challenges, and plans..."
                  companyId={update.companyId}
                />
              </div>

              {metricDefs.length > 0 && (
                <div>
                  <p className="mb-3 text-sm font-medium">Metric Values</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {metricDefs.map((m) => (
                      <Input
                        key={m.id}
                        id={`edit-metric-${m.id}`}
                        label={`${m.name}${m.unit ? ` (${m.unit})` : ""}`}
                        type="number"
                        step="any"
                        value={editMetrics[m.id] ?? ""}
                        onChange={(e) =>
                          setEditMetrics((prev) => ({ ...prev, [m.id]: e.target.value }))
                        }
                        placeholder="Enter value"
                      />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={cancelEdit} disabled={saving}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
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
                  className="prose prose-sm max-w-none text-sm leading-relaxed dark:prose-invert"
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
                          <Badge variant="info">Molly</Badge>
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
            <Button variant="ghost" onClick={() => router.push("/updates/new")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Updates
            </Button>
          </div>
        </>
      )}
    </AppShell>
  );
}
