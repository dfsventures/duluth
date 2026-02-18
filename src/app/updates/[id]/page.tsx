"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Send,
  Download,
  FileText,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Paperclip,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatPeriod } from "@/lib/utils";

interface UpdateDetail {
  id: string;
  title: string;
  period: string;
  status: "DRAFT" | "SENT";
  body: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  }[];
  comments?: {
    id: string;
    body: string;
    createdAt: string;
    author: {
      id: string;
      name: string | null;
      email: string;
      role: string;
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
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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
      setUpdate(data.data ?? data);
    } catch {
      setMessage({ type: "error", text: "Failed to load update." });
    } finally {
      setLoading(false);
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
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to send update");
      }

      setMessage({ type: "success", text: "Update sent to Molly." });
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
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to add comment");
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

  if (!update) {
    return (
      <AppShell>
        <PageHeader title="Update Not Found" />
        <p className="text-sm text-muted-foreground">
          This update could not be found or you don&apos;t have access.
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => router.push("/updates/new")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Updates
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title={update.title}
        description={`${formatPeriod(update.period)} \u00B7 Created ${formatDate(update.createdAt)}`}
        action={
          <div className="flex items-center gap-3">
            <Badge
              variant={update.status === "SENT" ? "success" : "warning"}
            >
              {update.status === "SENT" ? "Sent" : "Draft"}
            </Badge>
            <Link href={`/updates/${updateId}/download`}>
              <Button variant="secondary" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            </Link>
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
          {message.text}
        </div>
      )}

      {/* Send to Molly if draft */}
      {update.status === "DRAFT" && (
        <div className="mb-6 flex items-center justify-between rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3">
          <p className="text-sm text-yellow-800">
            This update is still a draft. Send it when ready.
          </p>
          <Button size="sm" disabled={sending} onClick={handleSendToDFS}>
            <Send className="mr-2 h-4 w-4" />
            {sending ? "Sending..." : "Send to Molly"}
          </Button>
        </div>
      )}

      {/* Update body */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Update Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
            {update.body || (
              <span className="text-muted-foreground italic">
                No content provided.
              </span>
            )}
          </div>
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
                    <td className="py-2 font-medium">
                      {mv.metricDefinition.name}
                    </td>
                    <td className="py-2">
                      {mv.value}
                      {mv.metricDefinition.unit
                        ? ` ${mv.metricDefinition.unit}`
                        : ""}
                    </td>
                    <td className="py-2">{formatDate(mv.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Attached documents */}
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
                <li
                  key={doc.id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.name}</p>
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
          {/* Comment list */}
          {update.comments && update.comments.length > 0 ? (
            <div className="mb-6 space-y-4">
              {update.comments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-md border bg-muted/30 px-4 py-3"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {comment.author.name ?? comment.author.email}
                    </span>
                    {comment.author.role === "ADMIN" && (
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
            <p className="mb-6 text-sm text-muted-foreground">
              No comments yet.
            </p>
          )}

          {/* Add comment form */}
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
              <Button
                type="submit"
                size="sm"
                disabled={postingComment || !newComment.trim()}
              >
                {postingComment ? "Posting..." : "Post Comment"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Back link */}
      <div className="mt-6">
        <Button
          variant="ghost"
          onClick={() => router.push("/updates/new")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Updates
        </Button>
      </div>
    </AppShell>
  );
}
