import { createSign } from "crypto";

// Part 10, WS27.2 — zero-dependency Google Sheets client (JC15). Service-
// account auth is a hand-signed RS256 JWT exchanged for a bearer token,
// then one fetch to the Sheets v4 values.get endpoint. No `googleapis` or
// `google-auth-library` dep — read-only scope, ~fits in one file. Fork
// story (ground rule 4): every export here is a no-op/false when the three
// env vars are absent, so a fork that never touches Google carries this
// code but never executes any of it.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

// Corrected against the live production sheet (2026-07-20) — the Part 10
// plan text originally inherited the wrong structure from the old Excel
// file (a "Deals" tab, header at row 15). The real sheet: tab "All Deals",
// header at row 1, data starting row 2, 76 data rows (2-77) as of writing.
export const SHEET_TAB_NAME = "All Deals";
export const SHEET_RANGE = `'${SHEET_TAB_NAME}'!A1:Z1000`; // wide enough for the not-yet-added round-size/ownership columns

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** All three env vars present — the single switch every UI/route checks (ground rule 4). */
export function sheetsSyncEnabled(): boolean {
  return Boolean(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY && process.env.SHEETS_SPREADSHEET_ID);
}

function getPrivateKey(): string {
  // Vercel env vars store multi-line PEM keys with literal "\n" sequences.
  const raw = process.env.GOOGLE_SA_PRIVATE_KEY ?? "";
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SA_EMAIL;
  const privateKey = getPrivateKey();
  if (!email || !privateKey) {
    throw new Error("sheets.ts: getAccessToken called without GOOGLE_SA_EMAIL/GOOGLE_SA_PRIVATE_KEY set");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(privateKey));
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sheets.ts: token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("sheets.ts: token exchange response had no access_token");
  return data.access_token;
}

export interface SheetTable {
  header: string[];
  rows: string[][];
}

/**
 * Fetches the raw "All Deals" tab as strings — header row (row 1) plus
 * every data row. Callers look up columns by header text (header-text
 * lookup, not hardcoded letters), so a go-forward round-size/ownership
 * column that gets added later is picked up automatically without a code
 * change, and an absent one is skipped cleanly (Q24 gate #3).
 */
export async function getSheetRows(): Promise<SheetTable> {
  if (!sheetsSyncEnabled()) {
    throw new Error("sheets.ts: getSheetRows called while sheetsSyncEnabled() is false");
  }
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  const token = await getAccessToken();
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(SHEET_RANGE)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sheets.ts: values.get failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const values = data.values ?? [];
  const [header = [], ...rows] = values;
  return { header, rows };
}

/** Case-insensitive, whitespace-trimmed header lookup — returns -1 if absent (caller must handle cleanly, Q24 gate #3). */
export function findColumn(header: string[], name: string): number {
  const target = name.trim().toLowerCase();
  return header.findIndex((h) => (h ?? "").trim().toLowerCase() === target);
}
