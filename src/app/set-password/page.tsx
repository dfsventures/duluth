import { Suspense } from "react";
import { AuthSkeleton } from "@/components/auth/auth-layout";
import { SetPasswordForm } from "./set-password-form";

// SUPPORT_EMAIL is server-only (no NEXT_PUBLIC_ prefix), so it is read here
// and passed down. Reading it inside the client component gave the server's
// value in the HTML and the fallback in the browser — a hydration mismatch.
export default function SetPasswordPage() {
  const supportEmail = process.env.SUPPORT_EMAIL || "support@dfs.vc";

  return (
    <Suspense fallback={<AuthSkeleton />}>
      <SetPasswordForm supportEmail={supportEmail} />
    </Suspense>
  );
}
