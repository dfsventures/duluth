import { Resend } from "resend";

// Use a placeholder key if not configured — actual sends will fail gracefully
const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

const FROM = process.env.EMAIL_FROM || "Molly <noreply@dfslab.net>";
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function sendApprovalEmail(email: string, token: string) {
  const link = `${BASE_URL}/set-password?token=${token}`;

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Your Molly account has been approved",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1A1A2E;">Welcome to Molly</h2>
        <p>Your account has been approved. Click the link below to set your password and get started.</p>
        <a href="${link}" style="display: inline-block; background: #3BBFA0; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
          Set Your Password
        </a>
        <p style="color: #64748B; font-size: 14px;">This link expires in 48 hours. If you didn't request this, please ignore this email.</p>
      </div>
    `,
  });
}

export async function sendRejectionEmail(email: string) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Molly account request update",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1A1A2E;">Molly</h2>
        <p>Thank you for your interest. Unfortunately, your account request was not approved at this time.</p>
        <p>If you believe this is an error, please contact us at <a href="mailto:support@dfslab.net">support@dfslab.net</a>.</p>
      </div>
    `,
  });
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

  const metricsHtml =
    opts.metrics && opts.metrics.length > 0
      ? `<table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          <thead>
            <tr style="border-bottom: 2px solid #E2E8F0;">
              <th style="text-align: left; padding: 8px 12px; font-size: 12px; color: #64748B; text-transform: uppercase;">Metric</th>
              <th style="text-align: right; padding: 8px 12px; font-size: 12px; color: #64748B; text-transform: uppercase;">Value</th>
            </tr>
          </thead>
          <tbody>
            ${opts.metrics
              .map(
                (m) => `<tr style="border-bottom: 1px solid #F1F5F9;">
                  <td style="padding: 8px 12px; font-size: 14px;">${m.name}</td>
                  <td style="padding: 8px 12px; font-size: 14px; font-weight: 600; text-align: right;">
                    ${Number(m.value).toLocaleString()}${m.unit ? ` ${m.unit}` : ""}
                  </td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>`
      : "";

  await resend.emails.send({
    from: FROM,
    to: "team@dfslab.net",
    subject: `[${opts.companyName}] ${opts.title} — ${opts.period}`,
    html: `
      <div style="font-family: sans-serif; max-width: 680px; margin: 0 auto; color: #1A1A2E;">
        <div style="border-bottom: 3px solid #3BBFA0; padding-bottom: 16px; margin-bottom: 24px;">
          <p style="margin: 0 0 4px; font-size: 12px; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">Portfolio Update</p>
          <h1 style="margin: 0 0 4px; font-size: 22px;">${opts.companyName}</h1>
          <p style="margin: 0; font-size: 15px; color: #475569;">${opts.title} &middot; ${opts.period}</p>
        </div>

        ${metricsHtml}

        <div style="font-size: 15px; line-height: 1.6; color: #334155;">
          ${opts.body}
        </div>

        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #E2E8F0;">
          <a href="${adminLink}" style="display: inline-block; background: #3BBFA0; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
            View in Dashboard
          </a>
        </div>
      </div>
    `,
  });
}

export async function sendNewSignupNotification(founderEmail: string, founderName: string | null) {
  // Notify admins about new sign-up
  await resend.emails.send({
    from: FROM,
    to: "team@dfslab.net",
    subject: `New sign-up request: ${founderName || founderEmail}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1A1A2E;">New Sign-Up Request</h2>
        <p><strong>${founderName || "Unknown"}</strong> (${founderEmail}) has requested an account.</p>
        <a href="${BASE_URL}/admin/approvals" style="display: inline-block; background: #3BBFA0; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
          Review in Dashboard
        </a>
      </div>
    `,
  });
}
