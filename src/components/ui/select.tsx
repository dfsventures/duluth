"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

// Every native <select> in the app used to reuse the same hand-rolled
// className string as .input-field with no room reserved for the
// browser's own dropdown arrow, so it rendered flush against the right
// border (varies by browser/OS — not something plain padding can fix
// reliably). appearance-none plus this one explicit chevron, sized and
// positioned the same way Input's password-eye button is, fixes it for
// good and matches cross-browser instead of depending on native
// rendering. Model: src/components/ui/input.tsx.
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, id, children, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={id} className="label">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={id}
            className={cn("input-field appearance-none pr-9", className)}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
