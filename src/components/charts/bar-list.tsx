"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Texto exibido na ponta da barra (padrão: o valor). */
  display?: string;
  /** Linhas extras do tooltip. */
  detail?: string;
  /** Barras sem amostra suficiente ficam esmaecidas. */
  muted?: boolean;
}

/**
 * Barras horizontais de série única: espessura máxima de 16px, ponta arredondada (4px)
 * e base reta, valor na ponta, tooltip por barra (hover e foco de teclado).
 */
export function BarList({ data, max, ariaLabel }: { data: BarDatum[]; max?: number; ariaLabel: string }) {
  const [active, setActive] = useState<string | null>(null);
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5" aria-label={ariaLabel}>
      {data.map((d) => {
        const pct = top > 0 ? Math.max(d.value > 0 ? 1.5 : 0, (d.value / top) * 100) : 0;
        const isActive = active === d.key;
        return (
          <li
            key={d.key}
            className="relative grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]"
            onPointerEnter={() => setActive(d.key)}
            onPointerLeave={() => setActive(null)}
          >
            <span className="truncate text-13 text-fg-2" title={d.label}>
              {d.label}
            </span>
            <span
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- o foco por teclado exibe o tooltip da barra.
              tabIndex={0}
              onFocus={() => setActive(d.key)}
              onBlur={() => setActive(null)}
              className="flex h-6 items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={`${d.label}: ${d.display ?? d.value}${d.detail ? `. ${d.detail}` : ""}`}
            >
              <span className="relative h-4 flex-1">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-r-[4px] bg-series-1 transition-[width,opacity] duration-500",
                    d.muted && "opacity-35",
                    isActive && "brightness-110",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="w-14 shrink-0 text-right text-13 font-medium text-fg tabular-nums">{d.display ?? d.value.toLocaleString("pt-BR")}</span>
            </span>
            {isActive && d.detail ? (
              <span
                role="tooltip"
                className="pointer-events-none absolute right-16 bottom-full z-10 mb-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-card"
              >
                <strong className="block text-13 font-semibold text-fg">{d.display ?? d.value}</strong>
                <span className="text-fg-3">{d.label} · {d.detail}</span>
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
