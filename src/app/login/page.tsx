"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout, AuthAlert, AuthSkeleton } from "@/components/auth/auth-layout";
import { ORG_NAME, ADMIN_EMAIL_DOMAINS_LABEL } from "@/lib/org";

const GoogleIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const errorMessages: Record<string, string> = {
    CredentialsSignin: "Invalid email or password.",
    AccessDenied: `Access denied. Only ${ADMIN_EMAIL_DOMAINS_LABEL} accounts can sign in with Google.`,
    Default: "An error occurred. Please try again.",
  };

  const displayError = error ? errorMessages[error] || errorMessages.Default : null;

  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await signIn("credentials", { email, password, callbackUrl });
    setLoading(false);
  }

  return (
    <AuthLayout
      eyebrow="Molly"
      title="Sign in to Molly."
      description={`Portfolio updates and reports for ${ORG_NAME} companies and team.`}
      footer={
        <p>
          Don&apos;t have access yet?{" "}
          <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
            Apply for access
          </Link>
        </p>
      }
    >
      {displayError && <AuthAlert>{displayError}</AuthAlert>}

      <section aria-labelledby="team-signin">
        <h2 id="team-signin" className="font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">
          {ORG_NAME} team
        </h2>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="mt-3 w-full"
          onClick={() => signIn("google", { callbackUrl: callbackUrl.startsWith("/admin") ? callbackUrl : "/admin" })}
        >
          <GoogleIcon />
          Sign in with Google
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">For {ADMIN_EMAIL_DOMAINS_LABEL} accounts only.</p>
      </section>

      <div className="my-8 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-border" />
        <span className="font-mono text-label uppercase tracking-label text-muted-foreground">or with email</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleCredentialsLogin} className="space-y-4" aria-label="Sign in with email and password">
        <Input
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
