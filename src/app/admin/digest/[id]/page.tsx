"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send, CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface DigestSection {
  id: string;
  heading: string;
  content: string;
}

interface DigestTodo {
  id: string;
  text: string;
  completed: boolean;
  assignee: { id: string; name: string | null; email: string } | null;
}

interface Digest {
  id: string;
  title: string;
  weekOf: string;
  sections: DigestSection[];
  sentAt: string | null;
  createdAt: string;
  todos: DigestTodo[];
}

export default function DigestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/digest/${id}`)
      .then((r) => r.json())
      .then(setDigest)
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSend() {
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/digest/${id}/send`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to send");
      }
      const data = await res.json();
      setDigest((d) => d ? { ...d, sentAt: data.sentAt } : d);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  async function toggleTodo(todoId: string, completed: boolean) {
    const res = await fetch(`/api/admin/digest/${id}/todos/${todoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    if (res.ok) {
      setDigest((d) =>
        d
          ? { ...d, todos: d.todos.map((t) => (t.id === todoId ? { ...t, completed } : t)) }
          : d
      );
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

  if (!digest) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">Digest not found</p>
          <Link href="/admin/digest">
            <Button variant="secondary" size="sm" className="mt-4">Back to digests</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const sections = digest.sections as DigestSection[];

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/digest"
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All digests
          </Link>
          <h1 className="text-xl font-bold text-foreground">{digest.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Week of {formatDate(digest.weekOf)}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {digest.sentAt ? (
            <Badge variant="success" className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Sent {formatDate(digest.sentAt)}
            </Badge>
          ) : (
            <Badge variant="warning" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Draft
            </Badge>
          )}
          {!digest.sentAt && (
            <Button onClick={handleSend} disabled={sending} size="sm" className="flex items-center gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending…" : "Send to team"}
            </Button>
          )}
        </div>
      </div>

      {sendError && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {sendError}
        </div>
      )}

      {/* Sections */}
      <div className="space-y-6">
        {sections.filter((s) => s.content?.trim()).map((section) => (
          <Card key={section.id}>
            <CardContent className="pt-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground border-b border-border pb-2">
                {section.heading}
              </h2>
              <div
                className="prose prose-sm max-w-none text-foreground"
                dangerouslySetInnerHTML={{ __html: section.content }}
              />
            </CardContent>
          </Card>
        ))}

        {/* Todos */}
        {digest.todos.length > 0 && (
          <Card>
            <CardContent className="pt-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground border-b border-border pb-2">
                This Week's Todos
              </h2>
              <ul className="space-y-2">
                {digest.todos.map((todo) => (
                  <li
                    key={todo.id}
                    className="flex items-start gap-3 py-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={(e) => toggleTodo(todo.id, e.target.checked)}
                      className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-sm ${todo.completed ? "line-through text-muted-foreground" : "text-foreground"}`}
                      >
                        {todo.text}
                      </span>
                      {todo.assignee && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          — {todo.assignee.name ?? todo.assignee.email}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
