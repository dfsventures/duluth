"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout, AuthAlert, AuthSteps, AuthSkeleton } from "@/components/auth/auth-layout";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@dfs.vc";

type TokenState = "checking" | "valid" | "expired" | "invalid";
type ResendState = "idle" | "sending" | "sent";

function InvalidCard() {
  return (
    <AuthLayout
      eyebrow="Account setup"
      title="This link isn't valid."
      description="The password setup link is missing or no longer works."
      footer={
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <p className="text-sm text-secondary">
        Please use the link from your approval email, or contact{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline-offset-4 hover:underline">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    </AuthLayout>
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

  if (resendState === "sent") {
    return (
      <AuthLayout
        eyebrow="Account setup"
        title="Check your inbox."
        description="If this link was eligible for renewal, a fresh one is on its way."
        footer={
          <span className="flex flex-col gap-1">
            <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Back to sign in
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-foreground">
              Contact support
            </a>
          </span>
        }
      >
        <AuthAlert tone="info">Sent. The new link works for 7 days.</AuthAlert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Account setup"
      title="This link has expired."
      description="Setup links expire after 7 days. We can email you a fresh one, sent to the address this link was issued for."
    >
      {resendError && <AuthAlert>{resendError}</AuthAlert>}
      <Button size="lg" className="w-full" loading={resendState === "sending"} onClick={handleResend}>
        Email me a new link
      </Button>
    </AuthLayout>
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
    return <AuthSkeleton />;
  }

  if (tokenState === "invalid") {
    return <InvalidCard />;
  }

  if (tokenState === "expired") {
    return <ExpiredCard token={token as string} />;
  }

  return (
    <AuthLayout
      eyebrow="Account setup"
      title="Set your password."
      description="Create a password for your Molly account. You will be signed in straight after."
      progress={<AuthSteps steps={["Approved", "Set password", "Sign in"]} current={1} />}
    >
      {error && <AuthAlert>{error}</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        <Input
          id="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Confirm your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
        />
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Set password
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <SetPasswordForm />
    </Suspense>
  );
}
