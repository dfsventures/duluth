import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import { decideRoute } from "@/lib/route-access";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const decision = decideRoute(req.nextUrl.pathname, req.nextUrl.search, {
    isLoggedIn: !!req.auth,
    roles: req.auth?.user?.roles ?? [],
    status: req.auth?.user?.status,
  });

  if (decision.type === "redirect") {
    const url = new URL(decision.to, req.url);
    if (decision.callbackUrl) url.searchParams.set("callbackUrl", decision.callbackUrl);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|favicon.png).*)",
  ],
};
