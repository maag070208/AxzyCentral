/** Ventas que reportan las apps de los clientes (contrato en docs/CONTRATO-VENTAS.md). */
import { api } from "./api";
import { isoDate } from "./shared";

export interface Bucket {
  tickets: number;
  soldCents: number;
}

export interface ShareMetric {
  name: string;
  qty: number;
  soldCents: number;
  share: number;
}

export interface SalesMetrics {
  from: string;
  to: string;
  tickets: number;
  cancelledTickets: number;
  soldCents: number;
  cashCents: number;
  transferCents: number;
  averageTicketCents: number;
  averagePerPersonCents: number;
  averagePersons: number;
  averageItems: number;
  prepSecondsAvg: number | null;
  prepSecondsP90: number | null;
  byHour: Bucket[];
  byWeekday: Bucket[];
  byDay: (Bucket & { date: string })[];
  products: ShareMetric[];
  categories: ShareMetric[];
}

export interface SalesOverview {
  from: string;
  to: string;
  tickets: number;
  soldCents: number;
  previousSoldCents: number;
  previousTickets: number;
  byDay: (Bucket & { date: string })[];
  clients: { clientId: string; tickets: number; soldCents: number; averageTicketCents: number; lastSaleAt: string | null }[];
}

export const salesMetrics = (clientId: string, from: string, to: string) =>
  api<SalesMetrics>("GET", `/clients/${clientId}/sales/metrics?from=${from}&to=${to}`);

export const salesOverview = (from: string, to: string) => api<SalesOverview>("GET", `/sales-overview?from=${from}&to=${to}`);

/* ---------------- Periodos ---------------- */

export type PeriodKey = "7d" | "30d" | "month" | "lastMonth";

export const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "month", label: "Este mes" },
  { value: "lastMonth", label: "Mes pasado" },
];

/** Rango de fechas locales (inclusivo) de un periodo y el mismo número de días justo antes. */
export function periodRange(key: PeriodKey, now = new Date()): { from: string; to: string; prevFrom: string; prevTo: string } {
  const day = (y: number, m: number, d: number) => new Date(y, m, d);
  const y = now.getFullYear();
  const m = now.getMonth();
  let from: Date;
  let to: Date;
  if (key === "7d" || key === "30d") {
    to = day(y, m, now.getDate());
    from = day(y, m, now.getDate() - (key === "7d" ? 6 : 29));
  } else if (key === "month") {
    from = day(y, m, 1);
    to = day(y, m, now.getDate());
  } else {
    from = day(y, m - 1, 1);
    to = day(y, m, 0);
  }
  const span = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const prevTo = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1);
  const prevFrom = new Date(prevTo.getFullYear(), prevTo.getMonth(), prevTo.getDate() - span + 1);
  return { from: isoDate(from), to: isoDate(to), prevFrom: isoDate(prevFrom), prevTo: isoDate(prevTo) };
}

/* ---------------- Formato ---------------- */

export const pesos = (cents: number) =>
  (cents / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

export const pct = (share: number) => `${(share * 100).toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`;

/** Cambio contra el periodo anterior; null si antes no hubo nada con qué comparar. */
export const change = (now: number, before: number) => (before > 0 ? (now - before) / before : null);

export const minutes = (seconds: number | null) =>
  seconds === null ? "—" : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")} min`;

export const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const WEEKDAYS_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

export const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" });

/** Frases para el cliente a partir de sus números. Solo las que tienen datos suficientes. */
export function insightsOf(m: SalesMetrics): string[] {
  const out: string[] = [];
  if (m.tickets === 0) return out;
  const hours = m.byHour.map((b, h) => ({ h, ...b })).filter((b) => b.tickets > 0);
  const peak = [...hours].sort((a, b) => b.soldCents - a.soldCents)[0];
  if (peak) {
    out.push(
      `La hora fuerte es de ${hourLabel(peak.h)} a ${hourLabel((peak.h + 1) % 24)}: ahí entra el ${pct(peak.soldCents / m.soldCents)} de lo vendido.`
    );
  }
  const days = m.byWeekday.map((b, d) => ({ d, ...b })).filter((b) => b.soldCents > 0);
  if (days.length >= 2) {
    const best = days.reduce((a, b) => (b.soldCents > a.soldCents ? b : a));
    const worst = days.reduce((a, b) => (b.soldCents < a.soldCents ? b : a));
    if (worst.soldCents > 0 && best.d !== worst.d) {
      out.push(
        `El ${WEEKDAYS_LONG[best.d]} vende ${(best.soldCents / worst.soldCents).toLocaleString("es-MX", { maximumFractionDigits: 1 })} veces lo del ${WEEKDAYS_LONG[worst.d]}.`
      );
    }
  }
  const star = m.products[0];
  if (star) out.push(`${star.name} es el ${pct(star.share)} de las ventas (${star.qty.toLocaleString("es-MX")} piezas).`);
  if (m.prepSecondsP90 !== null && m.prepSecondsAvg !== null) {
    out.push(`Una orden sale de cocina en ${minutes(m.prepSecondsAvg)} en promedio; 1 de cada 10 tarda más de ${minutes(m.prepSecondsP90)}.`);
  }
  return out;
}


/* ---------------- Meses ---------------- */

/** "2026-11" del mes pasado (el reporte se arma con meses ya cerrados). */
export const lastMonthKey = (now = new Date()) => {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Rango del mes "AAAA-MM" y del mes anterior completo. Un mes en curso termina hoy. */
export function monthRange(key: string, now = new Date()) {
  const [y, m] = key.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const end = last > now ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : last;
  const prevFirst = new Date(y, m - 2, 1);
  const prevLast = new Date(y, m - 1, 0);
  return {
    from: isoDate(first),
    to: isoDate(end),
    prevFrom: isoDate(prevFirst),
    prevTo: isoDate(prevLast),
    label: first.toLocaleDateString("es-MX", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase()),
    prevLabel: prevFirst.toLocaleDateString("es-MX", { month: "long" }),
    partial: last > now,
  };
}

/** Últimos [n] meses como opciones "AAAA-MM", del más reciente al más viejo. */
export const recentMonths = (n: number, now = new Date()) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("es-MX", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase()),
    };
  });
