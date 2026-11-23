import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getLp } from "@/lib/lp-auth";
import { db } from "@/lib/db";
import { LpLoginForm } from "@/components/lp/lp-login-form";
import { EmptyState } from "@/components/ui/empty-state";
import { ORG_NAME } from "@/lib/org";
import { V2_EYEBROW, V2_LIST, V2_ROW, V2_SECTION_HEAD } from "@/lib/founder-look";
import { V2_AUTH_TITLE, V2_PAGE_TITLE } from "@/lib/public-look";

export const dynamic = "force-dynamic";

/**
 * The LP entry point AND the library (Part 7, WS18.4) — a Server Component
 * that reads the DB directly (JC5): the read path has no client-side API
 * fetch to forget to public-prefix. No session -> entry screen with the
 * OTP form; a session -> every PUBLISHED report across every fund this LP
 * belongs to, grouped by fund.
 */
export default async function LpPortalPage() {
  const ctx = await getLp();

  if (!ctx) {
    return (
      <div className="mx-auto max-w-2xl v2:max-w-md">
        <p className={`font-mono text-xs uppercase tracking-[0.12em] text-primary ${V2_EYEBROW}`}>LP Portal</p>
        <h1 className={`mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl ${V2_AUTH_TITLE}`}>
          Fund reports for our limited partners.
        </h1>
        <p className="mt-4 max-w-lg text-secondary v2:mt-3 v2:text-body">
          Enter the email address {ORG_NAME} has on file for you and we&rsquo;ll send a one-time access code.
        </p>
        <LpLoginForm />
      </div>
    );
  }

  const reports = await db.fundReport.findMany({
    where: { status: "PUBLISHED", fundId: { in: ctx.fundIds } },
    include: { fund: { select: { id: true, name: true, sortOrder: true } } },
    orderBy: [{ fund: { sortOrder: "asc" } }, { publishedAt: "desc" }],
  });

  const byFund = new Map<string, { fundName: string; reports: typeof reports }>();
  for (const r of reports) {
    const bucket = byFund.get(r.fundId) ?? { fundName: r.fund.name, reports: [] };
    bucket.reports.push(r);
    byFund.set(r.fundId, bucket);
  }

  return (
    <div className="mx-auto max-w-2xl v2:max-w-[720px]">
      <p className={`font-mono text-xs uppercase tracking-[0.12em] text-primary ${V2_EYEBROW}`}>LP Portal</p>
      <h1 className={`mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl ${V2_PAGE_TITLE} v2:mt-1`}>Your fund reports.</h1>

      {reports.length === 0 ? (
        <EmptyState
          eyebrow="Fund reports"
          className="mt-10"
          icon={<BookOpen className="h-8 w-8" />}
          title="No reports yet."
          description={`${ORG_NAME} hasn't published any reports for your funds yet — check back soon.`}
        />
      ) : (
        <div className="mt-10 space-y-10 v2:mt-8">
          {[...byFund.entries()].map(([fundId, bucket]) => (
            <section key={fundId}>
              <h2 className={`border-b border-border pb-2 font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground ${V2_SECTION_HEAD} v2:border-b-0 v2:pb-0`}>
                {bucket.fundName}
              </h2>
              <ul className={`mt-3 divide-y divide-row-divider overflow-hidden rounded-md bg-card shadow-soft ${V2_LIST}`}>
                {bucket.reports.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/lp/reports/${r.id}`}
                      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-4 transition-colors hover:bg-row-hover ${V2_ROW}`}
                    >
                      <span className="v2:min-w-0">
                        <span className="font-display text-lg tracking-tight v2:font-sans v2:text-row v2:font-medium v2:tracking-normal">{r.title}</span>
                        {r.periodLabel && <span className="ml-2 text-sm text-muted-foreground v2:text-row">{r.periodLabel}</span>}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground v2:font-sans v2:text-meta v2:tabular-nums">
                        {r.publishedAt
                          ? new Date(r.publishedAt).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })
                          : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
