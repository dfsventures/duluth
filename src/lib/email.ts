import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM || "DFS Lab <noreply@dfslab.net>";
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function sendApprovalEmail(email: string, token: string) {
  const link = `${BASE_URL}/set-password?token=${token}`;

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Your DFS Lab account has been approved",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1A1A2E;">Welcome to DFS Lab</h2>
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
    subject: "DFS Lab account request update",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1A1A2E;">DFS Lab</h2>
        <p>Thank you for your interest. Unfortunately, your account request was not approved at this time.</p>
        <p>If you believe this is an error, please contact us at <a href="mailto:support@dfslab.net">support@dfslab.net</a>.</p>
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
