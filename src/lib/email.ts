import { Resend } from "resend";
import { ORG_NAME } from "@/lib/org";
import { SETUP_TOKEN_TTL_DAYS } from "@/lib/setup-token";

const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

export const FROM = process.env.EMAIL_FROM || `Molly from ${ORG_NAME} <noreply@dfs.vc>`;
const TEAM_EMAIL = process.env.TEAM_EMAIL || "joseph@dfs.vc";
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@dfs.vc";
const EMAIL_LOGO_PATH = process.env.EMAIL_LOGO_PATH || "/brand/dfs-logo-primary.png";

// ---------------------------------------------------------------------------
// DFS brand tokens (see ~/.claude/skills/dfs-brand-style)
// ---------------------------------------------------------------------------

const C = {
  paper: "#EBE8DE", // canvas
  bone: "#D8D6CB", // secondary surface / dividers
  cocoa: "#C9B08A", // hairlines
  obsidian: "#14140F", // primary text
  tide: "#56544B", // secondary text
  muted: "#8A887E", // tertiary / meta text
  sky: "#5B8DC5", // single accent
  laterite: "#A65A3E", // rejection / risk accent
  white: "#FFFFFF",
};

const FONT_DISPLAY = "'Space Grotesk', 'Segoe UI', Helvetica, Arial, sans-serif";
const FONT_BODY = "'IBM Plex Sans', Calibri, Helvetica, Arial, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Courier New', monospace";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Throws if Resend returned an error, so callers surface the real reason. */
function assertSent(result: { data: unknown; error: unknown }, context: string) {
  if (result.error) {
    console.error(`Resend error [${context}]:`, result.error);
    throw new Error(`Email delivery failed (${context}): ${JSON.stringify(result.error)}`);
  }
}

/** Escapes plain-text values before interpolation into email HTML. Mirrors src/lib/pdf.ts. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Small-caps mono eyebrow label — DFS's section-number pattern, minus the number. */
function eyebrow(label: string, color: string = C.sky): string {
  return `<p style="margin: 0 0 6px; font-family: ${FONT_MONO}; font-size: 11px; font-weight: 600; color: ${color}; text-transform: uppercase; letter-spacing: 0.1em;">${label}</p>`;
}

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${C.paper};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${C.paper}; padding: 48px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
          <!-- Header -->
          <tr>
            <td style="padding: 0 4px 20px;">
              <img src="${BASE_URL}${EMAIL_LOGO_PATH}" alt="${ORG_NAME}" width="54" height="22" style="display: inline-block; vertical-align: middle; border: 0;" />
              <span style="font-family: ${FONT_BODY}; font-size: 12px; color: ${C.tide}; margin-left: 10px; vertical-align: middle;">Molly &middot; Portfolio Platform</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background: ${C.white}; border: 1px solid ${C.cocoa}; padding: 40px;">
              <div style="font-family: ${FONT_BODY}; font-size: 15px; line-height: 1.65; color: ${C.tide};">
                ${content}
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 4px 0;">
              <p style="margin: 0; font-family: ${FONT_BODY}; font-size: 12px; color: ${C.muted}; line-height: 1.6;">
                ${ORG_NAME} &mdash; Molly Portfolio Platform<br>
                Questions? Just reply to this email &mdash; it reaches a human.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function primaryButton(href: string, label: string): string {
  return `<a href="${href}" style="display: inline-block; background: ${C.sky}; color: #ffffff; padding: 13px 26px; text-decoration: none; font-family: ${FONT_MONO}; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;">${label}</a>`;
}

function heading(text: string): string {
  return `<h1 style="margin: 0 0 12px; font-family: ${FONT_DISPLAY}; font-size: 24px; font-weight: 700; color: ${C.obsidian}; line-height: 1.2;">${text}</h1>`;
}

function subheading(text: string): string {
  return `<h2 style="margin: 28px 0 10px; font-family: ${FONT_DISPLAY}; font-size: 15px; font-weight: 600; color: ${C.obsidian};">${text}</h2>`;
}

function hairline(): string {
  return `<div style="height: 1px; background: ${C.bone}; margin: 24px 0;"></div>`;
}

function fieldRow(label: string, value: string): string {
  return `<tr>
    <td style="padding: 12px 16px; background: ${C.paper}; border: 1px solid ${C.bone};">
      <p style="margin: 0 0 3px; font-family: ${FONT_MONO}; font-size: 10px; color: ${C.muted}; text-transform: uppercase; letter-spacing: 0.06em;">${label}</p>
      <p style="margin: 0; font-size: 15px; font-weight: 600; color: ${C.obsidian};">${value}</p>
    </td>
  </tr>
  <tr><td style="height: 8px;"></td></tr>`;
}

function linkFallback(link: string): string {
  return `<p style="margin: 24px 0 0; font-size: 13px; color: ${C.muted};">
    Having trouble? Copy and paste this URL into your browser:<br>
    <span style="color: ${C.sky}; word-break: break-all;">${link}</span>
  </p>`;
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

export async function sendApprovalEmail(email: string, token: string) {
  const link = `${BASE_URL}/set-password?token=${token}`;

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: email,
    subject: "You're approved — set up your Molly account",
    html: emailWrapper(`
      ${eyebrow("Access Approved")}
      ${heading("Welcome aboard")}
      <p style="margin: 0 0 16px;">Good news &mdash; you're in. We're glad to have you on Molly.</p>
      <p style="margin: 0 0 24px;">Set a password and you're ready to go: share updates, track your metrics, and keep your investors in the loop from one place.</p>

      <p>${primaryButton(link, "Set Your Password →")}</p>

      <p style="margin: 24px 0 0; font-size: 13px; color: ${C.muted};">
        This link expires in <strong>${SETUP_TOKEN_TTL_DAYS} days</strong>. If you didn't apply for a Molly account, you can safely ignore this email.
      </p>
      ${linkFallback(link)}
    `),
  });
  assertSent(result, "approval");
}

export async function sendRejectionEmail(email: string) {
  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: email,
    subject: "Update on your Molly access request",
    html: emailWrapper(`
      ${eyebrow("Access Request", C.laterite)}
      ${heading("Thanks for your interest")}
      <p style="margin: 0 0 16px;">Thank you for applying for access to Molly. We took a careful look, and we're not able to approve your request right now.</p>
      <p style="margin: 0 0 24px;">If you think this was a mistake or have questions, reach out to us directly at <a href="mailto:${SUPPORT_EMAIL}" style="color: ${C.sky}; text-decoration: none; font-weight: 500;">${SUPPORT_EMAIL}</a> and we'll be happy to help.</p>
      <p style="margin: 0; color: ${C.tide};">&mdash; The ${ORG_NAME} Team</p>
    `),
  });
  assertSent(result, "rejection");
}

export async function sendUpdatePublishedEmail(opts: {
  companyName: string;
  companyId: string;
  updateId: string;
  title: string;
  period: string;
  body: string;
  metrics?: { name: string; unit: string | null; value: number }[];
}) {
  const adminLink = `${BASE_URL}/admin/companies/${opts.companyId}`;

  const metricsSection =
    opts.metrics && opts.metrics.length > 0
      ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 24px 0; border: 1px solid ${C.bone};">
          <thead>
            <tr style="background: ${C.bone};">
              <th style="text-align: left; padding: 10px 16px; font-family: ${FONT_MONO}; font-size: 11px; font-weight: 600; color: ${C.obsidian}; text-transform: uppercase; letter-spacing: 0.06em;">Metric</th>
              <th style="text-align: right; padding: 10px 16px; font-family: ${FONT_MONO}; font-size: 11px; font-weight: 600; color: ${C.obsidian}; text-transform: uppercase; letter-spacing: 0.06em;">Value</th>
            </tr>
          </thead>
          <tbody>
            ${opts.metrics
              .map(
                (m, i) => `<tr style="background: ${i % 2 === 0 ? C.white : C.paper};">
                <td style="padding: 10px 16px; font-size: 14px; color: ${C.tide}; border-bottom: 1px solid ${C.bone};">${m.name}</td>
                <td style="padding: 10px 16px; font-family: ${FONT_MONO}; font-size: 14px; font-weight: 600; color: ${C.obsidian}; text-align: right; border-bottom: 1px solid ${C.bone};">
                  ${Number(m.value).toLocaleString()}${m.unit ? `<span style="font-family: ${FONT_BODY}; font-weight: 400; color: ${C.muted}; font-size: 12px;"> ${m.unit}</span>` : ""}
                </td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>`
      : "";

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: TEAM_EMAIL,
    subject: `[${opts.companyName}] ${opts.title} — ${opts.period}`,
    html: emailWrapper(`
      ${eyebrow("Portfolio Update")}
      ${heading(opts.companyName)}
      <p style="margin: 0 0 20px; font-size: 14px; color: ${C.muted};">${opts.title} &middot; ${opts.period}</p>

      ${metricsSection}

      <div style="font-size: 15px; line-height: 1.7; color: ${C.tide};">
        ${opts.body}
      </div>

      <div style="margin-top: 32px;">
        ${primaryButton(adminLink, "View in Dashboard →")}
      </div>
    `),
  });
  assertSent(result, "update-published");
}

export async function sendNewSignupNotification(founderEmail: string, founderName: string | null) {
  const approvalsLink = `${BASE_URL}/admin/approvals`;

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: TEAM_EMAIL,
    subject: `New access request: ${founderName || founderEmail}`,
    html: emailWrapper(`
      ${eyebrow("New Application")}
      ${heading("Someone applied for access")}

      <table cellpadding="0" cellspacing="0" style="margin: 0 0 24px; width: 100%;">
        ${fieldRow("Name", founderName || "—")}
        ${fieldRow("Email", founderEmail)}
      </table>

      ${primaryButton(approvalsLink, "Review Application →")}
    `),
  });
  assertSent(result, "new-signup");
}

export async function sendUpdateReminderEmail(opts: {
  toEmail: string;
  founderName: string | null;
  companyName: string;
  daysSinceLastUpdate: number;
}) {
  const dashboardLink = `${BASE_URL}/dashboard`;

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: opts.toEmail,
    subject: `Time for a ${opts.companyName} update`,
    html: emailWrapper(`
      ${eyebrow("Reminder")}
      ${heading("Time for an update")}
      <p style="margin: 0 0 16px;">Hi${opts.founderName ? ` ${opts.founderName.split(" ")[0]}` : ""},</p>
      <p style="margin: 0 0 24px;">It's been <strong>${opts.daysSinceLastUpdate} day${opts.daysSinceLastUpdate === 1 ? "" : "s"}</strong> since your last <strong>${opts.companyName}</strong> update, and we'd love to hear how things are going. A few honest lines &mdash; wins, blockers, numbers &mdash; is plenty. It genuinely helps us help you.</p>

      ${primaryButton(dashboardLink, "Submit an Update →")}

      <p style="margin: 24px 0 0; font-size: 13px; color: ${C.muted};">
        You're receiving this because ${ORG_NAME} has configured update reminders for ${opts.companyName}. Reply to this email if you have any questions.
      </p>
    `),
  });
  assertSent(result, "update-reminder");
}

export async function sendTeamInviteEmail(opts: {
  toEmail: string;
  inviterName: string | null;
  companyName: string;
  token: string;
}) {
  const link = `${BASE_URL}/set-password?token=${opts.token}`;

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: opts.toEmail,
    subject: `${opts.companyName} invited you to join Molly`,
    html: emailWrapper(`
      ${eyebrow("Team Invite")}
      ${heading("Come join your team")}
      <p style="margin: 0 0 24px;">${opts.inviterName ?? "A teammate"} invited you to join <strong>${opts.companyName}</strong> on Molly &mdash; the platform the team uses to share updates and stay close to ${ORG_NAME}. Set up your account and you're in.</p>

      <p>${primaryButton(link, "Set Up Your Account →")}</p>

      <p style="margin: 24px 0 0; font-size: 13px; color: ${C.muted};">
        This link expires in <strong>${SETUP_TOKEN_TTL_DAYS} days</strong>. If you weren't expecting this invitation, you can safely ignore this email.
      </p>
      ${linkFallback(link)}
    `),
  });
  assertSent(result, "team-invite");
}

export async function sendDiligenceInviteEmail(opts: {
  toEmail: string;
  companyName: string;
  token: string;
}) {
  const link = `${BASE_URL}/set-password?token=${opts.token}`;

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: opts.toEmail,
    subject: `${opts.companyName} — next step: due diligence`,
    html: emailWrapper(`
      ${eyebrow("Due Diligence")}
      ${heading("We're moving forward")}
      <p style="margin: 0 0 16px;">Good news — we'd like to move ahead with an investment in <strong>${opts.companyName}</strong>. The next step is diligence: a handful of documents and a couple of quick questions, all in one place.</p>
      <p style="margin: 0 0 24px;">We've set up ${opts.companyName}'s account on Molly &mdash; the same platform you'll use to share updates with us for as long as we're working together. Set a password and you can get started right away.</p>

      <p>${primaryButton(link, "Get Started →")}</p>

      <p style="margin: 24px 0 0; font-size: 13px; color: ${C.muted};">
        This link expires in <strong>${SETUP_TOKEN_TTL_DAYS} days</strong>. Questions any time — just reply to this email.
      </p>
      ${linkFallback(link)}
    `),
  });
  assertSent(result, "diligence-invite");
}

// Part 18, WS44 (F36, Q61/Q63) — fired once, at the moment
// recomputeDiligenceCompletion flips completedAt from null to non-null.
// The founder's only guaranteed confirmation in this flow: there is no
// Submit button (JC-DD-F), so this email is the one closure signal that
// doesn't depend on the founder ever revisiting the page.
export async function sendDiligenceCompletedFounderEmail(opts: {
  toEmail: string;
  founderName: string | null;
  companyName: string;
}) {
  const link = `${BASE_URL}/diligence`;

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: opts.toEmail,
    subject: `${opts.companyName} — all done!`,
    html: emailWrapper(`
      ${eyebrow("Due Diligence")}
      ${heading("All done!")}
      <p style="margin: 0 0 16px;">Hi${opts.founderName ? ` ${opts.founderName.split(" ")[0]}` : ""},</p>
      <p style="margin: 0 0 24px;">We are reviewing your documents and will be in touch soon. Thanks for getting everything in for <strong>${opts.companyName}</strong> &mdash; your documents and questionnaire are both complete.</p>

      <p>${primaryButton(link, "Review Your Submission →")}</p>

      <p style="margin: 24px 0 0; font-size: 13px; color: ${C.muted};">
        Need to change something? You can still update your answers or replace a document any time before we're done reviewing.
      </p>
    `),
  });
  assertSent(result, "diligence-completed-founder");
}

// Part 18, WS44 (F36, Q64) — TEAM_EMAIL, matching sendNewSignupNotification
// and sendUpdatePublishedEmail's admin-notification pattern exactly.
export async function sendDiligenceCompletedAdminNotification(opts: {
  companyName: string;
  founderName: string | null;
  founderEmail: string;
}) {
  const link = `${BASE_URL}/admin/diligence`;

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: TEAM_EMAIL,
    subject: `Diligence complete: ${opts.companyName}`,
    html: emailWrapper(`
      ${eyebrow("Due Diligence")}
      ${heading("Ready for review")}
      <p style="margin: 0 0 24px;">${opts.founderName || opts.founderEmail} has finished ${opts.companyName}'s diligence checklist &mdash; documents and questionnaire are both in.</p>

      <table cellpadding="0" cellspacing="0" style="margin: 0 0 24px; width: 100%;">
        ${fieldRow("Company", opts.companyName)}
        ${fieldRow("Founder", opts.founderName ? `${opts.founderName} (${opts.founderEmail})` : opts.founderEmail)}
      </table>

      ${primaryButton(link, "Review Diligence →")}
    `),
  });
  assertSent(result, "diligence-completed-admin");
}

export async function sendMemberAddedEmail(opts: {
  toEmail: string;
  inviterName: string | null;
  companyName: string;
  token: string;
}) {
  const link = `${BASE_URL}/set-password?token=${opts.token}`;

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: opts.toEmail,
    subject: `You've been added to ${opts.companyName} on Molly`,
    html: emailWrapper(`
      ${eyebrow("Team Invite")}
      ${heading("You're on the team")}
      <p style="margin: 0 0 24px;">${opts.inviterName ?? "A teammate"} added you to <strong>${opts.companyName}</strong> on Molly. One quick step &mdash; set up your access &mdash; and everything's ready for you.</p>

      <p>${primaryButton(link, "Set Up Access →")}</p>

      <p style="margin: 24px 0 0; font-size: 13px; color: ${C.muted};">
        This link expires in <strong>${SETUP_TOKEN_TTL_DAYS} days</strong>. If you weren't expecting this, you can safely ignore this email.
      </p>
      ${linkFallback(link)}
    `),
  });
  assertSent(result, "member-added");
}

export async function sendWeeklyDigestEmail(opts: {
  toEmail: string;
  title: string;
  sections: { id: string; heading: string; content: string }[];
  todos: { text: string; completed: boolean; assigneeName: string | null }[];
}) {
  const digestLink = `${BASE_URL}/admin/digest`;

  const sectionsHtml = opts.sections
    .filter((s) => s.content?.trim())
    .map(
      (s) => `
      <div style="margin-bottom: 24px;">
        ${subheading(s.heading)}
        <div style="font-size: 14px; line-height: 1.7; color: ${C.tide};">${s.content}</div>
      </div>`
    )
    .join("");

  const todosHtml =
    opts.todos.length > 0
      ? `<div style="margin-top: 8px;">
          ${subheading("This Week's Todos")}
          <ul style="margin: 0; padding: 0; list-style: none;">
            ${opts.todos
              .map(
                (t) => `
              <li style="display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid ${C.bone}; font-size: 14px; color: ${t.completed ? C.muted : C.tide};">
                <span style="flex-shrink: 0; margin-top: 2px; width: 16px; height: 16px; border: 2px solid ${t.completed ? C.sky : C.bone}; background: ${t.completed ? C.sky : "transparent"}; display: inline-block; text-align: center; line-height: 12px; color: #fff; font-size: 10px;">${t.completed ? "✓" : ""}</span>
                <span style="${t.completed ? "text-decoration: line-through;" : ""}">${t.text}${t.assigneeName ? `<span style="margin-left: 8px; font-size: 12px; color: ${C.muted};">— ${t.assigneeName}</span>` : ""}</span>
              </li>`
              )
              .join("")}
          </ul>
        </div>`
      : "";

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: opts.toEmail,
    subject: opts.title,
    html: emailWrapper(`
      ${eyebrow("Weekly Digest")}
      ${heading(opts.title)}
      ${hairline()}

      ${sectionsHtml}
      ${todosHtml}

      <div style="margin-top: 32px;">
        ${primaryButton(digestLink, "View in Molly →")}
      </div>
    `),
  });
  assertSent(result, "weekly-digest");
}

export async function sendCommentNotificationEmail(opts: {
  toEmail: string;
  toName: string | null;
  commenterName: string | null;
  companyName: string;
  updateTitle: string;
  updatePeriod: string;
  commentSnippet: string;
  ctaLink: string;
  ctaLabel: string;
}) {
  const snippet =
    opts.commentSnippet.length > 200
      ? opts.commentSnippet.slice(0, 200) + "…"
      : opts.commentSnippet;

  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: opts.toEmail,
    subject: `New comment on ${opts.companyName}: ${opts.updateTitle}`,
    html: emailWrapper(`
      ${eyebrow("New Comment")}
      ${heading(`Hi${opts.toName ? ` ${opts.toName.split(" ")[0]}` : ""}, you have a reply`)}
      <p style="margin: 0 0 24px;"><strong>${opts.commenterName ?? "Someone"}</strong> left a comment on <strong>${opts.updateTitle}</strong> (${opts.updatePeriod}) for <strong>${opts.companyName}</strong>:</p>

      <div style="border-left: 3px solid ${C.sky}; background: ${C.paper}; padding: 14px 18px; margin: 0 0 28px;">
        <p style="margin: 0; font-size: 14px; line-height: 1.65; color: ${C.tide};">${snippet}</p>
      </div>

      ${primaryButton(opts.ctaLink, opts.ctaLabel)}

      <p style="margin: 24px 0 0; font-size: 13px; color: ${C.muted};">
        You're receiving this because you're a member of <strong>${opts.companyName}</strong> on Molly.
      </p>
    `),
  });
  assertSent(result, "comment-notification");
}

export async function sendLpOtpEmail(email: string, code: string) {
  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: email,
    subject: `Your ${ORG_NAME} access code`,
    html: emailWrapper(`
      ${eyebrow("LP Portal Access")}
      ${heading("Your access code")}
      <p style="margin: 0 0 24px;">Use this code to sign in to the ${ORG_NAME} fund report portal:</p>
      <p style="margin: 0 0 24px; text-align: center;">
        <span style="display: inline-block; padding: 16px 28px; background: ${C.paper}; border: 1px solid ${C.cocoa}; font-family: ${FONT_MONO}; font-size: 32px; font-weight: 600; letter-spacing: 0.15em; color: ${C.obsidian};">${code}</span>
      </p>
      <p style="margin: 0 0 8px; font-size: 13px; color: ${C.muted};">This code expires in 10 minutes.</p>
      <p style="margin: 0; font-size: 13px; color: ${C.muted};">If you didn&rsquo;t request this, you can safely ignore this email.</p>
    `),
  });
  assertSent(result, "lp-otp");
}

export async function sendLpReportPublishedEmail(opts: {
  email: string;
  lpName?: string | null;
  fundName: string;
  reportTitle: string;
  note?: string | null; // WS54: optional per-publish admin note; absent/blank → no paragraph
}) {
  const link = `${BASE_URL}/lp`;
  const firstName = opts.lpName?.trim() ? opts.lpName.trim().split(" ")[0] : null;

  // WS54: plain-text note — escape, then preserve author line breaks. Empty/blank
  // yields no markup at all, so the email is byte-identical to today when omitted.
  const noteTrimmed = opts.note?.trim();
  const noteParagraph = noteTrimmed
    ? `\n      <p style="margin: 0 0 24px;">${escapeHtml(noteTrimmed).replace(/\n/g, "<br>")}</p>`
    : "";

  const result = await resend.emails.send({
    from: FROM,
    replyTo: TEAM_EMAIL,
    to: opts.email,
    subject: `Your ${opts.fundName} report is here`,
    html: emailWrapper(`
      ${eyebrow("Fund Report")}
      ${heading(firstName ? `Hi ${escapeHtml(firstName)},` : "Hello,")}
      <p style="margin: 0 0 24px;">We've just published <strong>${escapeHtml(opts.reportTitle)}</strong>, our latest letter on how the fund is doing, plus a look at the portfolio companies behind the numbers.</p>${noteParagraph}

      <p>${primaryButton(link, "Read the Report →")}</p>

      <p style="margin: 24px 0 0; font-size: 13px; color: ${C.muted};">
        If you have a question, or even a disagreement, just hit reply.
      </p>
      <p style="margin: 16px 0 0; color: ${C.tide};">The ${ORG_NAME} team</p>
    `),
  });
  assertSent(result, "lp-report-published");
}

// Part 30, WS72 — admin broadcast to portfolio-company contacts.
// Person-scoped, never company-scoped (JC-BC-G): one address can be a
// contact at several targeted companies and gets ONE email (D7), so no
// company name may appear in the subject or greeting. `bodyHtml` is
// admin-authored TipTap HTML and is intentionally NOT escaped — the same
// trust boundary sendUpdatePublishedEmail already accepts; every
// plain-text field around it IS escaped (the F47 lesson).
export interface BroadcastMessage {
  email: string;
  recipientName?: string | null;
  subject: string;
  bodyHtml: string;
}

function broadcastHtml(msg: BroadcastMessage): string {
  const firstName = msg.recipientName?.trim() ? msg.recipientName.trim().split(" ")[0] : null;
  return emailWrapper(`
    ${eyebrow("From " + ORG_NAME)}
    ${heading(firstName ? `Hi ${escapeHtml(firstName)},` : "Hello,")}
    <div style="font-size: 15px; line-height: 1.7; color: ${C.tide};">
      ${msg.bodyHtml}
    </div>
    <p style="margin: 32px 0 0; font-size: 13px; color: ${C.muted};">
      You're receiving this because ${ORG_NAME} works with your company. Just hit reply if you'd like to talk.
    </p>
  `);
}

/** One message, one recipient — the "send me a test copy" path (JC-BC-F). */
export async function sendCompanyBroadcastEmail(msg: BroadcastMessage) {
  const result = await resend.emails.send({
    from: FROM,
    replyTo: TEAM_EMAIL,
    to: msg.email,
    subject: msg.subject,
    html: broadcastHtml(msg),
  });
  assertSent(result, "company-broadcast");
}

/**
 * Chunked fan-out (JC-BC-E / F59). Batches of 100 via resend.batch.send
 * with permissive validation, so one bad address fails alone instead of
 * rejecting the whole batch — the F12 lesson, preserved at batch scale.
 * NEVER throws: returns one result per input message, in input order.
 */
export async function sendCompanyBroadcastEmails(
  messages: BroadcastMessage[]
): Promise<{ email: string; ok: boolean; error?: string }[]> {
  const out: { email: string; ok: boolean; error?: string }[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await resend.batch.send(
        chunk.map((m) => ({
          from: FROM,
          replyTo: TEAM_EMAIL,
          to: m.email,
          subject: m.subject,
          html: broadcastHtml(m),
        })),
        { batchValidation: "permissive" }
      );
      if (res.error) {
        // whole-chunk failure (auth, network, quota) — every message in it failed
        for (const m of chunk) out.push({ email: m.email, ok: false, error: String(res.error) });
        continue;
      }
      // Permissive mode reports per-message failures by their index in the
      // submitted chunk; every other index went out.
      const failed = new Map<number, string>(
        ((res.data as { errors?: { index: number; message: string }[] } | null)?.errors ?? []).map((e) => [e.index, e.message])
      );
      chunk.forEach((m, idx) =>
        failed.has(idx)
          ? out.push({ email: m.email, ok: false, error: failed.get(idx) })
          : out.push({ email: m.email, ok: true })
      );
    } catch (err) {
      for (const m of chunk) out.push({ email: m.email, ok: false, error: String(err) });
    }
  }
  return out;
}

export async function sendTestEmail(toEmail: string) {
  const result = await resend.emails.send({
    from: FROM,
    replyTo: SUPPORT_EMAIL,
    to: toEmail,
    subject: "Molly email configuration test",
    html: emailWrapper(`
      ${eyebrow("System Check")}
      ${heading("Email is working")}
      <p style="margin: 0 0 16px;">If you're reading this, your Molly email configuration is set up correctly. Transactional emails (approvals, rejections, and update notifications) will be delivered successfully.</p>
      <p style="margin: 0; color: ${C.muted}; font-size: 13px;">Sent from: <strong>${FROM}</strong></p>
    `),
  });
  assertSent(result, "test");
}
