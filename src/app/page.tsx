import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { LogoMark } from "@/components/ui/logo-mark";
import { ORG_NAME } from "@/lib/org";

const steps = [
  {
    num: "01.",
    title: "Submit Updates",
    description: `Write and publish rich updates with a single click. ${ORG_NAME} gets notified automatically.`,
  },
  {
    num: "02.",
    title: "Track Metrics",
    description: "Define your KPIs and track them over time with visual trend charts.",
  },
  {
    num: "03.",
    title: "Share with Investors",
    description: "Generate secure, time-scoped links to share updates with your investors.",
  },
];

const STEP_TONES = ["bg-tone-sand text-tone-sand-ink", "bg-tone-sky text-tone-sky-ink", "bg-tone-sage text-tone-sage-ink"];

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    if (session.user.roles.includes("ADMIN")) redirect("/admin");
    else redirect("/dashboard");
  }

  return (
    <div data-surface="founder" className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <LogoMark />
        <div className="flex items-center gap-5 text-sm text-muted-foreground">
          <Link href="/login" className="hover:text-foreground transition-colors">
            Log in
          </Link>
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

        <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-primary">
          {ORG_NAME} Portfolio Platform
        </p>
        <h1 className="mb-4 max-w-2xl font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          One place to keep your investors{" "}
          <span className="text-primary">in the loop.</span>
        </h1>
        <p className="mb-8 max-w-lg text-base text-muted-foreground sm:text-lg">
          Submit updates, track metrics, and share progress — without
          wrestling with decks or spreadsheets.
        </p>

        <Link
          href="/signup"
          className="inline-flex h-11 items-center rounded-ctl bg-primary px-6 font-mono text-cta font-semibold uppercase tracking-cta text-primary-foreground shadow-soft transition-[background-color,box-shadow] hover:bg-primary-600 hover:shadow-lift"
        >
          Apply for Access
        </Link>
      </main>

      {/* How it works */}
      <section className="mx-auto mb-20 mt-24 w-full max-w-2xl space-y-3 px-6">
        {steps.map((step, i) => (
          <div
            key={step.num}
            className="flex flex-col gap-1 rounded-md bg-card p-5 shadow-soft sm:flex-row sm:gap-6"
          >
            <span
              className={`inline-flex h-7 w-10 shrink-0 items-center justify-center rounded-sm font-mono text-xs font-semibold sm:mt-0.5 ${STEP_TONES[i % STEP_TONES.length]}`}
            >
              {step.num}
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{step.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="flex items-center justify-center gap-4 border-t px-6 py-5 text-center text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} {ORG_NAME}</span>
        <span aria-hidden>·</span>
        <Link href="/investors" className="hover:text-foreground transition-colors">
          Investor access
        </Link>
      </footer>
    </div>
  );
}
