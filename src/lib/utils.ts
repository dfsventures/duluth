import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatPeriod(period: string): string {
  // "2025-Q1" -> "Q1 2025", "2025-01" -> "Jan 2025"
  const qMatch = period.match(/^(\d{4})-Q(\d)$/);
  if (qMatch) return `Q${qMatch[2]} ${qMatch[1]}`;

  const mMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (mMatch) {
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${monthNames[parseInt(mMatch[2]) - 1]} ${mMatch[1]}`;
  }

  return period;
}

export function daysSince(date: Date | string): number {
  const d = new Date(date);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/** Prepend https:// if no protocol is present. Returns empty string for blank input. */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}
