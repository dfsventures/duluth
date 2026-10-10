"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

type BaseProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children?: React.ReactNode;
  variant?: "primary" | "secondary" | "destructive" | "ghost" | "link";
  /**
   * Disables the button, shows a spinner and sets aria-busy. The label stays in
   * the layout (invisible) so the button does not change width.
   */
  loading?: boolean;
};

// Icon-only buttons must carry an accessible name.
export type ButtonProps = BaseProps &
  (
    | { size?: "sm" | "md" | "lg"; "aria-label"?: string }
    | { size: "icon"; "aria-label": string }
  );

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          // Hierarchy (decision 9): ONLY the primary button is mono caps.
          "relative inline-flex items-center justify-center gap-2 rounded-sm transition-[color,background-color,border-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
          variant === "primary"
            ? "font-mono text-label font-semibold uppercase tracking-label"
            : "font-sans text-[13px] font-medium",
          {
            "bg-primary text-primary-foreground hover:bg-primary-hover": variant === "primary",
            "border border-border bg-transparent text-foreground hover:border-[var(--color-border-hover)] hover:bg-muted":
              variant === "secondary",
            "bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90":
              variant === "destructive",
            "hover:bg-muted hover:text-foreground": variant === "ghost",
            "text-primary underline-offset-4 hover:underline": variant === "link",
          },
          {
            "h-8 px-3": size === "sm",
            "h-9 px-5": size === "md",
            "h-11 px-7": size === "lg",
            "h-8 w-8 p-0": size === "icon",
          },
          className
        )}
        {...props}
      >
        {loading ? (
          <>
            <span className="invisible inline-flex items-center justify-center gap-2">{children}</span>
            <Loader2 aria-hidden="true" className="absolute h-3.5 w-3.5 animate-spin" />
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
