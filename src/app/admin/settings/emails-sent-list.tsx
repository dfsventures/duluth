// "Emails sent by Molly": one entry per send*Email function in src/lib/email.ts,
// with the real trigger from its caller. The team inbox is described by role
// (TEAM_EMAIL), never by address (F113). Keep in step with email.ts.
const EMAILS: { name: string; who: string; when: string }[] = [
  { name: "Access approved", who: "the founder", when: "when an admin approves their request, or resends the link; includes the set-password link. Also re-sent if an unfinished signup requests access again or asks for a new link." },
  { name: "Access declined", who: "the founder", when: "when an admin declines their access request." },
  { name: "New application", who: "the team inbox", when: "when a founder applies for access." },
  { name: "Update published", who: "the team inbox", when: "when a founder publishes an update, including scheduled publishes (metrics and full body included)." },
  { name: "Update reminder", who: "the company's founders", when: "from the daily reminder job when a company has gone past its reminder window, or when an admin clicks Remind on the company." },
  { name: "Team invite", who: "the invitee", when: "when a company owner or admin invites someone who has no password set yet; includes a set-password link." },
  { name: "Added to a company", who: "the existing user", when: "when a company owner or admin adds someone who already has an active account to the company." },
  { name: "Due diligence invite", who: "the founder", when: "when an admin creates a company with due diligence enabled; includes the set-password link and the document list." },
  { name: "Due diligence complete (founder)", who: "the founder", when: "once, when they submit their due diligence." },
  { name: "Due diligence complete (team)", who: "the team inbox", when: "once, when a founder submits their due diligence." },
  { name: "Comment notification", who: "founders of the company (when an admin comments) or all other admins (when a founder comments)", when: "when a comment is posted on an update." },
  { name: "Weekly digest", who: "admins with digest turned on, plus the extra recipients below", when: "when an admin sends a weekly digest." },
  { name: "Draft digest ready", who: "the admin who recorded the call", when: "when Molly drafts a digest from a Granola call (not sent to anyone else)." },
  { name: "LP access code", who: "the LP", when: "when an LP requests a sign-in code on the fund report portal, if their address is on file." },
  { name: "LP report published", who: "every email address on each LP in the fund", when: "when an admin publishes a fund report." },
  { name: "Portfolio broadcast", who: "contacts at the targeted portfolio companies (one email per address)", when: "when an admin publishes a broadcast, or retries failed recipients." },
  { name: "Broadcast team copy", who: "the inbox in BROADCAST_COPY_EMAIL (optional; off when unset)", when: "once per broadcast, on the first send only (not on retries), marked \"[Copy]\" with the recipient count." },
  { name: "Broadcast test", who: "the admin who clicks it", when: "when an admin sends themselves a test of a draft broadcast." },
  { name: "Test email", who: "the admin who clicks it", when: "when an admin uses Send Test Email below." },
];

export const EMAILS_SENT_COUNT = EMAILS.length;

export function EmailsSentList() {
  return (
    <details className="group mt-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>&rsaquo;</span>
        Which emails does Molly send? ({EMAILS.length})
      </summary>
      <div className="mt-3 border-l border-border pl-4 text-xs text-muted-foreground">
        <p className="mb-2">
          The team inbox is set by the <span className="font-mono text-foreground">TEAM_EMAIL</span> environment variable.
        </p>
        <ul className="space-y-1.5">
          {EMAILS.map((e) => (
            <li key={e.name}>
              <span className="font-medium text-foreground">{e.name}</span> &mdash; to {e.who} {e.when}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
