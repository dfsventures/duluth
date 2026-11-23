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
  /**
   * A faint keyboard-shortcut hint inside the button ("A", "⌘↵"). Drawn only under the new
   * look; the old look never shows it. Decorative: it does not bind the key itself.
   */
  kbd?: string;
};

// Icon-only buttons must carry an accessible name.
export type ButtonProps = BaseProps &
  (
    | { size?: "sm" | "md" | "lg"; "aria-label"?: string }
    | { size: "icon"; "aria-label": string }
  );

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading = false, disabled, children, kbd, ...props }, ref) => {
    const hint = kbd ? (
      <kbd
        aria-hidden="true"
        className={cn(
          "hidden rounded-sm border border-current px-1 font-mono text-[11px] leading-4 v2:inline-block",
          variant === "primary" ? "opacity-90" : "border-[var(--color-border-hover)] text-muted-foreground"
        )}
      >
        {kbd}
      </kbd>
    ) : null;
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          // Hierarchy (decision 9): ONLY the primary button is mono caps.
          "relative inline-flex items-center justify-center gap-2 rounded-ctl transition-[color,background-color,border-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
          variant === "primary"
            ? "font-mono text-cta font-semibold uppercase tracking-cta"
            : "font-sans text-[13px] font-medium",
          // New look (PLAN-1, WS159): sentence case, 13px, medium; never wraps; icons never shrink.
          "v2:whitespace-nowrap v2:font-sans v2:text-row v2:font-medium v2:normal-case v2:tracking-normal v2:[&_svg]:shrink-0",
          {
            "bg-primary text-primary-foreground shadow-soft hover:bg-primary-hover hover:shadow-lift": variant === "primary",
            "border border-edge bg-btn2 text-foreground shadow-soft hover:border-[var(--color-border-hover)] hover:bg-muted v2:border-[var(--color-border-hover)]":
              variant === "secondary",
            "bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90":
              variant === "destructive",
            "hover:bg-muted hover:text-foreground": variant === "ghost",
            "text-primary underline-offset-4 hover:underline": variant === "link",
          },
          {
            "h-8 px-3 v2:h-8 max-md:v2:h-11": size === "sm",
            "h-9 px-5 v2:h-9 v2:px-4 max-md:v2:h-11": size === "md",
            "h-11 px-7 v2:h-10 v2:px-5 max-md:v2:h-11": size === "lg",
            "h-8 w-8 p-0 max-md:v2:h-11 max-md:v2:w-11": size === "icon",
          },
          className
        )}
        {...props}
      >
        {loading ? (
          <>
            <span className="invisible inline-flex items-center justify-center gap-2">
              {children}
              {hint}
            </span>
            <Loader2 aria-hidden="true" className="absolute h-3.5 w-3.5 animate-spin" />
          </>
        ) : (
          <>
            {children}
            {hint}
          </>
        )}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
