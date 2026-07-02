"use client";

import { signIn } from "next-auth/react";

/** Signs in via the same Google OAuth flow admins use — labeled "Investor Login" on the homepage. */
export function InvestorLoginButton({ className }: { className?: string }) {
  return (
    <button
      onClick={() => signIn("google", { callbackUrl: "/admin" })}
      className={className}
    >
      Investor Login
    </button>
  );
}
