// Part 31, WS79.3 — the shared D3 "also add this founder as a contact"
// handler. Written here (rather than duplicated) so both WS77's
// approvals-page "Link & approve" flow and WS78.1's per-company link
// widget call the exact same client-side logic against the already-
// shipped, already-audited POST /api/admin/portfolio-companies/[id]/contacts
// route (JC-LK-I).
//
// Deliberately non-fatal, always: this is called *after* a link write has
// already succeeded (D3/D4 — the link must never be rolled back because a
// contact add failed), and it treats the route's "already has that
// contact" 400 as success, since the desired end state (this address is a
// contact on this company) is reached either way.
export interface AddPortcoContactResult {
  ok: boolean;
  error?: string;
}

const ALREADY_A_CONTACT = "This company already has that contact.";

export async function addPortcoContact(
  portfolioCompanyId: string,
  email: string,
  name: string | null
): Promise<AddPortcoContactResult> {
  try {
    const res = await fetch(`/api/admin/portfolio-companies/${portfolioCompanyId}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
    });

    if (res.ok) return { ok: true };

    const data = await res.json().catch(() => null);
    if (res.status === 400 && data?.error === ALREADY_A_CONTACT) {
      return { ok: true };
    }
    return { ok: false, error: data?.error ?? "Failed to add contact." };
  } catch {
    return { ok: false, error: "Failed to add contact." };
  }
}
