// Part 45 (WS153). Pure matcher: which companies with no founder yet does a
// pending signup's company look like? Used by GET /api/admin/approvals/[id]/matches.
import { emailDomain, nameTokens, normalizeCompanyName, tokensContain } from "@/lib/portco-match";
import { websiteHost } from "@/lib/founder-updates";

export type UnclaimedReason = "NAME_EXACT" | "ALIAS_EXACT" | "NAME_TOKENS" | "WEBSITE_DOMAIN";

export interface UnclaimedCandidate {
  id: string;
  name: string;
  aliases: string[];
  website: string | null;
}

export interface UnclaimedMatch {
  id: string;
  name: string;
  reasons: UnclaimedReason[];
}

const ORDER: UnclaimedReason[] = ["NAME_EXACT", "ALIAS_EXACT", "WEBSITE_DOMAIN", "NAME_TOKENS"];

export function matchUnclaimedCompanies(
  signup: { companyName: string; aliases: string[]; email: string },
  candidates: UnclaimedCandidate[]
): UnclaimedMatch[] {
  const names = [signup.companyName, ...signup.aliases].map(normalizeCompanyName).filter(Boolean);
  const nameSet = new Set(names);
  const signupDomain = emailDomain(signup.email); // null for free-mail providers
  const out: UnclaimedMatch[] = [];

  for (const c of candidates) {
    const reasons = new Set<UnclaimedReason>();
    const cName = normalizeCompanyName(c.name);
    const cAliases = c.aliases.map(normalizeCompanyName).filter(Boolean);
    if (cName && nameSet.has(cName)) reasons.add("NAME_EXACT");
    if (cAliases.some((a) => nameSet.has(a))) reasons.add("ALIAS_EXACT");
    if (signupDomain && websiteHost(c.website) === signupDomain) reasons.add("WEBSITE_DOMAIN");
    if (!reasons.has("NAME_EXACT") && !reasons.has("ALIAS_EXACT")) {
      const theirs = [cName, ...cAliases].map(nameTokens);
      const similar = names.some((n) => {
        const mine = nameTokens(n);
        return theirs.some((t) => tokensContain(mine, t) || tokensContain(t, mine));
      });
      if (similar) reasons.add("NAME_TOKENS");
    }
    if (reasons.size > 0) {
      out.push({ id: c.id, name: c.name, reasons: ORDER.filter((r) => reasons.has(r)) });
    }
  }
  return out.sort((a, b) => ORDER.indexOf(a.reasons[0]) - ORDER.indexOf(b.reasons[0]) || a.name.localeCompare(b.name));
}
