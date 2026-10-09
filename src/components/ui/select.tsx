"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

// The chevron, padding-right and appearance reset live in one global rule in
// src/app/globals.css (select:not([multiple]):not([size])), shared with bare
// <select> elements, so this component no longer draws its own overlay arrow.
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
            className={cn("input-field", className)}
            {...props}
          >
            {children}
          </select>
        </div>
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
