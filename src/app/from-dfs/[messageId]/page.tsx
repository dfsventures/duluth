"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Megaphone } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, StatusItems } from "@/components/layout/page-header";
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

  // New look (page types v1, Detail): the shared header (back line, title, the date as the status line)
  // on the 720 column. Decided by CSS: the old link and heading are hidden under the new look and the
  // header is drawn only under it, so nothing flashes. The old look is unchanged.
  return (
    <AppShell width="narrow">
      <Link href="/from-dfs" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground v2:hidden">
        <ArrowLeft className="h-4 w-4" /> All messages
      </Link>
      {!message ? (
        <EmptyState
          icon={<Megaphone className="h-8 w-8" />}
          title="Message not found"
          description={`Messages from the ${ORG_NAME} team will appear here.`}
        />
      ) : (
        <>
        <PageHeader
          newLookOnly
          type="detail"
          back={{ href: "/from-dfs", label: `From ${ORG_NAME}` }}
          title={message.subject}
          status={<StatusItems items={[`From ${ORG_NAME}`, message.publishedAt ? formatDate(message.publishedAt) : null]} />}
        />
        <article className="mx-auto max-w-2xl v2:mx-0 v2:max-w-none">
          <p className="font-mono text-label font-semibold uppercase tracking-label text-muted-foreground v2:hidden">
            From {ORG_NAME}
            {message.publishedAt ? ` · ${formatDate(message.publishedAt)}` : ""}
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground v2:hidden">{message.subject}</h1>
          <div
            className="prose prose-sm mt-6 max-w-none leading-relaxed v2:mt-0"
            dangerouslySetInnerHTML={{ __html: message.body }}
          />
        </article>
        </>
      )}
    </AppShell>
  );
}
