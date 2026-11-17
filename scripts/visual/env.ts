// Local-only environment for the visual-check toolkit (setup.ts, shoot.ts and the dev server).
//
// Everything is passed explicitly; no .env file is read by these scripts. Next.js never
// overrides a variable that is already in process.env, so the empty strings below win over
// anything a .env file might say: no email, AI, Slack, Google, Granola, S3 or Marge call can
// leave this Mac while the dev server runs with this environment.

export const LOCAL_DB_NAME = "molly_local";
export const LOCAL_PORT = 3100;
export const BASE_URL = `http://localhost:${LOCAL_PORT}`;

// NOT A SECRET. A fixed string so the session cookie minted by shoot.ts is accepted by the
// local dev server. It protects nothing and must never be used anywhere real.
export const LOCAL_AUTH_SECRET = "molly-local-visual-check-not-a-secret";

export const localEnv: Record<string, string> = {
  DATABASE_URL: `postgresql://josephbenson@127.0.0.1:5432/${LOCAL_DB_NAME}`,

  AUTH_SECRET: LOCAL_AUTH_SECRET,
  NEXTAUTH_SECRET: LOCAL_AUTH_SECRET,
  NEXTAUTH_URL: BASE_URL,
  AUTH_URL: BASE_URL,
  AUTH_TRUST_HOST: "true",
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",

  // Placeholder branding so no real organisation name or domain appears in screenshots.
  NEXT_PUBLIC_ORG_NAME: "Example Capital",
  NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN: "example.com",
  TEAM_EMAIL: "team@example.com",
  SUPPORT_EMAIL: "support@example.com",

  // Every external integration is switched off with an empty value.
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  BROADCAST_EMAIL_FROM: "",
  BROADCAST_COPY_EMAIL: "",
  ANTHROPIC_API_KEY: "",
  GRANOLA_API_KEY: "",
  GRANOLA_FOLDER_ID: "",
  GRANOLA_WEBHOOK_SECRET: "",
  SLACK_DIGEST_WEBHOOK_URL: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  GOOGLE_SA_EMAIL: "",
  GOOGLE_SA_PRIVATE_KEY: "",
  SHEETS_SPREADSHEET_ID: "",
  FUND_METRICS_SPREADSHEET_ID: "",
  SHEETS_SYNC_APPLY_ENABLED: "",
  FUND_METRICS_SYNC_APPLY_ENABLED: "",
  CRON_SECRET: "",
  S3_REGION: "",
  S3_ENDPOINT: "",
  S3_ACCESS_KEY_ID: "",
  S3_SECRET_ACCESS_KEY: "",
  S3_BUCKET: "",
  MARGE_MCP_MODE: "",
  MARGE_ASSERTION_JWKS: "",
  MARGE_MEMO_TOOLS: "",
};

/**
 * Refuses (exit 1) unless the database is molly_local on this Mac. Every script calls this
 * first and again right before touching the database.
 */
export function assertLocalDatabase(url: string | undefined = process.env.DATABASE_URL): void {
  let host = "";
  let dbName = "";
  try {
    const u = new URL(url ?? "");
    host = u.hostname;
    dbName = decodeURIComponent(u.pathname.replace(/^\//, ""));
  } catch {
    // falls through to the refusal below
  }
  if ((host !== "127.0.0.1" && host !== "localhost") || dbName !== LOCAL_DB_NAME) {
    console.error(
      `REFUSING TO RUN: DATABASE_URL must point at host 127.0.0.1 or localhost and database "${LOCAL_DB_NAME}".\n` +
        `Got host "${host || "(unparsable)"}" and database "${dbName || "(none)"}". Nothing was done.`
    );
    process.exit(1);
  }
}

/** Puts the local environment into process.env (overriding whatever the shell had), then re-checks the guard. */
export function applyLocalEnv(): void {
  for (const [k, v] of Object.entries(localEnv)) process.env[k] = v;
  assertLocalDatabase(process.env.DATABASE_URL);
}
