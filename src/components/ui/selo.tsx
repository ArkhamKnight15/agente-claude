import type { ReactNode } from "react";
import type { Tom } from "@/data/status";
import { cn } from "@/lib/cn";

const TONS: Record<Tom, string> = {
  neutro: "bg-surface-3 text-fg-2",
  info: "bg-info-soft text-info",
  sucesso: "bg-success-soft text-success",
  aviso: "bg-warning-soft text-warning",
  perigo: "bg-danger-soft text-danger",
  destaque: "bg-highlight-soft text-highlight",
};

export function Selo({ tom = "neutro", icone, children, className }: { tom?: Tom; icone?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-12 font-medium whitespace-nowrap [&_svg]:size-3.5", TONS[tom], className)}>
      {icone}
      {children}
    </span>
  );
}
