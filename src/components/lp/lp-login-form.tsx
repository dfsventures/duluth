"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Step = "email" | "code";

/**
 * LP entry form (Part 7, WS18.4) — the only client-called mutation on the
 * whole read path besides sign-out. Email -> request OTP -> verify -> the
 * server component above re-renders as the library (router.refresh()).
 */
export function LpLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lp/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setInfo(data?.message ?? "If this address receives fund reports from us, a code is on its way.");
      setStep("code");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lp/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That code is invalid or has expired.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={handleVerify} className="mt-8 max-w-sm">
        {info && <p className="mb-4 text-sm text-tide">{info}</p>}
        <label htmlFor="lp-otp-code" className="mb-2 block font-mono text-xs uppercase tracking-[0.1em] text-tide">
          6-digit code
        </label>
        <input
          id="lp-otp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="000000"
          className="w-full border border-bone bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] text-obsidian placeholder:text-muted focus:border-sky focus:outline-none"
        />
        {error && <p className="mt-2 text-sm text-laterite">{error}</p>}
        <Button type="submit" size="lg" disabled={loading} className="mt-4 w-full">
          {loading ? "Verifying…" : "Verify and continue"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setCode("");
            setError(null);
            setInfo(null);
          }}
          className="mt-3 text-xs text-muted hover:text-tide"
        >
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleRequest} className="mt-8 max-w-sm">
      <label htmlFor="lp-email" className="mb-2 block font-mono text-xs uppercase tracking-[0.1em] text-tide">
        Email address
      </label>
      <input
        id="lp-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full border border-bone bg-white px-4 py-3 text-sm text-obsidian placeholder:text-muted focus:border-sky focus:outline-none"
      />
      {error && <p className="mt-2 text-sm text-laterite">{error}</p>}
      <Button type="submit" size="lg" disabled={loading} className="mt-4 w-full">
        {loading ? "Sending…" : "Send access code"}
      </Button>
    </form>
  );
}
