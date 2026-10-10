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
  );
}
