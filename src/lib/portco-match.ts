// Part 31, WS75 — pure suggestion engine for linking an operational Company
// to an existing PortfolioCompany. No DB access: callers fetch candidates
// and pass them in (the broadcast-recipients.ts / share-metrics.ts shape).
// It NEVER decides — it ranks. Every link is an explicit admin click
// (Part 31 D2), following sheet-link.ts's "never guesses: anything ambiguous or
// unmatched is flagged, not forced" doctrine.

export type MatchReason =
  | "CONTACT_EMAIL" // signup email == a contact email on this company (STRONG)
  | "NAME_EXACT" // normalized company names are equal            (STRONG)
  | "ALIAS_EXACT" // a Company.aliases entry normalizes equal      (STRONG)
  | "EMAIL_DOMAIN" // non-free email domain shared with a contact   (MEDIUM)
  | "NAME_TOKENS"; // token containment after normalization         (WEAK)

export type MatchTier = "STRONG" | "MEDIUM" | "WEAK";

export interface PortcoCandidate {
  id: string;
  name: string;
  companyId: string | null; // already linked? still returned, flagged
  contactEmails: string[]; // normalized lowercase (Part 30 stores them that way)
}

export interface MatchInput {
  companyName: string;
  aliases?: string[];
  signupEmail?: string | null;
}

export interface PortcoMatch {
  portfolioCompanyId: string;
  portfolioCompanyName: string;
  tier: MatchTier;
  reasons: MatchReason[]; // sorted, deduped — drives the "why" copy in the UI
  alreadyLinked: boolean; // true ⇒ UI shows it but disables Link (F66's 409 case)
}

// Free providers never imply a shared employer. Without this list the
// EMAIL_DOMAIN tier matches every Gmail founder to every Gmail contact.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "yandex.com",
  "zoho.com",
  "mail.com",
]);

const LEGAL_SUFFIXES = new Set([
  "inc",
  "llc",
  "ltd",
  "limited",
  "plc",
  "corp",
  "co",
  "gmbh",
  "bv",
  "pty",
  "sarl",
  "sas",
  "ug",
]);

// The tier ranking used for both sorting matches and picking the reason
// tier a candidate ultimately gets (the strongest reason present wins).
const REASON_TIER: Record<MatchReason, MatchTier> = {
  CONTACT_EMAIL: "STRONG",
  NAME_EXACT: "STRONG",
  ALIAS_EXACT: "STRONG",
  EMAIL_DOMAIN: "MEDIUM",
  NAME_TOKENS: "WEAK",
};

const TIER_RANK: Record<MatchTier, number> = { STRONG: 0, MEDIUM: 1, WEAK: 2 };

// Deterministic ordering for reasons within one candidate — used only to
// keep `reasons` arrays stable/comparable in tests, independent of the
// order signals happen to be evaluated in.
const REASON_ORDER: MatchReason[] = [
  "CONTACT_EMAIL",
  "NAME_EXACT",
  "ALIAS_EXACT",
  "EMAIL_DOMAIN",
  "NAME_TOKENS",
];

export function normalizeCompanyName(raw: string): string {
  const lowered = raw.trim().toLowerCase();
  if (!lowered) return "";
  // Strip punctuation (keep letters, digits, whitespace), collapse
  // whitespace, then drop one trailing legal-suffix token if present.
  const stripped = lowered.replace(/[^\p{L}\p{N}\s]/gu, " ");
  const tokens = stripped.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at === -1 || at === trimmed.length - 1) return null;
  const domain = trimmed.slice(at + 1);
  if (!domain || !domain.includes(".")) return null;
  if (FREE_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

function nameTokens(normalized: string): string[] {
  return normalized.split(" ").filter((t) => t.length >= 3);
}

// After normalization, one name's token set is a subset of the other's
// (order-independent — "Technologies Acme" still contains "acme").
function tokensContain(aTokens: string[], bTokens: string[]): boolean {
  if (aTokens.length === 0 || bTokens.length === 0) return false;
  const bSet = new Set(bTokens);
  return aTokens.every((t) => bSet.has(t));
}

export function matchPortfolioCompanies(
  input: MatchInput,
  candidates: PortcoCandidate[]
): PortcoMatch[] {
  const companyName = input.companyName?.trim() ?? "";
  const aliases = input.aliases ?? [];
  const signupEmail = input.signupEmail?.trim().toLowerCase() || null;

  const normalizedName = companyName ? normalizeCompanyName(companyName) : "";
  const normalizedAliases = aliases
    .map((a) => normalizeCompanyName(a))
    .filter((a) => a.length > 0);
  const signupDomain = emailDomain(signupEmail);
  const companyTokens = nameTokens(normalizedName);
  const aliasTokenSets = normalizedAliases.map((a) => nameTokens(a));

  if (!normalizedName && normalizedAliases.length === 0 && !signupEmail) {
    return [];
  }

  const results: PortcoMatch[] = [];

  for (const candidate of candidates) {
    const reasons = new Set<MatchReason>();
    const candidateNormalized = normalizeCompanyName(candidate.name);
    const candidateTokens = nameTokens(candidateNormalized);

    // STRONG · CONTACT_EMAIL
    if (signupEmail && candidate.contactEmails.includes(signupEmail)) {
      reasons.add("CONTACT_EMAIL");
    }

    // STRONG · NAME_EXACT
    if (normalizedName && candidateNormalized && normalizedName === candidateNormalized) {
      reasons.add("NAME_EXACT");
    }

    // STRONG · ALIAS_EXACT
    if (
      candidateNormalized &&
      normalizedAliases.some((a) => a === candidateNormalized)
    ) {
      reasons.add("ALIAS_EXACT");
    }

    // MEDIUM · EMAIL_DOMAIN (excludes free providers, both directions).
    // A contact email identical to the signup email is CONTACT_EMAIL's
    // evidence, not a second, weaker "shared domain" signal — so it's
    // excluded here to avoid reporting the same fact twice.
    if (signupDomain) {
      const sharesDomain = candidate.contactEmails.some(
        (email) => email !== signupEmail && emailDomain(email) === signupDomain
      );
      if (sharesDomain) reasons.add("EMAIL_DOMAIN");
    }

    // WEAK · NAME_TOKENS — token containment either direction, against
    // the company name or any alias. Skipped where the normalized forms
    // are already exactly equal — that case is NAME_EXACT/ALIAS_EXACT's
    // job, and a trivial self-containment would otherwise double-report
    // the same evidence as a second, weaker reason.
    if (candidateTokens.length > 0) {
      const nameTokenHit =
        normalizedName !== candidateNormalized &&
        (tokensContain(companyTokens, candidateTokens) ||
          tokensContain(candidateTokens, companyTokens));
      const aliasTokenHit = normalizedAliases.some((alias, i) => {
        if (alias === candidateNormalized) return false;
        const aliasTokens = aliasTokenSets[i];
        return (
          tokensContain(aliasTokens, candidateTokens) ||
          tokensContain(candidateTokens, aliasTokens)
        );
      });
      if (nameTokenHit || aliasTokenHit) reasons.add("NAME_TOKENS");
    }

    if (reasons.size === 0) continue;

    const orderedReasons = REASON_ORDER.filter((r) => reasons.has(r));
    const bestTier = orderedReasons.reduce<MatchTier>((best, r) => {
      return TIER_RANK[REASON_TIER[r]] < TIER_RANK[best] ? REASON_TIER[r] : best;
    }, "WEAK");

    results.push({
      portfolioCompanyId: candidate.id,
      portfolioCompanyName: candidate.name,
      tier: bestTier,
      reasons: orderedReasons,
      alreadyLinked: candidate.companyId !== null,
    });
  }

  // Ordering contract: STRONG before MEDIUM before WEAK; within a tier,
  // more reasons first, then portfolioCompanyName ascending. Deterministic.
  results.sort((a, b) => {
    const tierDiff = TIER_RANK[a.tier] - TIER_RANK[b.tier];
    if (tierDiff !== 0) return tierDiff;
    const reasonCountDiff = b.reasons.length - a.reasons.length;
    if (reasonCountDiff !== 0) return reasonCountDiff;
    return a.portfolioCompanyName.localeCompare(b.portfolioCompanyName);
  });

  return results;
}
