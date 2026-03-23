import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const userRoles = req.auth?.user?.roles ?? [];
  const userStatus = req.auth?.user?.status;
  const isAdmin = userRoles.includes("ADMIN");
  const isFounder = userRoles.includes("FOUNDER");

  // Public routes — always accessible
  const publicPaths = ["/", "/login", "/signup", "/set-password", "/api/auth", "/api/dev", "/share"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // Must be logged in for everything else
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // Founders must be approved (unless accessing setup wizard)
  if (isFounder && !isAdmin && userStatus !== "APPROVED" && pathname !== "/setup-wizard") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Admin routes — only for admins
  if (pathname.startsWith("/admin") && !isAdmin) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Founder routes — redirect pure admins (no founder role) to admin dashboard
  if (pathname === "/dashboard" && isAdmin && !isFounder) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.svg|logo.png).*)",
  ],
};
