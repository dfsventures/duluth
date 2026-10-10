// Shared types and constants for the admin company detail tabs (split out of
// src/app/admin/companies/[id]/page.tsx in UI overhaul phase 7).

export const FUNDING_STAGES = ["Pre-seed", "Seed", "Series A", "Series B+"];

export const REMINDER_OPTIONS = [
  { label: "Disabled", value: null },
  { label: "Weekly", value: 7 },
  { label: "Bi-weekly", value: 14 },
  { label: "Monthly", value: 30 },
  { label: "Quarterly", value: 90 },
] as const;

export interface Company {
  id: string;
  name: string;
  logo: string | null;
  description: string | null;
  website: string | null;
  sector: string | null;
  geography: string | null;
  fundingStage: string | null;
  aliases: string[];
  reminderFrequencyDays: number | null;
  lastReminderSentAt: string | null;
}

export interface Update {
  id: string;
  title: string;
  period: string;
  status: "DRAFT" | "SENT";
  createdAt: string;
}

export interface MetricDefinition {
  id: string;
  name: string;
  unit: string | null;
  values: { value: number; date: string }[];
}

export interface Document {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  isInternal: boolean;
  docType: string | null;
  archivedAt: string | null;
  createdAt: string;
  uploadedBy: string | null;
}

export interface Member {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  userRoles: string[];
  membershipRole: "OWNER" | "MEMBER" | "VIEWER";
}

export interface NoteUser {
  id: string;
  name: string | null;
  email: string;
}

export interface NoteRevision {
  id: string;
  noteId: string;
  title: string;
  body: string;
  occurredAt: string;
  transcriptUrl: string | null;
  editedById: string;
  editedBy: NoteUser;
  createdAt: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  occurredAt: string;
  transcriptUrl: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: NoteUser;
  revisions: NoteRevision[];
  _count: { revisions: number };
}

// Part 34, WS91 — the founder's DD questionnaire answers, read-only, from
// the widened admin-only GET /api/admin/companies/[id] (never the shared,
// founder-reachable GET /api/companies/[id] — D5). Present at any Company
// stage; the tab is hidden entirely when this is null.
export interface CompanyDiligenceView {
  isUsIncorporated: boolean | null;
  isStellarEcosystem: boolean;
  stellarWhyText: string | null;
  stellarTimelineText: string | null;
  completedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
}

export type Tab = "updates" | "metrics" | "documents" | "members" | "notes" | "diligence";
export const TABS: readonly Tab[] = ["updates", "metrics", "documents", "members", "notes", "diligence"];
