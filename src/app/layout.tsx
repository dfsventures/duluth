import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "next-auth/react";

export const metadata: Metadata = {
  title: "DFS Lab Portfolio",
  description: "DFS Lab portfolio management platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
