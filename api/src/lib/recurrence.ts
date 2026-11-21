/**
 * Fechas y periodos de los cobros recurrentes. Todo se maneja en UTC y con
 * fechas de calendario (`Date` a medianoche UTC), igual que las columnas
 * `@db.Date` de Prisma: nada de zonas horarias del servidor.
 */

/** Periodo `YYYY-MM` del mes de una fecha. */
export const periodOf = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

/** Suma meses a un periodo `YYYY-MM` (soporta cruces de año). */
export const periodPlusMonths = (period: string, months: number): string => {
  const [year, month] = period.split("-").map(Number);
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};

/**
 * Siguiente periodo a cobrar: un mes después del último cobro o, si el cliente
 * todavía no tiene cobros recurrentes, el mes actual.
 */
export const nextPeriod = (lastPeriod: string | null | undefined, now: Date): string =>
  lastPeriod ? periodPlusMonths(lastPeriod, 1) : periodOf(now);

/** Fecha de calendario (YYYY-MM-DD) de un `Date` UTC. */
export const dateOnly = (date: Date): string => date.toISOString().slice(0, 10);

/** `Date` a medianoche UTC de una fecha de calendario `YYYY-MM-DD`. */
export const fromDateOnly = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);

/**
 * Día de vencimiento acotado a 1..28: así el mismo día existe en todos los
 * meses (un cobro el 31 pasaría a vencer el 28).
 */
export const clampDueDay = (day: number): number => Math.min(Math.max(day, 1), 28);

/**
 * Vencimiento del siguiente cobro recurrente:
 * - con cobro anterior, el mismo día del mes (acotado a 1..28) en el periodo nuevo;
 * - sin cobro anterior, hoy.
 */
export const recurringDueDate = (period: string, previousDueDate: Date | null, now: Date): Date => {
  if (!previousDueDate) return fromDateOnly(dateOnly(now));
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, clampDueDay(previousDueDate.getUTCDate())));
};
