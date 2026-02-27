"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Bot,
  Send,
  User,
  AlertCircle,
  Loader2,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

interface Source {
  type: "update" | "document";
  id: string;
  title: string;
  url: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

export default function AdminChatPage() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          // Pass only previous messages as history — chatWithAI appends the current message itself
          history: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to get response");
      }

      const data = await res.json();
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.response ?? "",
        sources: data.sources ?? [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function renderMessageContent(content: string) {
    // Simple markdown-like rendering: bold, italic, code blocks, line breaks
    const lines = content.split("\n");
    return lines.map((line, i) => {
      // Code block (inline)
      let processed = line.replace(
        /`([^`]+)`/g,
        '<code class="rounded bg-muted px-1 py-0.5 text-xs font-mono">$1</code>'
      );
      // Bold
      processed = processed.replace(
        /\*\*([^*]+)\*\*/g,
        "<strong>$1</strong>"
      );
      // Italic
      processed = processed.replace(
        /\*([^*]+)\*/g,
        "<em>$1</em>"
      );

      if (processed.startsWith("- ") || processed.startsWith("* ")) {
        return (
          <li
            key={i}
            className="ml-4 list-disc"
            dangerouslySetInnerHTML={{ __html: processed.substring(2) }}
          />
        );
      }

      if (processed.match(/^\d+\.\s/)) {
        return (
          <li
            key={i}
            className="ml-4 list-decimal"
            dangerouslySetInnerHTML={{
              __html: processed.replace(/^\d+\.\s/, ""),
            }}
          />
        );
      }

      if (processed.startsWith("### ")) {
        return (
          <h4
            key={i}
            className="mt-2 font-semibold"
            dangerouslySetInnerHTML={{ __html: processed.substring(4) }}
          />
        );
      }

      if (processed.startsWith("## ")) {
        return (
          <h3
            key={i}
            className="mt-2 text-base font-semibold"
            dangerouslySetInnerHTML={{ __html: processed.substring(3) }}
          />
        );
      }

      if (processed.trim() === "") {
        return <br key={i} />;
      }

      return (
        <p
          key={i}
          dangerouslySetInnerHTML={{ __html: processed }}
        />
      );
    });
  }

  return (
    <AppShell>
      <PageHeader
        title="AI Assistant"
        description="Ask questions about your portfolio companies, updates, and metrics."
      />

      <div className="flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto rounded-lg border bg-background p-4">
          {messages.length === 0 && !loading ? (
            <EmptyState
              icon={<Bot className="h-10 w-10" />}
              title="Start a conversation"
              description="Ask me anything about your portfolio companies. I can help you find updates, analyze metrics, and surface insights."
              className="h-full"
            />
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-lg px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <div className="text-sm leading-relaxed">
                      {msg.role === "assistant"
                        ? renderMessageContent(msg.content)
                        : msg.content}
                    </div>

                    {/* Source links */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 border-t border-border/50 pt-2">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Sources:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((source, si) => (
                            <Link
                              key={si}
                              href={source.url}
                              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-muted transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {source.title}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}

              {/* Thinking indicator */}
              {loading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-lg bg-muted px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking...
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="mt-4 flex gap-3">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about portfolio companies, metrics, updates..."
              rows={1}
              className="flex min-h-[44px] w-full resize-none rounded-md border border-input bg-background px-3 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading}
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="h-[44px] px-4"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
