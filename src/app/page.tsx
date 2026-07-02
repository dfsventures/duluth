import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { BarChart3, FileText, Link2 } from "lucide-react";
import { AdminLoginButton } from "@/components/ui/admin-login-button";

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    if (session.user.roles.includes("ADMIN")) redirect("/admin");
    else redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <span className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <Image src="/logo.png" alt="" width={69} height={28} priority />
          Molly
        </span>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Sign In
          </Link>
          <AdminLoginButton className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition-colors" />
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {/* Gradient blob behind the text */}
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(91,141,197,0.12) 0%, transparent 70%)",
          }}
        />

        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">
          DFS Lab Portfolio Platform
        </p>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Your portfolio,{" "}
          <span className="text-primary">organized.</span>
        </h1>
        <p className="mb-8 max-w-lg text-base text-muted-foreground sm:text-lg">
          Molly helps DFS Lab founders submit investor updates, track key
          metrics, and share progress with stakeholders — all in one place.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-600 transition-colors"
          >
            Apply for Access
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Sign In
          </Link>
        </div>
      </main>

      {/* Features strip */}
      <section className="mx-auto mb-16 mt-20 grid max-w-2xl gap-6 px-6 sm:grid-cols-3">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Portfolio Updates</p>
          <p className="text-xs text-muted-foreground">
            Write and publish rich updates with a single click. DFS Lab gets notified automatically.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Metric Tracking</p>
          <p className="text-xs text-muted-foreground">
            Define your KPIs and track them over time with visual trend charts.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50">
            <Link2 className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Investor Links</p>
          <p className="text-xs text-muted-foreground">
            Generate secure, time-scoped links to share updates with your investors.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} DFS Lab &mdash;{" "}
        <AdminLoginButton className="hover:text-foreground underline underline-offset-2" />
      </footer>
    </div>
  );
}
