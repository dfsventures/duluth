"use client";

import { cn } from "@/lib/utils";
import { forwardRef, useId } from "react";
import { FIELD_LABEL_V2 } from "@/components/ui/input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    // A label is tied to its field even when the caller passes no id (screen readers read it).
    const autoId = useId();
    const fieldId = id ?? autoId;
    const errorId = `${fieldId}-error`;
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={fieldId} className={cn("label", FIELD_LABEL_V2)}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "input-field min-h-[80px]",
            error && "border-destructive focus-visible:ring-destructive",
            className
          )}
          {...props}
        />
        {error && (
          <p id={errorId} className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
