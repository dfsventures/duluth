import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { LogoMark } from "@/components/ui/logo-mark";
import { ORG_NAME } from "@/lib/org";
import { V2_EYEBROW } from "@/lib/founder-look";
import { V2_TAP } from "@/lib/public-look";

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

  // data-v2-scope (PLAN-1, WS166): the new look reaches the home page under the same switch as the rest
  // of the app. Signed-out visitors only have it if this browser turned it on before (the switch is saved
  // in the browser, not the account). Every `v2:` class applies only then; the old look is unchanged.
  return (
    <div data-surface="founder" data-v2-scope="" className="home-surface flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-10 max-md:v2:px-5 max-md:v2:py-2">
        <LogoMark />
        <div className="flex items-center gap-5 text-sm text-muted-foreground v2:text-row">
          <Link href="/login" className={`hover:text-foreground transition-colors ${V2_TAP}`}>
            Log in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center max-md:v2:px-5">
        {/* Gradient blob behind the text (not in the new look, which is flat) */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 v2:hidden"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(91,141,197,0.12) 0%, transparent 70%)",
          }}
        />

        <p className={`mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-primary ${V2_EYEBROW}`}>
          {ORG_NAME} Portfolio Platform
        </p>
        <h1 className="mb-4 max-w-2xl font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl v2:max-w-[600px] v2:[text-wrap:balance] v2:font-sans v2:text-[32px] v2:leading-10 v2:font-semibold v2:tracking-[-0.015em] sm:v2:text-[40px] sm:v2:leading-[48px]">
          One place to keep your investors{" "}
          <span className="text-primary">in the loop.</span>
        </h1>
        <p className="mb-8 max-w-lg text-base text-muted-foreground sm:text-lg v2:text-body v2:text-secondary sm:v2:text-[16px] sm:v2:leading-6">
          Submit updates, track metrics, and share progress — without
          wrestling with decks or spreadsheets.
        </p>

        <Link
          href="/signup"
          className="inline-flex h-11 items-center rounded-ctl bg-primary px-6 font-mono text-cta font-semibold uppercase tracking-cta text-primary-foreground shadow-soft transition-[background-color,box-shadow] hover:bg-primary-600 hover:shadow-lift v2:h-10 v2:px-5 v2:font-sans v2:text-row v2:font-medium v2:normal-case v2:tracking-normal v2:shadow-none v2:hover:bg-primary-hover v2:hover:shadow-none max-md:v2:h-11"
        >
          Apply for Access
        </Link>
      </main>

      {/* How it works. New look: three hairline rows, not three cards. */}
      <section className="mx-auto mb-20 mt-24 w-full max-w-2xl space-y-3 px-6 v2:space-y-0 max-md:v2:px-5">
        {steps.map((step, i) => (
          <div
            key={step.num}
            className="flex flex-col gap-1 rounded-md bg-card p-5 shadow-soft sm:flex-row sm:gap-6 v2:rounded-none v2:border-b v2:border-border v2:first:border-t v2:bg-transparent v2:px-0 v2:py-4 v2:shadow-none"
          >
            <span
              className={`inline-flex h-7 w-10 shrink-0 items-center justify-center rounded-sm font-mono text-xs font-semibold sm:mt-0.5 ${STEP_TONES[i % STEP_TONES.length]} v2:h-auto v2:w-10 v2:justify-start v2:bg-transparent v2:font-sans v2:font-medium v2:text-muted-foreground v2:tabular-nums sm:v2:mt-0`}
            >
              {step.num}
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground v2:text-row v2:font-medium">{step.title}</p>
              <p className="mt-1 text-sm text-muted-foreground v2:mt-0.5 v2:text-row v2:text-secondary">{step.description}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="flex items-center justify-center gap-4 border-t px-6 py-5 text-center text-xs text-muted-foreground v2:border-border v2:text-meta max-md:v2:py-2">
        <span>© {new Date().getFullYear()} {ORG_NAME}</span>
        <span aria-hidden>·</span>
        <Link href="/investors" className={`hover:text-foreground transition-colors ${V2_TAP}`}>
          Investor access
        </Link>
      </footer>
    </div>
  );
}
