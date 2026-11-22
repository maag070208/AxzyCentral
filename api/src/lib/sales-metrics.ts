/**
 * Métricas de ventas de un cliente a partir de las cuentas que reporta su app.
 * Puro a propósito (se prueba sin BD). Todo en hora local del negocio: cada
 * venta trae su `utcOffsetMin`. Montos en centavos.
 */

export interface SaleLineRow {
  name: string;
  variant: string;
  category: string | null;
  qty: number;
  unitCents: number;
}

export interface SaleRow {
  openedAt: Date;
  utcOffsetMin: number;
  cancelled: boolean;
  totalCents: number;
  cashCents: number;
  transferCents: number;
  persons: number;
  prepSeconds: number | null;
  lines: SaleLineRow[];
}

export interface Bucket {
  tickets: number;
  soldCents: number;
}

export interface ProductMetric {
  name: string;
  qty: number;
  soldCents: number;
  /** Parte de lo vendido (0–1). */
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
  /** Lo que gasta cada comensal en promedio (solo cuentas con personas). */
  averagePerPersonCents: number;
  averagePersons: number;
  /** Tacos y demás piezas por cuenta. */
  averageItems: number;
  prepSecondsAvg: number | null;
  prepSecondsP90: number | null;
  /** 24 horas locales, 0 = 00:00. */
  byHour: Bucket[];
  /** 0 = lunes … 6 = domingo. */
  byWeekday: Bucket[];
  byDay: (Bucket & { date: string })[];
  products: ProductMetric[];
  categories: ProductMetric[];
}

const DAY_MS = 86_400_000;

/** Fecha y hora "de pared" del local: se leen con los getters UTC. */
const localOf = (r: SaleRow) => new Date(r.openedAt.getTime() + r.utcOffsetMin * 60_000);
export const localDateOf = (r: SaleRow) => localOf(r).toISOString().slice(0, 10);

const emptyBucket = (): Bucket => ({ tickets: 0, soldCents: 0 });
const add = (b: Bucket, r: SaleRow) => {
  b.tickets += 1;
  b.soldCents += r.totalCents;
};
const avg = (sum: number, n: number) => (n === 0 ? 0 : Math.round(sum / n));

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];

const ranked = (groups: Map<string, { qty: number; soldCents: number }>, total: number): ProductMetric[] =>
  [...groups.entries()]
    .map(([name, g]) => ({ name, ...g, share: total === 0 ? 0 : g.soldCents / total }))
    .sort((a, b) => b.soldCents - a.soldCents || b.qty - a.qty || a.name.localeCompare(b.name));

/** `from` y `to` son fechas locales AAAA-MM-DD, inclusivas. */
export const salesMetrics = (rows: SaleRow[], from: string, to: string): SalesMetrics => {
  const inRange = rows.filter((r) => {
    const d = localDateOf(r);
    return d >= from && d <= to;
  });
  const sales = inRange.filter((r) => !r.cancelled);

  const byHour = Array.from({ length: 24 }, emptyBucket);
  const byWeekday = Array.from({ length: 7 }, emptyBucket);
  const days = new Map<string, Bucket>();
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
    days.set(new Date(t).toISOString().slice(0, 10), emptyBucket());
  }
  const products = new Map<string, { qty: number; soldCents: number }>();
  const categories = new Map<string, { qty: number; soldCents: number }>();
  const group = (m: typeof products, key: string, qty: number, cents: number) => {
    const g = m.get(key) ?? { qty: 0, soldCents: 0 };
    g.qty += qty;
    g.soldCents += cents;
    m.set(key, g);
  };

  let items = 0;
  for (const r of sales) {
    const local = localOf(r);
    add(byHour[local.getUTCHours()], r);
    add(byWeekday[(local.getUTCDay() + 6) % 7], r);
    const day = days.get(localDateOf(r));
    if (day) add(day, r);
    for (const l of r.lines) {
      items += l.qty;
      group(products, l.variant ? `${l.name} · ${l.variant}` : l.name, l.qty, l.qty * l.unitCents);
      group(categories, l.category ?? "Sin categoría", l.qty, l.qty * l.unitCents);
    }
  }

  const soldCents = sales.reduce((s, r) => s + r.totalCents, 0);
  const withPersons = sales.filter((r) => r.persons > 0);
  const persons = withPersons.reduce((s, r) => s + r.persons, 0);
  const prep = sales.flatMap((r) => (r.prepSeconds === null ? [] : [r.prepSeconds])).sort((a, b) => a - b);

  return {
    from,
    to,
    tickets: sales.length,
    cancelledTickets: inRange.length - sales.length,
    soldCents,
    cashCents: sales.reduce((s, r) => s + r.cashCents, 0),
    transferCents: sales.reduce((s, r) => s + r.transferCents, 0),
    averageTicketCents: avg(soldCents, sales.length),
    averagePerPersonCents: avg(
      withPersons.reduce((s, r) => s + r.totalCents, 0),
      persons
    ),
    averagePersons: sales.length === 0 ? 0 : Math.round((persons / Math.max(1, withPersons.length)) * 10) / 10,
    averageItems: sales.length === 0 ? 0 : Math.round((items / sales.length) * 10) / 10,
    prepSecondsAvg: prep.length === 0 ? null : avg(prep.reduce((s, x) => s + x, 0), prep.length),
    prepSecondsP90: prep.length === 0 ? null : percentile(prep, 0.9),
    byHour,
    byWeekday,
    byDay: [...days.entries()].map(([date, b]) => ({ date, ...b })),
    products: ranked(products, soldCents),
    categories: ranked(categories, soldCents),
  };
};

export interface OverviewRow {
  clientId: string;
  openedAt: Date;
  utcOffsetMin: number;
  cancelled: boolean;
  totalCents: number;
}

export interface SalesOverview {
  from: string;
  to: string;
  tickets: number;
  soldCents: number;
  /** Mismo número de días justo antes de `from`, para comparar. */
  previousSoldCents: number;
  previousTickets: number;
  byDay: (Bucket & { date: string })[];
  clients: { clientId: string; tickets: number; soldCents: number; averageTicketCents: number; lastSaleAt: string | null }[];
}

const shiftDate = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Resumen de todos los clientes: lo que se vendió en el periodo y contra el periodo anterior. */
export const salesOverview = (rows: OverviewRow[], from: string, to: string): SalesOverview => {
  const span = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
  const prevFrom = shiftDate(from, -span);
  const days = new Map<string, Bucket>();
  for (let i = 0; i < span; i++) days.set(shiftDate(from, i), emptyBucket());
  const clients = new Map<string, Bucket & { last: number }>();
  let tickets = 0;
  let sold = 0;
  let prevTickets = 0;
  let prevSold = 0;
  for (const r of rows) {
    if (r.cancelled) continue;
    const d = localDateOf(r as unknown as SaleRow);
    if (d >= prevFrom && d < from) {
      prevTickets += 1;
      prevSold += r.totalCents;
      continue;
    }
    if (d < from || d > to) continue;
    tickets += 1;
    sold += r.totalCents;
    const day = days.get(d);
    if (day) add(day, r as unknown as SaleRow);
    const c = clients.get(r.clientId) ?? { tickets: 0, soldCents: 0, last: 0 };
    c.tickets += 1;
    c.soldCents += r.totalCents;
    c.last = Math.max(c.last, r.openedAt.getTime());
    clients.set(r.clientId, c);
  }
  return {
    from,
    to,
    tickets,
    soldCents: sold,
    previousSoldCents: prevSold,
    previousTickets: prevTickets,
    byDay: [...days.entries()].map(([date, b]) => ({ date, ...b })),
    clients: [...clients.entries()]
      .map(([clientId, c]) => ({
        clientId,
        tickets: c.tickets,
        soldCents: c.soldCents,
        averageTicketCents: avg(c.soldCents, c.tickets),
        lastSaleAt: c.last ? new Date(c.last).toISOString() : null,
      }))
      .sort((a, b) => b.soldCents - a.soldCents),
  };
};
