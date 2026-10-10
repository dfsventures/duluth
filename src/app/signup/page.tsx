"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout, AuthAlert } from "@/components/auth/auth-layout";
import { ORG_NAME } from "@/lib/org";

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

  if (submitted) {
    return (
      <AuthLayout
        eyebrow="Application received"
        title="Thanks. We have it."
        description={`The ${ORG_NAME} team will review your request and email you within a few days once your account is approved.`}
        footer={
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div role="status" className="flex items-center gap-3 border-l-2 border-acacia bg-tone-sage px-3 py-2.5 text-sm text-tone-sage-ink">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
          Your application is in the queue.
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Apply for access"
      title="Tell us who you are."
      description="Share your name and your company. We review every application and are in touch within a few days."
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      {error && <AuthAlert>{error}</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="name"
          label="Full name"
          type="text"
          autoComplete="name"
          placeholder="Jane Doe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
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
          id="companyName"
          label="Company name"
          type="text"
          autoComplete="organization"
          placeholder="Your startup"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
        />
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Submit application
        </Button>
      </form>
    </AuthLayout>
  );
}
