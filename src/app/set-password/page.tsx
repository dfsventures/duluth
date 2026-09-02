"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoMark } from "@/components/ui/logo-mark";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@dfs.vc";

type TokenState = "checking" | "valid" | "expired" | "invalid";
type ResendState = "idle" | "sending" | "sent";

function CenteredLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  );
}

function InvalidCard() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <LogoMark className="text-4xl" />
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
            This password setup link is missing or no longer valid. Please
            use the link from your approval email, or contact{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-primary hover:text-primary-500"
            >
              {SUPPORT_EMAIL}
            </a>
            .
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

function ExpiredCard({ token }: { token: string }) {
  const [resendState, setResendState] = useState<ResendState>("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleResend() {
    setResendState("sending");
    setResendError(null);
    try {
      const res = await fetch("/api/auth/set-password/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => null);
        setResendError(data?.error || "Too many attempts. Please try again in an hour.");
        setResendState("idle");
        return;
      }

      // Always neutral — don't branch on ok/eligible, the response can't tell us.
      setResendState("sent");
    } catch {
      setResendError("Network error. Please try again.");
      setResendState("idle");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <LogoMark className="text-4xl" />
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

          {resendState === "sent" ? (
            <>
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                Check your inbox
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                If this link was eligible for renewal, a fresh one is on its
                way — check your inbox.
              </p>
              <div className="flex flex-col items-center gap-1 text-sm">
                <Link
                  href="/login"
                  className="font-medium text-primary hover:text-primary-500"
                >
                  Back to login
                </Link>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Contact support
                </a>
              </div>
            </>
          ) : (
            <>
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                This link has expired
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Setup links expire after 7 days. We can email you a fresh
                one — it goes to the address this link was issued for.
              </p>
              {resendError && (
                <div className="mb-4 rounded-md border border-laterite/30 bg-laterite/10 px-4 py-3 text-sm text-laterite">
                  {resendError}
                </div>
              )}
              <Button
                className="w-full"
                disabled={resendState === "sending"}
                onClick={handleResend}
              >
                {resendState === "sending" ? "Sending..." : "Email me a new link"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [tokenState, setTokenState] = useState<TokenState>(
    token ? "checking" : "invalid"
  );

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/auth/set-password?token=${encodeURIComponent(token)}`
        );
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setTokenState("invalid");
        } else if (data.valid) {
          setTokenState("valid");
        } else if (data.code === "TOKEN_EXPIRED") {
          setTokenState("expired");
        } else {
          setTokenState("invalid");
        }
      } catch {
        if (!cancelled) setTokenState("invalid");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

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
        // Token aged out between page load and submit — show the
        // recovery UI instead of a dead-end error message.
        if (data.code === "TOKEN_EXPIRED") {
          setTokenState("expired");
          return;
        }
        if (data.code === "TOKEN_INVALID") {
          setTokenState("invalid");
          return;
        }
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

  if (tokenState === "checking") {
    return <CenteredLoading />;
  }

  if (tokenState === "invalid") {
    return <InvalidCard />;
  }

  if (tokenState === "expired") {
    return <ExpiredCard token={token as string} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <LogoMark className="text-4xl" />
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
    <Suspense fallback={<CenteredLoading />}>
      <SetPasswordForm />
    </Suspense>
  );
}
