"use client";

import { cn } from "@/lib/utils";
import { forwardRef, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

/**
 * New look only (admin surface): field labels read at 14px, like the field text. The 12px comes from the
 * unlayered `.label` rule in globals.css, which a plain utility of equal weight cannot beat, hence `!`.
 * Shared by Input, Textarea, Select and SectorCombobox; the old look and founder/LP pages are unchanged.
 */
export const FIELD_LABEL_V2 = "v2:!text-row";

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";
    const resolvedType = isPassword ? (showPassword ? "text" : "password") : type;
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
        <div className="relative">
          <input
            ref={ref}
            id={fieldId}
            type={resolvedType}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              "input-field",
              isPassword && "pr-10",
              error && "border-destructive focus-visible:ring-destructive",
              className
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        {error && (
          <p id={errorId} className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
