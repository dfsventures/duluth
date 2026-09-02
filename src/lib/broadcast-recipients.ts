// Part 30, WS71 — the dedup the LP path never needed. F51 found LP
// dedup structurally free (single-fund publish + @@unique([lpId,fundId])
// + globally-unique LpEmail.email). None of those hold here: a broadcast
// is multi-company by design, and contact emails are unique only PER
// COMPANY (JC-BC-B). So dedup is real, and it is dedup by EMAIL ALONE —
// there is no User, no role, and no UserStatus anywhere in this loop (D4).

export interface BroadcastContactRow {
  portfolioCompanyId: string;
  portfolioCompanyName: string;
  contact: { id: string; email: string; name: string | null };
}

export interface BroadcastRecipient {
  contactId: string; // the FIRST contact row that claimed this address
  email: string; // normalized: trimmed + lowercased
  name: string | null; // first non-empty name encountered
  portfolioCompanyIds: string[]; // sorted, deduped
  portfolioCompanyNames: string[]; // sorted, deduped — drives the "reached via" preview column
}

export function resolveBroadcastRecipients(rows: BroadcastContactRow[]): BroadcastRecipient[] {
  interface Accum {
    contactId: string;
    name: string | null;
    companyIds: Set<string>;
    companyNames: Set<string>;
  }

  const byEmail = new Map<string, Accum>();

  for (const row of rows) {
    const email = row.contact.email.trim().toLowerCase();
    if (!email) continue;

    let acc = byEmail.get(email);
    if (!acc) {
      acc = {
        contactId: row.contact.id,
        name: row.contact.name?.trim() ? row.contact.name : null,
        companyIds: new Set(),
        companyNames: new Set(),
      };
      byEmail.set(email, acc);
    } else if (!acc.name && row.contact.name?.trim()) {
      acc.name = row.contact.name;
    }

    acc.companyIds.add(row.portfolioCompanyId);
    acc.companyNames.add(row.portfolioCompanyName);
  }

  return [...byEmail.entries()]
    .map(([email, acc]) => ({
      contactId: acc.contactId,
      email,
      name: acc.name,
      portfolioCompanyIds: [...acc.companyIds].sort(),
      portfolioCompanyNames: [...acc.companyNames].sort(),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}
