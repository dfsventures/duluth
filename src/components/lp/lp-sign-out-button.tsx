"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LpSignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await fetch("/api/lp/auth/logout", { method: "POST" });
    } finally {
      router.push("/lp");
      router.refresh();
    }
  }

  return (
    <Button variant="secondary" size="sm" disabled={loading} onClick={handleSignOut}>
      {loading ? "Signing out…" : "Sign out"}
    </Button>
  );
}
