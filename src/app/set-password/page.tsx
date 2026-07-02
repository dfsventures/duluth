"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      // Auto sign-in with the credentials they just set.
      // Use redirect:false so next-auth doesn't route through the /login page
      // before reaching /dashboard. Then do a hard navigation so the session
      // cookie is included in the very first request to /dashboard.
      const result = await signIn("credentials", {
        email: data.email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Your password was saved but sign-in failed. Please go to the login page.");
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="flex justify-center">
            <Image
              src="/logo.png"
              alt="Molly"
              width={160}
              height={65}
              priority
            />
          </div>
          <div className="card text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-laterite/10">
              <svg
                className="h-6 w-6 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              Invalid Link
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              This password setup link is missing a token. Please use the link
              from your approval email.
            </p>
            <Link
              href="/login"
              className="text-sm font-medium text-primary hover:text-primary-500"
            >
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <Image
            src="/logo.png"
            alt="Molly"
            width={160}
            height={65}
            priority
          />
        </div>

        <div className="card">
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Set Your Password
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Create a password for your Molly account.
          </p>

          {error && (
            <div className="mb-4 rounded-md border border-laterite/30 bg-laterite/10 px-4 py-3 text-sm text-laterite">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="password"
              label="Password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <Input
              id="confirmPassword"
              label="Confirm Password"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? "Setting password..." : "Set Password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <SetPasswordForm />
    </Suspense>
  );
}
