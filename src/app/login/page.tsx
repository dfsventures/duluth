"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const GoogleIcon = () => (
  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
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
    AccessDenied: "Access denied. Only @dfs.vc accounts can sign in with Google.",
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
      {/* Back to home */}
      <div className="mb-6 w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <Image src="/logo.png" alt="" width={22} height={22} />
          Molly
        </Link>
      </div>

      <div className="w-full max-w-md">
        {/* Card with teal top accent */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="h-1 w-full bg-primary" />
          <div className="px-8 py-8">
            <h1 className="mb-1 text-xl font-semibold text-foreground">Welcome back</h1>
            <p className="mb-6 text-sm text-muted-foreground">
              Sign in to your Molly account.
            </p>

            {displayError && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {displayError}
              </div>
            )}

            <form onSubmit={handleCredentialsLogin} className="space-y-4">
              <Input
                id="email"
                label="Email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                id="password"
                label="Password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Don&apos;t have access yet?{" "}
              <Link href="/signup" className="font-medium text-primary hover:text-primary-600">
                Apply for access →
              </Link>
            </p>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">DFS Lab team?</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => signIn("google", { callbackUrl: callbackUrl.startsWith("/admin") ? callbackUrl : "/admin" })}
            >
              <GoogleIcon />
              Sign in with Google
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              For @dfs.vc accounts only
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
