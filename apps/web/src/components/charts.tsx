"use client";

import { useRef, useState } from "react";

/** Single-hue ordinal ramp for the brand blue (validated: monotone, one hue, light end >= 2:1). */
export const FUNNEL_RAMP = ["#7f98d9", "#5f7bc7", "#4562b3", "#2f4c9c", "#1a3585", "#122766"];

const GRID = "#e3e8f1";
const ACCENT = "var(--forest)";

function niceStep(rough: number) {
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1))));
  const fraction = rough / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

function formatDay(date: string, long = false) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    ...(long ? { weekday: "long" } : {}),
    timeZone: "UTC",
  });
}

export type DayPoint = { date: string; count: number };

/** One series over time: 2px line, 10% area wash, end dot, crosshair + tooltip, keyboard stepping. */
export function AreaChart({ data, unit }: { data: DayPoint[]; unit: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const W = 640;
  const H = 230;
  const m = { l: 34, r: 14, t: 14, b: 28 };
  const innerW = W - m.l - m.r;
  const innerH = H - m.t - m.b;

  const max = Math.max(...data.map((point) => point.count), 1);
  const step = niceStep(max / 3);
  const yMax = Math.max(step * Math.ceil(max / step), step);
  const ticks: number[] = [];
  for (let value = 0; value <= yMax; value += step) ticks.push(value);

  const x = (index: number) => m.l + (data.length <= 1 ? innerW / 2 : (index / (data.length - 1)) * innerW);
  const y = (value: number) => m.t + innerH - (value / yMax) * innerH;

  const line = data.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.count).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;

  const labelCount = Math.min(5, data.length);
  const labelIndexes = Array.from({ length: labelCount }, (_, i) => Math.round((i / Math.max(labelCount - 1, 1)) * (data.length - 1)));

  function indexFromPointer(clientX: number) {
    const svg = ref.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const ratio = (px - m.l) / innerW;
    return Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1))));
  }

  const point = active != null ? data[active] : null;
  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-forest/30"
        role="img"
        tabIndex={0}
        aria-label={`${total} ${unit} sur ${data.length} jours. Flèches gauche et droite pour parcourir.`}
        onPointerMove={(event) => setActive(indexFromPointer(event.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((current) => current ?? data.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setActive((current) => Math.max(0, (current ?? data.length - 1) - 1));
          if (event.key === "ArrowRight") setActive((current) => Math.min(data.length - 1, (current ?? 0) + 1));
        }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={m.l} x2={W - m.r} y1={y(tick)} y2={y(tick)} stroke={GRID} strokeWidth={1} />
            <text x={m.l - 8} y={y(tick) + 4} textAnchor="end" fontSize={11} fill="var(--sage)">
              {tick}
            </text>
          </g>
        ))}
        {labelIndexes.map((index) => (
          <text
            key={index}
            x={x(index)}
            y={H - 8}
            textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
            fontSize={11}
            fill="var(--sage)"
          >
            {formatDay(data[index].date)}
          </text>
        ))}

        <path d={area} fill={ACCENT} opacity={0.1} />
        <path d={line} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {point && active != null ? (
          <line x1={x(active)} x2={x(active)} y1={m.t} y2={m.t + innerH} stroke="var(--sage)" strokeWidth={1} opacity={0.5} />
        ) : null}

        {/* end dot, or the hovered dot: r=4, 2px surface ring */}
        {(() => {
          const index = active ?? data.length - 1;
          return (
            <circle cx={x(index)} cy={y(data[index].count)} r={4} fill={ACCENT} stroke="#ffffff" strokeWidth={2} />
          );
        })()}
      </svg>

      {point && active != null ? (
        <div
          className="pointer-events-none absolute z-10 min-w-[120px] rounded-lg border border-line bg-white px-3 py-2 shadow-md"
          style={{
            left: `${(x(active) / W) * 100}%`,
            top: 0,
            transform: `translateX(${active > data.length * 0.65 ? "-105%" : "8px"})`,
          }}
        >
          <p className="text-lg font-bold leading-none text-ink">{point.count}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-sage">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: ACCENT }} />
            {unit}
          </p>
          <p className="mt-1 text-xs capitalize text-sage">{formatDay(point.date, true)}</p>
        </div>
      ) : null}
    </div>
  );
}

export type FunnelRow = { stage: string; label: string; reached: number; current: number };

/** Horizontal bars, one per stage, on one baseline. Bars <= 20px, 4px rounded data end. */
export function FunnelBars({ rows }: { rows: FunnelRow[] }) {
  const top = Math.max(rows[0]?.reached ?? 0, 1);
  return (
    <ul className="space-y-3">
      {rows.map((row, index) => {
        const previous = index === 0 ? null : rows[index - 1].reached;
        const rate = previous == null || previous === 0 ? null : Math.round((row.reached / previous) * 100);
        const width = (row.reached / top) * 100;
        return (
          <li key={row.stage} className="group relative" tabIndex={0}>
            <div className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-sm text-ink">{row.label}</span>
              <div className="relative h-5 flex-1">
                <div
                  className="h-5 rounded-r-[4px] transition-[width,filter] duration-700 ease-out group-hover:brightness-110 group-focus:brightness-110"
                  style={{ width: `${width}%`, minWidth: row.reached > 0 ? 4 : 0, background: FUNNEL_RAMP[index % FUNNEL_RAMP.length] }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-sm">
                <strong className="font-semibold text-ink">{row.reached}</strong>
                {rate != null ? <span className="ml-1.5 text-xs text-sage">{rate}%</span> : null}
              </span>
            </div>
            <div className="pointer-events-none absolute left-32 top-7 z-10 hidden rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-md group-hover:block group-focus:block">
              <p className="text-sm font-semibold text-ink">{row.label}</p>
              <p className="mt-0.5 text-sage">{row.reached} candidature{row.reached > 1 ? "s" : ""} ont atteint cette étape</p>
              <p className="text-sage">{row.current} y sont actuellement</p>
              {rate != null ? <p className="text-sage">{rate} % de l&apos;étape précédente</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** One ratio against its limit: accent fill on a lighter step of the same ramp. */
export function Meter({ value, label }: { value: number | null; label: string }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full"
      style={{ background: "#e1e8f6" }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? 0}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${value ?? 0}%`, background: ACCENT }}
      />
    </div>
  );
}
