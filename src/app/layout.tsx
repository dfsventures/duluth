import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ORG_NAME, ORG_FULL_NAME } from "@/lib/org";
import { SessionProvider } from "next-auth/react";
import { CompanyProvider } from "@/context/company-context";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["500", "600", "700"],
  display: "swap",
});

const ROOT_TITLE = `Molly | ${ORG_FULL_NAME} portfolio platform`;
const DESCRIPTION = `Molly is ${ORG_FULL_NAME}'s portfolio platform. Founders post investor updates, LPs read fund reports, and the ${ORG_NAME} team runs the portfolio. Sign in to continue.`;
const OG_ALT = `Molly, from ${ORG_FULL_NAME}`;

export const metadata: Metadata = {
  metadataBase: new URL("https://molly.dfs.vc"),
  title: { default: ROOT_TITLE, template: "%s | Molly" },
  description: DESCRIPTION,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/brand/molly-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/brand/molly-apple-touch-180.png",
  },
  openGraph: {
    type: "website",
    siteName: "Molly",
    title: ROOT_TITLE,
    description: DESCRIPTION,
    images: [{ url: "/brand/molly-og-card.png", width: 1200, height: 630, alt: OG_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: ROOT_TITLE,
    description: DESCRIPTION,
    images: ["/brand/molly-og-card.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-background antialiased">
        <SessionProvider>
          <CompanyProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </CompanyProvider>
        </SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
