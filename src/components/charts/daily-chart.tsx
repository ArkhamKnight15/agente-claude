"use client";

import { useRef, useState } from "react";
import { DAILY_SERIES as SERIES } from "./daily-series";

interface Point {
  day: string;
  sent: number;
  replies: number;
}


function niceMax(value: number): number {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow * 4 >= value) ?? 10;
  return step * pow * 4;
}

function shortDate(day: string) {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

/** Duas séries na mesma unidade (contagem), um único eixo, crosshair com leitura de ambas. */
export function DailyChart({ data }: { data: Point[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 200;
  const pad = { top: 12, right: 36, bottom: 24, left: 32 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxY = niceMax(Math.max(...data.map((d) => Math.max(d.sent, d.replies)), 0));
  const x = (i: number) => pad.left + (data.length <= 1 ? 0 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / maxY) * innerH;
  const ticks = [0, maxY / 4, maxY / 2, (3 * maxY) / 4, maxY];

  const paths = SERIES.map((s) => ({
    ...s,
    d: data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[s.key]).toFixed(1)}`).join(" "),
  }));

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - pad.left) / innerW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  const last = data.length - 1;
  const point = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- setas do teclado percorrem os dias (equivalente ao crosshair). */}
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full touch-pan-y"
        role="img"
        aria-label={`Mensagens enviadas e respostas por dia nos últimos ${data.length} dias`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- foco habilita a navegação por setas.
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((h) => Math.min(last, (h ?? -1) + 1));
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? last + 1) - 1));
          if (e.key === "Escape") setHover(null);
        }}
        onBlur={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--fg-3)" className="tabular-nums">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="var(--chart-axis)" strokeWidth={1} />
        {[0, Math.floor(last / 2), last].map((i) =>
          data[i] ? (
            <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} fontSize={10} fill="var(--fg-3)">
              {shortDate(data[i].day)}
            </text>
          ) : null,
        )}
        {paths.map((s) => (
          <path key={s.key} d={s.d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* Valor final ao lado de cada linha */}
        {SERIES.map((s) =>
          data[last] ? (
            <g key={s.key}>
              <circle cx={x(last)} cy={y(data[last][s.key])} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              <text x={x(last) + 8} y={y(data[last][s.key])} dy="0.32em" fontSize={10} fill="var(--fg-2)" className="tabular-nums">
                {data[last][s.key]}
              </text>
            </g>
          ) : null,
        )}
        {hover !== null && point ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="var(--fg-3)" strokeWidth={1} />
            {SERIES.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(point[s.key])} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        ) : null}
      </svg>
      {hover !== null && point ? (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-card"
          style={{ left: `clamp(0px, calc(${(x(hover) / width) * 100}% - 80px), calc(100% - 170px))` }}
        >
          <p className="mb-1 text-fg-3">{shortDate(point.day)}</p>
          {SERIES.map((s) => (
            <p key={s.key} className="flex items-center gap-2">
              <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
              <strong className="text-13 font-semibold text-fg tabular-nums">{point[s.key]}</strong>
              <span className="text-fg-3">{s.label.toLowerCase()}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

