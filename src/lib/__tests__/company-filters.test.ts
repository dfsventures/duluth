import { describe, it, expect } from "vitest";
import { approvedCompanyFilter } from "@/lib/company-filters";

describe("approvedCompanyFilter", () => {
  it("excludes PENDING-founder companies with no approval token", () => {
    expect(approvedCompanyFilter).toEqual({
      AND: [
        { NOT: { createdBy: { status: "PENDING", approvalToken: null } } },
        { NOT: { stage: "DILIGENCE" } },
      ],
    });
  });

  it("is a plain Prisma where-input object, safe to reuse across call sites", () => {
    // Structural shape check: two AND-ed NOT conditions, nothing else.
    expect(Object.keys(approvedCompanyFilter)).toEqual(["AND"]);
    expect(approvedCompanyFilter.AND).toHaveLength(2);
  });
});
