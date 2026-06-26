import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

const FROM = process.env.EMAIL_FROM || "Molly <noreply@dfs.vc>";
const TEAM_EMAIL = process.env.TEAM_EMAIL || "joseph@dfs.vc";
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

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

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #F9F9F7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9F9F7; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #E5E5E2;">
          <!-- Blue accent bar -->
          <tr>
            <td style="background: #5B8DC5; height: 4px; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding: 24px 40px 20px; border-bottom: 1px solid #F9F9F7;">
              <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 18px; font-weight: 600; color: #1A1A1A; letter-spacing: -0.01em;">Molly</span>
              <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #888882; margin-left: 8px;">by DFS Lab</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.6; color: #555550;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background: #F9F9F7; border-top: 1px solid #E5E5E2;">
              <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #888882; line-height: 1.5;">
                Molly &mdash; DFS Lab Portfolio Platform<br>
                This is an automated message. Please do not reply directly to this email.
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
  return `<a href="${href}" style="display: inline-block; background: #5B8DC5; color: #ffffff; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; margin: 8px 0;">${label}</a>`;
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

export async function sendApprovalEmail(email: string, token: string) {
  const link = `${BASE_URL}/set-password?token=${token}`;

  const result = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "You're approved — set up your Molly account",
    html: emailWrapper(`
      <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #1A1A1A;">Welcome to Molly!</h1>
      <p style="margin: 0 0 24px; color: #555550;">Your account has been approved by the DFS Lab team. Click the button below to set your password and get started.</p>

      <p>${primaryButton(link, "Set Your Password →")}</p>

      <p style="margin: 24px 0 0; font-size: 13px; color: #888882;">
        This link expires in <strong>48 hours</strong>. If you didn't apply for a Molly account, you can safely ignore this email.
      </p>
      <p style="margin: 4px 0 0; font-size: 13px; color: #888882;">
        Having trouble? Copy and paste this URL into your browser:<br>
        <span style="color: #5B8DC5; word-break: break-all;">${link}</span>
      </p>
    `),
  });
  assertSent(result, "approval");
}

export async function sendRejectionEmail(email: string) {
  const result = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Update on your Molly access request",
    html: emailWrapper(`
      <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #1A1A1A;">Thanks for your interest</h1>
      <p style="margin: 0 0 16px;">We reviewed your request for access to Molly and are unable to approve it at this time.</p>
      <p style="margin: 0 0 24px;">If you think this was a mistake or have questions, please reach out to us directly at <a href="mailto:support@dfs.vc" style="color: #5B8DC5; text-decoration: none; font-weight: 500;">support@dfs.vc</a> and we'll be happy to help.</p>
      <p style="margin: 0; color: #555550;">— The DFS Lab Team</p>
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
      ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 24px 0; border: 1px solid #E5E5E2; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: #F9F9F7;">
              <th style="text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #888882; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #E5E5E2;">Metric</th>
              <th style="text-align: right; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #888882; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #E5E5E2;">Value</th>
            </tr>
          </thead>
          <tbody>
            ${opts.metrics
              .map(
                (m, i) => `<tr style="${i < opts.metrics!.length - 1 ? "border-bottom: 1px solid #F9F9F7;" : ""}">
                <td style="padding: 10px 16px; font-size: 14px; color: #555550;">${m.name}</td>
                <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: #1A1A1A; text-align: right;">
                  ${Number(m.value).toLocaleString()}${m.unit ? `<span style="font-weight: 400; color: #888882; font-size: 12px;"> ${m.unit}</span>` : ""}
                </td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>`
      : "";

  const result = await resend.emails.send({
    from: FROM,
    to: TEAM_EMAIL,
    subject: `[${opts.companyName}] ${opts.title} — ${opts.period}`,
    html: emailWrapper(`
      <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #5B8DC5; text-transform: uppercase; letter-spacing: 0.08em;">Portfolio Update</p>
      <h1 style="margin: 0 0 4px; font-size: 24px; font-weight: 700; color: #1A1A1A;">${opts.companyName}</h1>
      <p style="margin: 0 0 24px; font-size: 15px; color: #888882;">${opts.title} &middot; ${opts.period}</p>

      ${metricsSection}

      <div style="font-size: 15px; line-height: 1.7; color: #555550; border-top: 1px solid #F9F9F7; padding-top: 20px;">
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
    to: TEAM_EMAIL,
    subject: `New access request: ${founderName || founderEmail}`,
    html: emailWrapper(`
      <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #5B8DC5; text-transform: uppercase; letter-spacing: 0.08em;">New Application</p>
      <h1 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: #1A1A1A;">Someone applied for access</h1>

      <table cellpadding="0" cellspacing="0" style="margin: 0 0 24px; width: 100%;">
        <tr>
          <td style="padding: 12px 16px; background: #F9F9F7; border: 1px solid #E5E5E2; border-radius: 8px;">
            <p style="margin: 0 0 4px; font-size: 13px; color: #888882;">Name</p>
            <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1A1A1A;">${founderName || "—"}</p>
          </td>
        </tr>
        <tr><td style="height: 8px;"></td></tr>
        <tr>
          <td style="padding: 12px 16px; background: #F9F9F7; border: 1px solid #E5E5E2; border-radius: 8px;">
            <p style="margin: 0 0 4px; font-size: 13px; color: #888882;">Email</p>
            <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1A1A1A;">${founderEmail}</p>
          </td>
        </tr>
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
    to: opts.toEmail,
    subject: `Time for a ${opts.companyName} update`,
    html: emailWrapper(`
      <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #1A1A1A;">Time for an update!</h1>
      <p style="margin: 0 0 16px;">Hi${opts.founderName ? ` ${opts.founderName.split(" ")[0]}` : ""},</p>
      <p style="margin: 0 0 24px;">It's been <strong>${opts.daysSinceLastUpdate} day${opts.daysSinceLastUpdate === 1 ? "" : "s"}</strong> since <strong>${opts.companyName}</strong> submitted an update. Keeping your portfolio page current helps DFS Lab support you better — and takes less time than you think.</p>

      ${primaryButton(dashboardLink, "Submit an Update →")}

      <p style="margin: 24px 0 0; font-size: 13px; color: #888882;">
        You're receiving this because DFS Lab has configured update reminders for ${opts.companyName}. Reply to this email if you have any questions.
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
    to: opts.toEmail,
    subject: `${opts.companyName} invited you to join Molly`,
    html: emailWrapper(`
      <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #1A1A1A;">You've been invited!</h1>
      <p style="margin: 0 0 24px; color: #555550;">${opts.inviterName ?? "A teammate"} has invited you to join <strong>${opts.companyName}</strong> on Molly. Click the button below to set up your account.</p>

      <p>${primaryButton(link, "Set Up Your Account →")}</p>

      <p style="margin: 24px 0 0; font-size: 13px; color: #888882;">
        This link expires in <strong>48 hours</strong>. If you weren't expecting this invitation, you can safely ignore this email.
      </p>
      <p style="margin: 4px 0 0; font-size: 13px; color: #888882;">
        Having trouble? Copy and paste this URL into your browser:<br>
        <span style="color: #5B8DC5; word-break: break-all;">${link}</span>
      </p>
    `),
  });
  assertSent(result, "team-invite");
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
    to: opts.toEmail,
    subject: `You've been added to ${opts.companyName} on Molly`,
    html: emailWrapper(`
      <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #1A1A1A;">You've been added to a company</h1>
      <p style="margin: 0 0 24px; color: #555550;">${opts.inviterName ?? "A teammate"} added you to <strong>${opts.companyName}</strong> on Molly. Click the button below to set up your access and log in.</p>

      <p>${primaryButton(link, "Set Up Access →")}</p>

      <p style="margin: 24px 0 0; font-size: 13px; color: #888882;">
        This link expires in <strong>48 hours</strong>. If you weren't expecting this, you can safely ignore this email.
      </p>
      <p style="margin: 4px 0 0; font-size: 13px; color: #888882;">
        Having trouble? Copy and paste this URL into your browser:<br>
        <span style="color: #5B8DC5; word-break: break-all;">${link}</span>
      </p>
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
      <div style="margin-bottom: 28px;">
        <h2 style="margin: 0 0 10px; font-size: 16px; font-weight: 700; color: #1A1A1A; border-bottom: 2px solid #5B8DC5; padding-bottom: 6px;">${s.heading}</h2>
        <div style="font-size: 14px; line-height: 1.7; color: #555550;">${s.content}</div>
      </div>`
    )
    .join("");

  const todosHtml =
    opts.todos.length > 0
      ? `<div style="margin-top: 28px;">
          <h2 style="margin: 0 0 10px; font-size: 16px; font-weight: 700; color: #1A1A1A; border-bottom: 2px solid #5B8DC5; padding-bottom: 6px;">This Week's Todos</h2>
          <ul style="margin: 0; padding: 0; list-style: none;">
            ${opts.todos
              .map(
                (t) => `
              <li style="display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid #F9F9F7; font-size: 14px; color: ${t.completed ? "#888882" : "#555550"};">
                <span style="flex-shrink: 0; margin-top: 2px; width: 16px; height: 16px; border: 2px solid ${t.completed ? "#5B8DC5" : "#E5E5E2"}; border-radius: 4px; background: ${t.completed ? "#5B8DC5" : "transparent"}; display: inline-block; text-align: center; line-height: 12px; color: #fff; font-size: 10px;">${t.completed ? "✓" : ""}</span>
                <span style="${t.completed ? "text-decoration: line-through;" : ""}">${t.text}${t.assigneeName ? `<span style="margin-left: 8px; font-size: 12px; color: #888882;">— ${t.assigneeName}</span>` : ""}</span>
              </li>`
              )
              .join("")}
          </ul>
        </div>`
      : "";

  const result = await resend.emails.send({
    from: FROM,
    to: opts.toEmail,
    subject: opts.title,
    html: emailWrapper(`
      <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #5B8DC5; text-transform: uppercase; letter-spacing: 0.08em;">Weekly Digest</p>
      <h1 style="margin: 0 0 24px; font-size: 24px; font-weight: 700; color: #1A1A1A;">${opts.title}</h1>

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
    to: opts.toEmail,
    subject: `New comment on ${opts.companyName}: ${opts.updateTitle}`,
    html: emailWrapper(`
      <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #1A1A1A;">New comment on your update</h1>
      <p style="margin: 0 0 24px; color: #555550;"><strong>${opts.commenterName ?? "Someone"}</strong> commented on <strong>${opts.updateTitle}</strong> (${opts.updatePeriod}) for <strong>${opts.companyName}</strong>.</p>

      <div style="background: #F9F9F7; border-left: 4px solid #5B8DC5; padding: 14px 18px; border-radius: 0 8px 8px 0; margin: 0 0 28px;">
        <p style="margin: 0; font-size: 14px; line-height: 1.65; color: #555550;">${snippet}</p>
      </div>

      ${primaryButton(opts.ctaLink, opts.ctaLabel)}

      <p style="margin: 24px 0 0; font-size: 13px; color: #888882;">
        You're receiving this because you're a member of <strong>${opts.companyName}</strong> on Molly.
      </p>
    `),
  });
  assertSent(result, "comment-notification");
}

export async function sendTestEmail(toEmail: string) {
  const result = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: "Molly email configuration test",
    html: emailWrapper(`
      <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #1A1A1A;">Email is working!</h1>
      <p style="margin: 0 0 16px;">If you're reading this, your Molly email configuration is set up correctly. Transactional emails (approvals, rejections, and update notifications) will be delivered successfully.</p>
      <p style="margin: 0; color: #888882; font-size: 13px;">Sent from: <strong>${FROM}</strong></p>
    `),
  });
  assertSent(result, "test");
}
