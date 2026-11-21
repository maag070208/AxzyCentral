const DAY_MS = 24 * 60 * 60 * 1000;

/** Días después del vencimiento de un pago en que la app sigue abriendo sin conexión. */
export const GRACE_DAYS = 5;
/** Sin pagos pendientes registrados se asume el siguiente mes. */
export const DEFAULT_OFFLINE_DAYS = 35;
/** Ni con un pago vencido se deja menos que esto: suspender es decisión tuya. */
export const MIN_OFFLINE_DAYS = 3;
/** Tope para que un dispositivo que nunca se conecta termine por bloquearse. */
export const MAX_OFFLINE_DAYS = 45;

/**
 * Hasta cuándo la app puede seguir abriendo sin volver a consultar. En línea
 * manda `status`; esta fecha solo cuenta mientras la app no tiene internet.
 */
export const licenseValidUntil = (now: Date, status: "ACTIVE" | "SUSPENDED", nextDueDate: Date | null): Date => {
  if (status !== "ACTIVE") return now;
  const base = nextDueDate
    ? nextDueDate.getTime() + GRACE_DAYS * DAY_MS
    : now.getTime() + DEFAULT_OFFLINE_DAYS * DAY_MS;
  const min = now.getTime() + MIN_OFFLINE_DAYS * DAY_MS;
  const max = now.getTime() + MAX_OFFLINE_DAYS * DAY_MS;
  return new Date(Math.min(Math.max(base, min), max));
};
