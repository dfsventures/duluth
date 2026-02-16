import { cn } from "@/lib/utils";

interface BadgeProps {
  variant?: "success" | "warning" | "danger" | "info" | "neutral";
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        {
          "badge-success": variant === "success",
          "badge-warning": variant === "warning",
          "badge-danger": variant === "danger",
          "badge-info": variant === "info",
          "badge-neutral": variant === "neutral",
        },
        className
      )}
    >
      {children}
    </span>
  );
}
