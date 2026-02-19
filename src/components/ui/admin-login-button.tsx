"use client";

import { signIn } from "next-auth/react";

export function AdminLoginButton({ className }: { className?: string }) {
  return (
    <button
      onClick={() => signIn("google", { callbackUrl: "/admin" })}
      className={className}
    >
      Admin Login
    </button>
  );
}
