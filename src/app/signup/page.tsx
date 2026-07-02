"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, companyName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
      {/* Back to home */}
      <div className="mb-6 w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <Image src="/logo.png" alt="" width={54} height={22} />
          Molly
        </Link>
      </div>

      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="h-1 w-full bg-primary" />
          <div className="px-8 py-8">
            {submitted ? (
              <div className="space-y-4 py-4 text-center">
                <div className="flex justify-center">
                  <CheckCircle2 className="h-12 w-12 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-foreground">
                  Application received
                </h2>
                <p className="text-sm text-muted-foreground">
                  Thanks for applying. The DFS Lab team will review your request
                  and email you within a few days once your account is approved.
                </p>
                <Link
                  href="/login"
                  className="inline-block text-sm font-medium text-primary hover:text-primary-600"
                >
                  Back to Sign In →
                </Link>
              </div>
            ) : (
              <>
                <h1 className="mb-1 text-xl font-semibold text-foreground">
                  Apply for Access
                </h1>
                <p className="mb-6 text-sm text-muted-foreground">
                  Tell us about yourself and your company. We&apos;ll review your
                  application and be in touch within a few days.
                </p>

                {error && (
                  <div className="mb-4 rounded-md border border-laterite/30 bg-laterite/10 px-4 py-3 text-sm text-laterite">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    id="name"
                    label="Full Name"
                    type="text"
                    placeholder="Jane Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
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
                    id="companyName"
                    label="Company Name"
                    type="text"
                    placeholder="Your startup"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Submitting..." : "Submit Application"}
                  </Button>
                </form>

                <p className="mt-5 text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link href="/login" className="font-medium text-primary hover:text-primary-600">
                    Sign in →
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
