import { describe, it, expect } from "vitest";
import { decideRoute, type SessionInfo } from "@/lib/route-access";

const loggedOut: SessionInfo = { isLoggedIn: false, roles: [] };
const pendingFounder: SessionInfo = { isLoggedIn: true, roles: ["FOUNDER"], status: "PENDING" };
const approvedFounder: SessionInfo = { isLoggedIn: true, roles: ["FOUNDER"], status: "APPROVED" };
const admin: SessionInfo = { isLoggedIn: true, roles: ["ADMIN"], status: "APPROVED" };
const adminAndFounder: SessionInfo = { isLoggedIn: true, roles: ["ADMIN", "FOUNDER"], status: "APPROVED" };

describe("decideRoute — public routes", () => {
  it("allows the homepage logged out", () => {
    expect(decideRoute("/", "", loggedOut)).toEqual({ type: "next" });
  });

  it.each([
    "/login",
    "/signup",
    "/set-password",
    "/api/auth/session",
    "/share/abc123",
    "/api/cron/reminders",
    "/investors",
    "/brand/dfs-logo-primary.png",
    "/api/share/abc123",
    "/api/share/abc123/view",
  ])("allows %s logged out", (path) => {
    expect(decideRoute(path, "", loggedOut)).toEqual({ type: "next" });
  });

  // Found 2026-07-06 (F15), during WS12 live verification: the page at
  // "/share/[token]" was already public, but the client-side data fetch it
  // makes to "/api/share/[token]" was not — so every investor (who has no
  // account) had that fetch 307-redirected to /login, and the share page
  // never actually rendered any data. The token itself is the
  // authorization for this endpoint, same as for "/share" itself.
  it("allows /api/share/[token] with no session (a share link's token is its own authorization)", () => {
    expect(decideRoute("/api/share/abc123", "", loggedOut)).toEqual({ type: "next" });
  });

  // Found 2026-07-06: email clients fetch the header logo from /brand
  // with no session; the middleware 307'd the image request to /login,
  // so every transactional email rendered with a broken logo.
  it("allows /brand assets with no session (email clients fetch the logo unauthenticated)", () => {
    expect(decideRoute("/brand/dfs-logo-primary.png", "", loggedOut)).toEqual({ type: "next" });
  });

  // Found 2026-07-03: Vercel Cron invocations carry no session, so without
  // this the middleware redirected every cron call to /login before the
  // route's own CRON_SECRET check ever ran — the daily reminder job had
  // silently never sent an email.
  it("allows /api/cron/reminders with no session (auth is enforced by CRON_SECRET in the route)", () => {
    expect(decideRoute("/api/cron/reminders", "", loggedOut)).toEqual({ type: "next" });
  });

  // Regression: the February bug matched "/" as a prefix, which made
  // isPublic true for every pathname (since every pathname starts with "/").
  // These two cases would have silently passed under that bug.
  it("REGRESSION: /dashboard is not public — requires login", () => {
    const result = decideRoute("/dashboard", "", loggedOut);
    expect(result.type).toBe("redirect");
  });

  it("REGRESSION: /admin is not public — requires login", () => {
    const result = decideRoute("/admin", "", loggedOut);
    expect(result.type).toBe("redirect");
  });

  it("REGRESSION: an arbitrary API route is not public — requires login", () => {
    const result = decideRoute("/api/admin/dashboard", "", loggedOut);
    expect(result.type).toBe("redirect");
  });
});

describe("decideRoute — unauthenticated access", () => {
  it("redirects to /login with an encoded callbackUrl preserving path and query", () => {
    const result = decideRoute("/dashboard", "?foo=bar", loggedOut);
    expect(result).toEqual({ type: "redirect", to: "/login", callbackUrl: "/dashboard?foo=bar" });
  });
});

describe("decideRoute — pending founder", () => {
  it("redirects away from /dashboard", () => {
    const result = decideRoute("/dashboard", "", pendingFounder);
    expect(result).toEqual({ type: "redirect", to: "/login" });
  });

  it("allows /setup-wizard", () => {
    expect(decideRoute("/setup-wizard", "", pendingFounder)).toEqual({ type: "next" });
  });
});

describe("decideRoute — approved founder", () => {
  it("allows /dashboard", () => {
    expect(decideRoute("/dashboard", "", approvedFounder)).toEqual({ type: "next" });
  });

  it("redirects away from /admin", () => {
    expect(decideRoute("/admin", "", approvedFounder)).toEqual({ type: "redirect", to: "/dashboard" });
  });

  it("redirects away from a nested /admin route", () => {
    expect(decideRoute("/admin/settings", "", approvedFounder)).toEqual({ type: "redirect", to: "/dashboard" });
  });
});

describe("decideRoute — pure admin (no founder role)", () => {
  it("allows /admin", () => {
    expect(decideRoute("/admin", "", admin)).toEqual({ type: "next" });
  });

  it("redirects away from /dashboard", () => {
    expect(decideRoute("/dashboard", "", admin)).toEqual({ type: "redirect", to: "/admin" });
  });
});

describe("decideRoute — admin and founder", () => {
  it("allows /dashboard", () => {
    expect(decideRoute("/dashboard", "", adminAndFounder)).toEqual({ type: "next" });
  });

  it("allows /admin", () => {
    expect(decideRoute("/admin", "", adminAndFounder)).toEqual({ type: "next" });
  });
});
