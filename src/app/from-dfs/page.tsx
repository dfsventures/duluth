"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/context/company-context";
import { formatDate } from "@/lib/utils";
import { ORG_NAME } from "@/lib/org";

interface Message {
  id: string;
  subject: string;
  publishedAt: string | null;
}

export default function FromDfsPage() {
  const { selectedCompany, loading: companyLoading } = useCompany();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const companyId = selectedCompany?.id;

  useEffect(() => {
    if (companyLoading) return;
    async function load() {
      try {
        if (!companyId) return;
        const res = await fetch(`/api/companies/${companyId}/dfs-messages`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.data ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [companyLoading, companyId]);

  if (loading || companyLoading) {
    return (
      <AppShell>
        <PageSkeleton />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title={`From ${ORG_NAME}`} description={`Messages the ${ORG_NAME} team has sent to your company.`} />
      {messages.length === 0 ? (
        <EmptyState
          eyebrow={`From ${ORG_NAME}`}
          icon={<Megaphone className="h-8 w-8" />}
          title="No messages yet"
          description={`Messages from the ${ORG_NAME} team will appear here.`}
        />
      ) : (
        <ul className="divide-y divide-row-divider overflow-hidden rounded-md border border-edge bg-card shadow-soft">
          {messages.map((m) => (
            <li key={m.id}>
              <Link
                href={`/from-dfs/${m.id}`}
                className="flex min-h-[56px] items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-row-hover focus-visible:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{m.subject}</span>
                {m.publishedAt && <span className="shrink-0 text-sm text-muted-foreground">{formatDate(m.publishedAt)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
