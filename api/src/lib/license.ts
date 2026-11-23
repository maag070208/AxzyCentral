import type { Client, Device, Plan, Product } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../errors";
import { licenseValidUntil } from "./license-window";
import { hashCode } from "./tokens";

/** Dispositivo con todo lo que exige el contrato de `GET /license`. */
export type LicenseDevice = Device & {
  client: Client & { plan: Plan | null; product: Product };
};

/** Lo que la app necesita del cliente para armar su licencia. */
export interface LicenseClient {
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  plan: { name: string; maxKitchens?: number | null; maxWaiters?: number | null } | null;
  product: {
    key: string;
    name: string;
    terms?: unknown;
    features?: unknown;
    latestVersionCode?: number | null;
    latestVersionName?: string | null;
    latestUrl?: string | null;
    latestNotes?: string | null;
  };
}

export interface LicenseBody {
  status: "ACTIVE" | "SUSPENDED";
  tenant: { name: string };
  /** Desde la versión multi-negocio también trae las palabras y partes del giro (las apps viejas las ignoran). */
  product: { key: string; name: string; terms: Record<string, unknown>; features: Record<string, unknown> };
  plan: { name: string } | null;
  nextDueDate: string | null;
  validUntil: string;
  serverTime: string;
  /** Lo que incluye el plan; null = ilimitado (sin plan también es ilimitado). */
  limits: { kitchens: number | null; waiters: number | null };
  /** Última versión publicada de la app; la app avisa si la suya es menor. */
  latestApp: { versionCode: number; versionName: string; url: string | null; notes: string | null } | null;
  /** Set de iconos del giro: la app lo baja de `GET /icon-set` cuando cambia la versión. */
  iconSet: { id: string; version: number } | null;
  /** Versión vigente del menú en la Central (null = todavía no tiene). */
  catalog: { version: number } | null;
}

/** Lo que cambia sin tocar el contrato viejo: set de iconos y versión del menú. */
export interface LicenseExtras {
  iconSet: { id: string; version: number } | null;
  catalogVersion: number | null;
}

const objectOr = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Cuerpo de `GET /license` (mismo contrato de siempre). Puro a propósito: las
 * fechas de validez se calculan con `licenseValidUntil` y se prueban sin BD.
 */
export const licenseBody = (
  t: LicenseClient,
  nextDueDate: Date | null,
  now: Date,
  extras: LicenseExtras = { iconSet: null, catalogVersion: null }
): LicenseBody => ({
  status: t.status,
  tenant: { name: t.name },
  product: { key: t.product.key, name: t.product.name, terms: objectOr(t.product.terms), features: objectOr(t.product.features) },
  plan: t.plan ? { name: t.plan.name } : null,
  nextDueDate: nextDueDate ? nextDueDate.toISOString().slice(0, 10) : null,
  validUntil: licenseValidUntil(now, t.status, nextDueDate).toISOString(),
  serverTime: now.toISOString(),
  limits: { kitchens: t.plan?.maxKitchens ?? null, waiters: t.plan?.maxWaiters ?? null },
  latestApp:
    t.product.latestVersionCode != null
      ? {
          versionCode: t.product.latestVersionCode,
          versionName: t.product.latestVersionName ?? String(t.product.latestVersionCode),
          url: t.product.latestUrl ?? null,
          notes: t.product.latestNotes ?? null,
        }
      : null,
  iconSet: extras.iconSet,
  catalog: extras.catalogVersion != null ? { version: extras.catalogVersion } : null,
});

/** Dispositivo dueño de un código de activación, con su cliente, plan y producto. */
export const findDeviceByCode = (code: string): Promise<LicenseDevice | null> =>
  db.device.findUnique({
    where: { tokenHash: hashCode(code) },
    include: { client: { include: { plan: true, product: true } } },
  });

/** Igual que `findDeviceByCode`, pero un código inexistente o revocado es 401. */
export const requireDeviceByCode = async (code: string): Promise<LicenseDevice> => {
  const device = await findDeviceByCode(code);
  if (!device?.active) throw new HttpError(401, "INVALID_DEVICE_CODE", "Código inválido o revocado");
  return device;
};

/** Vencimiento del cobro PENDING más antiguo: define la ventana sin internet. */
export const nextDueDateOf = async (clientId: string): Promise<Date | null> => {
  const next = await db.payment.findFirst({
    where: { clientId, status: "PENDING" },
    orderBy: { dueDate: "asc" },
    select: { dueDate: true },
  });
  return next?.dueDate ?? null;
};

/**
 * Respuesta de `GET /license`: marca `lastSeenAt` (y la versión de la app si la
 * manda en `X-App-Version`) y arma el cuerpo. Compartida
 * con `POST /activate` para no duplicar lógica (contrato §5.2).
 */
export const licensePayload = async (device: LicenseDevice, now: Date, appVersion?: string): Promise<LicenseBody> => {
  const setId = device.client.product.iconSetId;
  const [nextDueDate, , iconSet, catalog] = await Promise.all([
    nextDueDateOf(device.clientId),
    db.device.update({ where: { id: device.id }, data: { lastSeenAt: now, appVersion } }),
    setId ? db.iconSet.findUnique({ where: { id: setId }, select: { id: true, version: true } }) : null,
    db.catalogVersion.findFirst({ where: { clientId: device.clientId }, orderBy: { version: "desc" }, select: { version: true } }),
  ]);
  return licenseBody(device.client, nextDueDate, now, { iconSet, catalogVersion: catalog?.version ?? null });
};
