"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Megaphone } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/context/company-context";
import { formatDate } from "@/lib/utils";
import { ORG_NAME } from "@/lib/org";

interface Message {
  id: string;
  subject: string;
  publishedAt: string | null;
  body: string; // sanitized server-side
}

export default function FromDfsMessagePage() {
  const { messageId } = useParams<{ messageId: string }>();
  const { selectedCompany, loading: companyLoading } = useCompany();
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);

  const companyId = selectedCompany?.id;

  useEffect(() => {
    if (companyLoading) return;
    async function load() {
      try {
        if (!companyId) return;
        setMessage(null);
        const res = await fetch(`/api/companies/${companyId}/dfs-messages/${messageId}`);
        if (res.ok) setMessage(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [companyLoading, companyId, messageId]);

  if (loading || companyLoading) {
    return (
      <AppShell>
        <PageSkeleton />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link href="/from-dfs" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All messages
      </Link>
      {!message ? (
        <EmptyState
          icon={<Megaphone className="h-8 w-8" />}
          title="Message not found"
          description={`Messages from the ${ORG_NAME} team will appear here.`}
        />
      ) : (
        <article className="mx-auto max-w-2xl">
          <p className="font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">
            From {ORG_NAME}
            {message.publishedAt ? ` · ${formatDate(message.publishedAt)}` : ""}
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground">{message.subject}</h1>
          <div
            className="prose prose-sm mt-6 max-w-none leading-relaxed"
            dangerouslySetInnerHTML={{ __html: message.body }}
          />
        </article>
      )}
    </AppShell>
  );
}
