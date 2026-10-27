"use client";

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface ChartCardProps {
  title: string;
  description?: React.ReactNode;
  chart: React.ReactNode;
  table: React.ReactNode;
  legend?: React.ReactNode;
  className?: string;
  empty?: React.ReactNode;
}

/** Cartão de gráfico com alternância para a visualização em tabela (acessível). */
export function ChartCard({ title, description, chart, table, legend, className, empty }: ChartCardProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-13 text-fg-3">{description}</p> : null}
        </div>
        {!empty ? (
          <div className="flex shrink-0 rounded-lg border border-border bg-surface-2 p-0.5" role="group" aria-label="Modo de visualização">
            {(
              [
                ["chart", "Gráfico", BarChart3],
                ["table", "Tabela", Table2],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                aria-label={`Ver como ${label.toLowerCase()}`}
                title={label}
                className={cn("grid size-6 place-items-center rounded-md text-fg-3 transition-colors hover:text-fg", view === key && "bg-surface text-fg shadow-xs")}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {legend && view === "chart" && !empty ? <div className="px-5 pt-3">{legend}</div> : null}
      <div className="flex-1 px-5 pt-3 pb-5">{empty ? empty : view === "chart" ? chart : table}</div>
    </Card>
  );
}

export function LegendItem({ color, label, shape = "rect" }: { color: string; label: string; shape?: "rect" | "line" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-2">
      {shape === "line" ? (
        <span className="h-0.5 w-3.5 rounded-full" style={{ background: color }} aria-hidden />
      ) : (
        <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden />
      )}
      {label}
    </span>
  );
}

export function MiniTable({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-13">
        <thead>
          <tr className="border-b border-border text-left text-xs text-fg-3">
            {headers.map((h, i) => (
              <th key={h} scope="col" className={cn("py-2 font-medium", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={cn("py-2", j > 0 && "text-right tabular-nums")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
