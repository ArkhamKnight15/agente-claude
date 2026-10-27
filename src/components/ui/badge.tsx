import { cn } from "@/lib/cn";
import type { Tone } from "@/data/labels";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-2 ring-border",
  info: "bg-info-soft text-info ring-info/20",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-danger-soft text-danger ring-danger/20",
  accent: "bg-accent-soft text-accent-soft-fg ring-accent/20",
};

const dots: Record<Tone, string> = {
  neutral: "bg-fg-3",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 max-w-full items-center gap-1.5 truncate rounded-md px-2 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}
