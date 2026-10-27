"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import type { LeadStage, Priority } from "@/generated/prisma/enums";
import { PRIORITY_LABELS, STAGE_LABELS } from "@/data/labels";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { moveStageAction } from "@/server/actions/crm";

export interface BoardCard {
  id: string;
  name: string;
  city: string;
  state: string;
  stage: LeadStage;
  priority: Priority | null;
  score: number | null;
  nextTask: string | null;
  overdue: boolean;
  isDemo: boolean;
}

export function PipelineBoard({ columns, cards, canMove }: { columns: LeadStage[]; cards: BoardCard[]; canMove: boolean }) {
  const [optimistic, move] = useOptimistic(cards, (state, { id, stage }: { id: string; stage: LeadStage }) =>
    state.map((c) => (c.id === id ? { ...c, stage } : c)),
  );
  const [, startTransition] = useTransition();
  const toast = useToast();

  const moveTo = (id: string, stage: LeadStage) => {
    startTransition(async () => {
      move({ id, stage });
      const result = await moveStageAction(id, stage);
      if (result.ok === false) toast({ tone: "error", title: "Não foi possível mover", description: result.error });
    });
  };

  return (
    <div className="relative -mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
      <div className="grid auto-cols-[minmax(260px,1fr)] grid-flow-col gap-3">
        {columns.map((stage) => {
          const items = optimistic.filter((c) => c.stage === stage);
          return (
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- arrastar é atalho de mouse; o seletor "Mover para" é a alternativa por teclado.
            <section
              key={stage}
              aria-label={STAGE_LABELS[stage].label}
              className="flex min-h-64 flex-col rounded-xl border border-border bg-surface-2/60"
              onDragOver={(e) => canMove && e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/lead-id");
                if (id && canMove) moveTo(id, stage);
              }}
            >
              <header className="flex items-center justify-between px-3 py-2.5">
                <h2 className="text-13 font-semibold">{STAGE_LABELS[stage].label}</h2>
                <span className="rounded-full bg-surface-3 px-2 text-xs text-fg-2 tabular-nums">{items.length}</span>
              </header>
              <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {items.map((card) => (
                  // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- ver comentário da coluna.
                  <li
                    key={card.id}
                    draggable={canMove}
                    onDragStart={(e) => e.dataTransfer.setData("text/lead-id", card.id)}
                    className="group rounded-lg border border-border bg-surface p-3 shadow-xs transition-shadow hover:shadow-card"
                  >
                    <Link href={`/leads/${card.id}`} className="block text-13 leading-snug font-medium hover:text-accent">
                      {card.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-fg-3">{card.city}/{card.state}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {card.priority ? <Badge tone={PRIORITY_LABELS[card.priority].tone}>{PRIORITY_LABELS[card.priority].label} · {card.score}</Badge> : null}
                      {card.isDemo ? <Badge tone="warning">Demo</Badge> : null}
                    </div>
                    {card.nextTask ? (
                      <p className={cn("mt-2 flex items-start gap-1 text-xs", card.overdue ? "text-danger" : "text-fg-3")}>
                        <CalendarClock className="mt-0.5 size-3 shrink-0" aria-hidden /> {card.nextTask}
                      </p>
                    ) : null}
                    {canMove ? (
                      <label className="mt-2 block">
                        <span className="sr-only">Mover {card.name} para</span>
                        <select
                          value=""
                          onChange={(e) => e.target.value && moveTo(card.id, e.target.value as LeadStage)}
                          className="h-7 w-full rounded-md border border-border bg-surface-2 px-1.5 text-xs text-fg-2 opacity-100 focus:outline-2 focus:outline-ring sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                        >
                          <option value="">Mover para…</option>
                          {columns.filter((s) => s !== stage).map((s) => (
                            <option key={s} value={s}>{STAGE_LABELS[s].label}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </li>
                ))}
                {items.length === 0 ? <li className="grid flex-1 place-items-center rounded-lg border border-dashed border-border p-4 text-center text-xs text-fg-3">Arraste um lead para cá</li> : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
