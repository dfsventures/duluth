import Link from "next/link";
import { Mail, ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/ui/logo-mark";
import { ORG_NAME } from "@/lib/org";

export default function InvestorsPage() {
  const supportEmail = process.env.SUPPORT_EMAIL || "support@dfs.vc";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <Link href="/">
          <LogoMark className="text-lg" />
        </Link>
        <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
      </header>

      {/* Content */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(91,141,197,0.12) 0%, transparent 70%)",
          }}
        />

        <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-primary">
          For Investors
        </p>
        <h1 className="mb-4 max-w-2xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Investor access works through secure links.
        </h1>
        <p className="mb-2 max-w-lg text-base text-muted-foreground">
          You don&apos;t need an account. Founders and the {ORG_NAME} team share updates
          with you directly by email using a tokenized link — if you&apos;ve received
          one, open it to view the update.
        </p>
        <p className="mb-8 max-w-lg text-base text-muted-foreground">
          Links can expire. If yours doesn&apos;t load, ask your contact to send you
          a fresh one.
        </p>

        <a
          href={`mailto:${supportEmail}`}
          className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-card px-6 font-mono text-xs font-semibold uppercase tracking-widest text-foreground shadow-sm hover:bg-muted transition-colors"
        >
          <Mail className="h-3.5 w-3.5" />
          Contact {supportEmail}
        </a>
      </main>

      {/* Footer */}
      <footer className="border-t px-6 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {ORG_NAME}
      </footer>
    </div>
  );
}
