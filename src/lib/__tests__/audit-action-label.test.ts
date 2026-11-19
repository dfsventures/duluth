import { describe, it, expect } from "vitest";
import { actionLabel } from "@/app/admin/audit/audit-table";

describe("audit actionLabel (new look)", () => {
  it("keeps the sentence-case fallback", () => {
    expect(actionLabel("FUND_UPDATED")).toBe("Fund updated");
    expect(actionLabel("SIGN_IN_FAILED")).toBe("Sign-in failed");
  });

  it("restores the LP acronym", () => {
    expect(actionLabel("LP_CREATED")).toBe("LP created");
    expect(actionLabel("LP_EMAIL_PRIMARY_CHANGED")).toBe("LP email primary changed");
  });

  it("uses the words the screens use", () => {
    expect(actionLabel("MEMO_DECISION_CHANGED")).toBe("Memo stage changed");
    expect(actionLabel("MEMO_STATUS_CHANGED")).toBe("Memo status changed");
    expect(actionLabel("BROADCAST_PUBLISHED")).toBe("Broadcast sent");
    expect(actionLabel("MARK_CREATED")).toBe("Valuation added");
    expect(actionLabel("COMPANY_DILIGENCE_PROMOTED")).toBe("Company moved out of diligence");
    expect(actionLabel("PORTCO_CONTACTS_IMPORTED")).toBe("Contacts imported");
  });
});
