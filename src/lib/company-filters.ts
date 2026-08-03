import type { Prisma } from "@prisma/client";

/**
 * The "is this a real, decision-visible company" filter — excludes
 * companies whose founder is still awaiting an ordinary signup decision
 * (PENDING, no token) AND companies still in due-diligence intake
 * (Part 16, Q53). Was duplicated inline in three places; extracted here
 * so admin/companies, admin/dashboard, and cron/alerts stay in sync.
 */
export const approvedCompanyFilter: Prisma.CompanyWhereInput = {
  AND: [
    { NOT: { createdBy: { status: "PENDING", approvalToken: null } } },
    { NOT: { stage: "DILIGENCE" } },
  ],
};
