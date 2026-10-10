"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import DiligenceAnswers from "@/components/admin/diligence-answers";
import { formatDate } from "@/lib/utils";
import type { CompanyDiligenceView } from "./types";

/**
 * Part 34, WS91 (D1) - read-only Diligence tab. Shown only when a
 * CompanyDiligence row exists, at any Company.stage. Fed by the admin-only
 * GET /api/admin/companies/[id] (never GET /api/companies/[id] - D5).
 * Rendered in full, not collapsed: this tab exists specifically to show the text.
 */
export function DiligenceTab({ diligence }: { diligence: CompanyDiligenceView }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {diligence.closedAt
          ? `Promoted ${formatDate(diligence.closedAt)}`
          : diligence.completedAt
            ? `Completed ${formatDate(diligence.completedAt)}`
            : "In diligence"}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Questionnaire</CardTitle>
        </CardHeader>
        <CardContent>
          <DiligenceAnswers diligence={diligence} />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Diligence documents (cap table, bank statements, certificate of incorporation, business license, founder passport) are on the Documents tab — filter by type.
      </p>

      <p className="text-xs text-muted-foreground">Last updated {formatDate(diligence.updatedAt)}</p>
    </div>
  );
}
