import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { EmailSettingsPanel } from "./email-settings-panel";
import { DigestRecipientsPanel } from "./digest-recipients-panel";
import { StorageSettingsPanel } from "./storage-settings-panel";
import { OrphanedDocumentsPanel } from "./orphaned-documents-panel";
import { FROM as emailFrom, BASE_URL } from "@/lib/email";
import { SlackTestPanel } from "./slack-test-panel";
import { SettingsTabs } from "./settings-tabs";
import { normalizeSettingsTab } from "./settings-tabs-util";
import { SettingsStatusStrip } from "./settings-status-strip";
import { EmailsSentList } from "./emails-sent-list";

function Status({ on }: { on: boolean }) {
  return on ? (
    <span className="text-tone-sage-ink font-medium">Configured</span>
  ) : (
    <span className="text-tone-amber-ink font-medium">Not set</span>
  );
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-sm font-semibold text-foreground">{title}</h2>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

const SECTION = "border-t border-border pt-6 mt-8 first:mt-0 first:border-t-0 first:pt-0";

export default async function SettingsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN")) {
    redirect("/login");
  }

  const tab = normalizeSettingsTab(searchParams?.tab);
  const hasApiKey = !!process.env.RESEND_API_KEY;

  // Part 35, WS95.2 (D2=A) — under D1=B a failed upload leaves no Document
  // row anywhere, so this DOCUMENT_UPLOAD_FAILED audit-log count is the
  // only durable trace an admin has that uploads are failing, short of a
  // founder reporting it. Renders nothing when zero (see StorageSettingsPanel).
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const uploadFailureCount = await db.auditLog.count({
    where: { action: "DOCUMENT_UPLOAD_FAILED", createdAt: { gte: sevenDaysAgo } },
  });

  // Part 37, WS111.3 — env-var presence only; values are never rendered.
  const lastIntake = await db.granolaIntake.findFirst({
    orderBy: { createdAt: "desc" },
    select: { status: true, createdAt: true },
  });
  const granolaOn = !!process.env.GRANOLA_API_KEY && !!process.env.GRANOLA_FOLDER_ID;
  const slackConfigured = !!process.env.SLACK_DIGEST_WEBHOOK_URL;

  return (
    <AppShell>
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        description="Platform configuration and diagnostics."
      />

      <SettingsStatusStrip
        resendOn={hasApiKey}
        cronOn={!!process.env.CRON_SECRET}
        uploadFailureCount={uploadFailureCount}
        granola={{ on: granolaOn, webhookOn: granolaOn && !!process.env.GRANOLA_WEBHOOK_SECRET, last: lastIntake }}
        slackOn={slackConfigured}
      />

      <SettingsTabs active={tab} />

      {tab === "email" && (
        <>
          <section className={SECTION}>
            <SectionHeading title="Weekly digest recipients" description="Choose which admins receive the weekly digest email" />
            <DigestRecipientsPanel />
          </section>

          <section className={SECTION}>
            <SectionHeading title="Outgoing email" description="Transactional email via Resend" />
            <EmailSettingsPanel hasApiKey={hasApiKey} emailFrom={emailFrom} />
            <EmailsSentList />
          </section>

          <section className={SECTION}>
            <SectionHeading title="Update reminders" />
            <p className="text-xs text-muted-foreground">
              Runs daily at 9:00 AM UTC. Cadence is set per company on its detail page.{" "}
              <Link href="/admin/companies" className="text-primary underline">
                Open companies
              </Link>
            </p>
          </section>
        </>
      )}

      {tab === "storage" && (
        <>
          <section className={SECTION}>
            <SectionHeading title="Upload health check" description="Document uploads via S3-compatible storage" />
            <StorageSettingsPanel uploadFailureCount={uploadFailureCount} />
          </section>
          <section className={SECTION}>
            <SectionHeading title="Orphaned documents" description="Document rows whose file never reached storage" />
            <OrphanedDocumentsPanel />
          </section>
        </>
      )}

      {tab === "integrations" && (
        <>
          <section className={SECTION}>
            <SectionHeading title="Granola (call intake)" description="Optional. Does nothing until its environment variables are set." />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <dt className="min-w-0 break-all font-mono text-foreground">GRANOLA_API_KEY</dt>
              <dd><Status on={!!process.env.GRANOLA_API_KEY} /></dd>
              <dt className="min-w-0 break-all font-mono text-foreground">GRANOLA_FOLDER_ID</dt>
              <dd><Status on={!!process.env.GRANOLA_FOLDER_ID} /></dd>
              <dt className="min-w-0 break-all font-mono text-foreground">GRANOLA_WEBHOOK_SECRET</dt>
              <dd><Status on={!!process.env.GRANOLA_WEBHOOK_SECRET} /></dd>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Webhook URL to register with Granola (the route is live; it answers 404 until all three variables above are set):
            </p>
            <p className="mt-1 select-all break-all font-mono text-xs text-foreground">{`${BASE_URL}/api/webhooks/granola`}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Webhook:{" "}
              <span className="text-foreground">
                {granolaOn && !!process.env.GRANOLA_WEBHOOK_SECRET ? "Active, accepting signed deliveries" : "Inactive until GRANOLA_WEBHOOK_SECRET is set"}
              </span>
              . Granola generates the signing secret and shows it only once, when the endpoint is created. Do not invent your own;
              copy the <span className="font-mono">whsec_</span> value from the create response. The daily sweep covers any missed delivery.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Last intake:{" "}
              {lastIntake ? (
                <span className="text-foreground">
                  {lastIntake.status}, {lastIntake.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC
                </span>
              ) : (
                <span className="text-foreground">None yet</span>
              )}
              {granolaOn && (
                <>
                  {" "}
                  <Link href="/admin/board?tab=intake" className="text-primary underline">
                    Open Intake
                  </Link>
                </>
              )}
            </p>
            <details className="group mt-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
                <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>&rsaquo;</span>
                Which API key should I use?
              </summary>
              <p className="mt-3 border-l border-border pl-4 text-xs text-muted-foreground">
                Reads one folder only, and only each note&apos;s summary. A <em>personal</em> API key cannot see teammates&apos;
                calls that were not shared with its owner (they would never appear); a <em>workspace</em> key sees folders with API
                access enabled. Use a workspace key.
              </p>
            </details>
          </section>

          <section className={SECTION}>
            <SectionHeading title="Slack (digest post)" description="Optional. Does nothing until its environment variable is set." />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <dt className="min-w-0 break-all font-mono text-foreground">SLACK_DIGEST_WEBHOOK_URL</dt>
              <dd><Status on={slackConfigured} /></dd>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              When set, sending a digest also posts its open items to one channel (once per digest).
            </p>
            <SlackTestPanel configured={slackConfigured} />
          </section>
        </>
      )}
    </div>
    </AppShell>
  );
}
