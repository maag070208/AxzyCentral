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
