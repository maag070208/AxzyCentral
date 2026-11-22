/**
 * Gráficas de ventas hechas a mano (sin librería): barras finas con remate
 * redondeado de 4 px, 2 px de aire entre barras, cuadrícula tenue, etiqueta
 * directa solo en el máximo y tooltip al pasar el mouse. Cada gráfica trae su
 * tabla oculta para lectores de pantalla.
 */
import { useState, type ReactNode } from "react";
import { LuArrowDownRight, LuArrowUpRight } from "react-icons/lu";
import { pct } from "../sales";

export interface BarDatum {
  key: string;
  /** Etiqueta del eje X (puede omitirse en algunas barras para no amontonar). */
  label: string;
  value: number;
  /** Texto del tooltip, p. ej. "sáb 21 nov". */
  title: string;
  detail?: string;
}

/** Tres marcas "bonitas" del eje Y (0, mitad, tope). */
const niceMax = (max: number) => {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * pow >= max) ?? 10;
  return step * pow;
};

export function BarChart({
  data,
  format,
  height = 180,
  labelEvery = 1,
  ariaLabel,
}: {
  data: BarDatum[];
  format: (v: number) => string;
  height?: number;
  labelEvery?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.value));
  // Aire arriba para la etiqueta del máximo.
  const top = niceMax(max * 1.15);
  const peak = max > 0 ? data.findIndex((d) => d.value === max) : -1;
  const ticks = [top, top / 2, 0];

  return (
    <div className="relative">
      <div className="flex gap-2" style={{ height }} role="img" aria-label={ariaLabel}>
        {/* Eje Y */}
        <div className="flex w-12 shrink-0 flex-col justify-between pb-0 text-right font-mono text-[10px] text-slate-400 dark:text-slate-500">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
              {format(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {/* Cuadrícula tenue */}
          {ticks.map((t, i) => (
            <div
              key={t}
              className={`absolute inset-x-0 border-t ${i === ticks.length - 1 ? "border-slate-300 dark:border-slate-600" : "border-dashed border-slate-100 dark:border-slate-800"}`}
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => {
              const h = top === 0 ? 0 : (d.value / top) * 100;
              const active = hover === i;
              return (
                <div
                  key={d.key}
                  className="relative flex h-full min-w-0 flex-1 items-end justify-center"
                  onMouseEnter={() => setHover(i)}
                >
                  {i === peak && hover === null && (
                    <span
                      className="pointer-events-none absolute z-10 -translate-y-full whitespace-nowrap pb-1 font-mono text-[10.5px] font-semibold text-slate-700 dark:text-slate-200"
                      style={{ bottom: `${h}%` }}
                    >
                      {format(d.value)}
                    </span>
                  )}
                  <div
                    className="w-full max-w-[28px] rounded-t-[4px] transition-[height,opacity] duration-500"
                    style={{
                      height: d.value > 0 ? `max(${h}%, 2px)` : 0,
                      background: "var(--viz-bar)",
                      opacity: hover === null || active ? 1 : 0.45,
                    }}
                  />
                  {active && (
                    <div
                      className="pointer-events-none absolute z-20 w-max max-w-[180px] -translate-y-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900"
                      style={{
                        bottom: `${Math.min(h, 85)}%`,
                        left: i > data.length / 2 ? undefined : "50%",
                        right: i > data.length / 2 ? "50%" : undefined,
                      }}
                    >
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{d.title}</p>
                      <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{format(d.value)}</p>
                      {d.detail && <p className="text-[11px] text-slate-500 dark:text-slate-400">{d.detail}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* Eje X */}
      <div className="ml-14 mt-1.5 flex gap-[2px]">
        {data.map((d, i) => (
          <span key={d.key} className="relative h-3.5 min-w-0 flex-1">
            {i % labelEvery === 0 && (
              <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] leading-none text-slate-400 dark:text-slate-500">
                {d.label}
              </span>
            )}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.title}</th>
              <td>{format(d.value)}</td>
              {d.detail && <td>{d.detail}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ranking horizontal: nombre, barra proporcional al primero, importe y porcentaje. */
export function ShareList({
  rows,
  format,
  sub,
}: {
  rows: { name: string; value: number; share: number; sub?: string }[];
  format: (v: number) => string;
  sub?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <li key={r.name} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="w-4 shrink-0 text-right font-mono text-[10.5px] text-slate-400 dark:text-slate-500">{i + 1}</span>
              <span className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">{r.name}</span>
              {r.sub && <span className="hidden shrink-0 text-[11px] text-slate-400 sm:inline dark:text-slate-500">{r.sub}</span>}
            </span>
            <span className="shrink-0 text-[13px] tabular-nums text-slate-900 dark:text-white">
              {format(r.value)}
              <span className="ml-1.5 inline-block w-11 text-right text-[11px] text-slate-500 dark:text-slate-400">{pct(r.share)}</span>
            </span>
          </div>
          <div className="ml-6 mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(r.value / max) * 100}%`, background: "var(--viz-bar)" }} />
          </div>
        </li>
      ))}
      {sub && <p className="ml-6 text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </ol>
  );
}

/** Barra partida en dos (efectivo / transferencia) con leyenda y montos. */
export function SplitBar({
  parts,
  format,
}: {
  parts: { label: string; value: number; color: string }[];
  format: (v: number) => string;
}) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={parts.map((p) => `${p.label} ${format(p.value)}`).join(", ")}>
        {parts.map((p) =>
          p.value > 0 ? <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null
        )}
        {total === 0 && <div className="w-full bg-slate-100 dark:bg-slate-800" />}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.color }} />
              {p.label}
            </span>
            <span className="tabular-nums text-slate-900 dark:text-white">
              {format(p.value)}
              <span className="ml-1.5 inline-block w-11 text-right text-[11px] text-slate-500 dark:text-slate-400">
                {total ? pct(p.value / total) : "—"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Cambio contra el periodo anterior con flecha y texto (nunca solo color). */
export function Delta({ value, suffix = "vs. periodo anterior" }: { value: number | null; suffix?: string }): ReactNode {
  if (value === null) return <span className="text-slate-500 dark:text-slate-400">Sin periodo anterior para comparar</span>;
  const up = value >= 0;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center gap-0.5 font-semibold ${up ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
      >
        {up ? <LuArrowUpRight size={13} /> : <LuArrowDownRight size={13} />}
        {up ? "+" : "−"}
        {pct(Math.abs(value))}
      </span>
      <span className="text-slate-500 dark:text-slate-400">{suffix}</span>
    </span>
  );
}
