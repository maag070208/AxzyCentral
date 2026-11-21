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
  plan: { name: string } | null;
  product: { key: string; name: string };
}

export interface LicenseBody {
  status: "ACTIVE" | "SUSPENDED";
  tenant: { name: string };
  product: { key: string; name: string };
  plan: { name: string } | null;
  nextDueDate: string | null;
  validUntil: string;
  serverTime: string;
}

/**
 * Cuerpo de `GET /license` (mismo contrato de siempre). Puro a propósito: las
 * fechas de validez se calculan con `licenseValidUntil` y se prueban sin BD.
 */
export const licenseBody = (t: LicenseClient, nextDueDate: Date | null, now: Date): LicenseBody => ({
  status: t.status,
  tenant: { name: t.name },
  product: { key: t.product.key, name: t.product.name },
  plan: t.plan ? { name: t.plan.name } : null,
  nextDueDate: nextDueDate ? nextDueDate.toISOString().slice(0, 10) : null,
  validUntil: licenseValidUntil(now, t.status, nextDueDate).toISOString(),
  serverTime: now.toISOString(),
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
 * Respuesta de `GET /license`: marca `lastSeenAt` y arma el cuerpo. Compartida
 * con `POST /activate` para no duplicar lógica (contrato §5.2).
 */
export const licensePayload = async (device: LicenseDevice, now: Date): Promise<LicenseBody> => {
  const [nextDueDate] = await Promise.all([
    nextDueDateOf(device.clientId),
    db.device.update({ where: { id: device.id }, data: { lastSeenAt: now } }),
  ]);
  return licenseBody(device.client, nextDueDate, now);
};
