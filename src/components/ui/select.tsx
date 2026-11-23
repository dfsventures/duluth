"use client";

import { cn } from "@/lib/utils";
import { forwardRef, useId } from "react";
import { FIELD_LABEL_V2 } from "@/components/ui/input";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

// The chevron, padding-right and appearance reset live in one global rule in
// src/app/globals.css (select:not([multiple]):not([size])), shared with bare
// <select> elements, so this component no longer draws its own overlay arrow.
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, id, children, ...props }, ref) => {
    // A label is tied to its field even when the caller passes no id (screen readers read it).
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={fieldId} className={cn("label", FIELD_LABEL_V2)}>
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={fieldId}
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
