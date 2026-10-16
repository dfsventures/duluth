// Part 39 (WS121). Shared shapes for the Marge tool functions. No database access here.

export interface ToolOutput {
  /** What the model reads. Plain text; founder-written or meeting-derived text sits in labelled blocks. */
  text: string;
  /** The same data, structured, for Marge's code. Never contains an email address. */
  structured: Record<string, unknown>;
  /** Rows returned (audit metadata carries this count, never content). */
  count: number;
}

/** A user-facing refusal: one plain sentence, returned to Marge as an MCP tool error. */
export class ToolError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "ToolError";
  }
}

/** The one place Molly's public origin is read for links in tool results. */
export function mollyOrigin(): string {
  return (process.env.NEXTAUTH_URL || "https://molly.dfs.vc").replace(/\/+$/, "");
}
export const companyUrl = (id: string) => `${mollyOrigin()}/admin/companies/${id}`;
export const boardUrl = () => `${mollyOrigin()}/admin/board`;
export const broadcastUrl = (id: string) => `${mollyOrigin()}/admin/broadcasts/${id}`;

export const isoDate = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** $1,250,000 (whole dollars). The raw number goes in `structured`. */
export function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
