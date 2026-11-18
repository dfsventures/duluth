"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import type { Update } from "./types";

export function UpdatesTab({ companyId, updates }: { companyId: string; updates: Update[] }) {
  const router = useRouter();
  return (
    <div>
      {/* New look: the tab names the section and the header bar holds Create update, so this row goes. */}
      <div className="mb-4 flex items-center justify-between v2:hidden">
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
        <div className="space-y-2 v2:space-y-0">
          {updates.map((update) => (
            <Link
              key={update.id}
              href={`/updates/${update.id}`}
              className="block"
            >
              {/* New look: a 44px list row (title, then period and date, status at the right) with a hairline, not a card. */}
              <Card className="transition-colors hover:bg-muted/50 v2:rounded-none v2:border-0 v2:border-b v2:bg-transparent v2:shadow-none v2:hover:bg-muted/50">
                <CardContent className="flex items-center justify-between gap-3 py-3 v2:min-h-11 v2:px-3 v2:py-1.5">
                  <div className="min-w-0 flex-1 v2:flex v2:flex-wrap v2:items-baseline v2:gap-x-3">
                    <p className="truncate font-medium v2:max-w-full v2:text-row">{update.title}</p>
                    <p className="text-sm text-muted-foreground v2:min-w-0 v2:text-meta">
                      {update.period} &middot; {formatDate(update.createdAt)}
                      {update.source === "EMAIL_VIA_MARGE" && (
                        <> &middot; From email &middot; added by {update.createdBy?.name ?? "a teammate"} via Marge</>
                      )}
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
  );
}
