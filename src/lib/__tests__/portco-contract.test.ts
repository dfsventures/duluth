import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import * as C from "@/lib/marge-tools/portco-contract";

// Part 45 (WS150). The contract module is copied verbatim into Marge's tests, so it must stay
// self-contained, default-free (except dryRun), and say the same sentences it was approved with.

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("portco-contract.ts is self-contained", () => {
  it("imports only zod", () => {
    const imports = [...src("src/lib/marge-tools/portco-contract.ts").matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports).toEqual(["zod"]);
    expect(src("src/lib/marge-tools/portco-contract.ts")).not.toMatch(/require\(|await import\(/);
  });
  it("has no zod default except dryRun", () => {
    const code = src("src/lib/marge-tools/portco-contract.ts");
    expect([...code.matchAll(/\.default\(([^)]*)\)/g)].map((m) => m[1])).toEqual(["true", "true", "true"]);
    expect(code.match(/\.default\(/g)!.length).toBe(3); // company_create, update_create, metric_value_set
  });
});

describe("input schemas", () => {
  it("strip unknown keys and default dryRun to true", () => {
    const r = C.companyCreateInput.parse({ name: "X", idempotencyKey: "abcdefgh", evil: 1 });
    expect(r).toEqual({ name: "X", idempotencyKey: "abcdefgh", dryRun: true });
    expect(C.metricValueSetInput.parse({ companyId: "c", name: "MRR", value: 1, date: "2025-09-30", extra: 1 })).toEqual({ companyId: "c", name: "MRR", value: 1, date: "2025-09-30", dryRun: true });
  });
  it("read tools have no defaults at all", () => {
    expect(C.updatesListInput.parse({ company: "x" })).toEqual({ company: "x" });
    expect(C.metricsListInput.parse({ company: "x" })).toEqual({ company: "x" });
    expect(C.companyMatchInput.parse({ names: ["x"] })).toEqual({ names: ["x"] });
  });
  it("hold only generous outer caps (the validators own the sentences)", () => {
    expect(C.companyCreateInput.safeParse({ name: "x".repeat(501), idempotencyKey: "abcdefgh" }).success).toBe(false);
    expect(C.companyCreateInput.safeParse({ name: "x".repeat(300), idempotencyKey: "abcdefgh" }).success).toBe(true); // 201+ is a validator sentence
  });
});

describe("sentences, reason codes, preview actions", () => {
  it("are the approved wording", () => {
    const S = C.PORTCO_SENTENCES;
    expect(S.companyXor).toBe("Give either a company id or a new company, not both.");
    expect(S.companyExists("X", ["A", "B"])).toBe("Molly already has a company that matches “X”: A, B. Nothing was created.");
    expect(S.ledgerLinked("A")).toBe("That deal-ledger entry is already linked to A. Nothing was created.");
    expect(S.ledgerUnknown).toBe("No deal-ledger entry with that id. Nothing was created.");
    expect(S.badName).toBe("A company name must be 1 to 200 characters of plain text.");
    expect(S.notAccepting).toBe("Molly isn't accepting new companies from Marge right now.");
    expect(S.fuse).toBe("Too many companies were created through Marge today. Try again tomorrow, or add it in Molly.");
    expect(S.badPeriod).toBe("The period must look like 2025-Q3, 2025-H1, 2025-09 or 2025.");
    expect(S.bodyTooLong).toBe("An update is limited to 40,000 characters.");
    expect(S.otherCompanyMetric).toBe("That metric belongs to another company.");
    expect(S.keptFigure).toBe("That figure was entered in Molly, so I left it as it is.");
    expect(S.replaceUnknown).toBe("No figure with that id.");
    expect(S.metricXor).toBe("Give either a metric id or a new metric name, not both.");
    expect(S.tooManyMetrics).toBe("An update can carry at most 20 figures.");
    expect(S.badIdempotency).toBe("idempotencyKey must be 8-100 letters, digits, - or _.");
    expect(S.noCompany("X", ["A"])).toBe("No company called “X”. Closest: A.");
    expect(S.ambiguousCompany("X", ["A", "B"])).toBe("“X” matches 2 companies: A, B. Use the id.");
  });
  it("reason codes, tiers, preview actions and flag names", () => {
    expect(C.MATCH_REASONS).toEqual(["NAME_EXACT", "ALIAS_EXACT", "WEBSITE_DOMAIN", "CONTACT_DOMAIN", "NAME_TOKENS"]);
    expect(C.MATCH_TIER_OF).toEqual({ NAME_EXACT: "STRONG", ALIAS_EXACT: "STRONG", WEBSITE_DOMAIN: "STRONG", CONTACT_DOMAIN: "MEDIUM", NAME_TOKENS: "WEAK" });
    expect(Object.values(C.PORTCO_PREVIEW_ACTIONS)).toEqual(["Add update", "Record metric", "Create company", "Create company and add update"]);
    expect([C.MARGE_PORTCO_FLAG, C.MARGE_COMPANY_CREATE_FLAG, C.MARGE_COMPANY_CREATE_PER_DAY_ENV]).toEqual(["MARGE_PORTCO_TOOLS", "MARGE_COMPANY_CREATE", "MARGE_COMPANY_CREATE_PER_DAY"]);
    expect(C.METRIC_CHECK_ACTIONS).toEqual(["new", "new_metric", "existing", "kept_founder", "replace"]);
    expect(C.LEDGER_REASONS).toEqual(["gone", "linked"]);
  });
});

describe("what must never gain a write or a mail", () => {
  it("name resolution (resolve.ts) never writes", () => {
    const code = src("src/lib/marge-tools/resolve.ts");
    expect(code).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
    expect(code).not.toMatch(/\$transaction|\$executeRaw/);
  });
  it("the founder-update code does not reference email or publishing in any form", () => {
    // WS154: every portco*.ts in marge-tools is covered by listing the directory, so a new file can't slip past.
    const portcoFiles = readdirSync(join(process.cwd(), "src/lib/marge-tools"))
      .filter((n) => /^portco.*\.ts$/.test(n))
      .map((n) => `src/lib/marge-tools/${n}`);
    expect(portcoFiles).toEqual(expect.arrayContaining(["src/lib/marge-tools/portco.ts", "src/lib/marge-tools/portco-contract.ts"]));
    for (const f of ["src/lib/founder-update-actions.ts", "src/lib/founder-update-validate.ts", "src/lib/founder-updates.ts", ...portcoFiles]) {
      const code = src(f);
      expect(code, f).not.toMatch(/@\/lib\/email|@\/lib\/publish-update|sendUpdatePublishedEmail|publishUpdate\(|require\(["']@\/lib\/(email|publish-update)|import\(["']@\/lib\/(email|publish-update)/);
    }
  });
});
