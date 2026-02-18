"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
      <p className="mb-1 font-medium text-destructive">Something went wrong</p>
      <p className="mb-4 text-sm text-muted-foreground">{error.message}</p>
      <Button variant="secondary" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
