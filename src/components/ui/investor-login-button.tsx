"use client";

import { signIn } from "next-auth/react";
import { cn } from "@/lib/utils";

/** Signs in via the same Google OAuth flow admins use — labeled "Investor Login" on the homepage. */
export function InvestorLoginButton({ className }: { className?: string }) {
  return (
    <button
      onClick={() => signIn("google", { callbackUrl: "/admin" })}
      className={cn("bg-transparent p-0 font-sans", className)}
    >
      Investor Login
    </button>
  );
}
