/**
 * Respaldo del teléfono de cocina (público, con el código del dispositivo como Bearer).
 *
 * - `PUT /backup`: la app sube su estado completo (menú, cuentas abiertas y
 *   órdenes). Se guarda uno por cliente; uno más viejo que el guardado se ignora.
 * - `GET /backup`: cualquier dispositivo activo del mismo cliente lo descarga
 *   para recuperar el día en un teléfono nuevo.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";
import { requireDeviceByCode } from "../lib/license";
import { bearerOf } from "../lib/tokens";

export const backupRouter = Router();

/** Tope del cuerpo de `PUT /backup` (el resto de la API usa 100 kB). */
export const BACKUP_LIMIT = "2mb";

const Upload = z.object({
  appVersion: z.string().trim().max(40).nullish(),
  savedAt: z.string().datetime({ offset: true }),
  state: z.record(z.unknown()),
});

const deviceOf = async (authorization: string | undefined) => {
  const code = bearerOf(authorization);
  if (!code) throw new HttpError(401, "TOKEN_MISSING", "Falta el código de activación");
  return requireDeviceByCode(code);
};

backupRouter.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));

backupRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const device = await deviceOf(req.headers.authorization);
    const { appVersion, savedAt, state } = Upload.parse(req.body);
    const at = new Date(savedAt);
    const data = {
      deviceId: device.id,
      savedAt: at,
      appVersion: appVersion ?? null,
      state: state as Prisma.InputJsonObject,
      sizeBytes: Buffer.byteLength(JSON.stringify(state)),
    };
    const current = await db.backup.findUnique({ where: { clientId: device.clientId }, select: { savedAt: true } });
    // Un teléfono viejo con reloj o datos atrasados no pisa uno más nuevo.
    const kept = current !== null && current.savedAt > at;
    if (!kept) {
      await db.backup.upsert({
        where: { clientId: device.clientId },
        create: { ...data, clientId: device.clientId },
        update: data,
      });
    }
    await db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), appVersion: appVersion ?? undefined } });
    res.set("Cache-Control", "no-store").json({ saved: !kept });
  })
);

backupRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const device = await deviceOf(req.headers.authorization);
    const backup = await db.backup.findUnique({
      where: { clientId: device.clientId },
      include: { device: { select: { name: true } } },
    });
    if (!backup) throw new HttpError(404, "NO_BACKUP", "Esta taquería todavía no tiene respaldo");
    res.set("Cache-Control", "no-store").json({
      savedAt: backup.savedAt.toISOString(),
      deviceName: backup.device.name,
      fromThisDevice: backup.deviceId === device.id,
      appVersion: backup.appVersion,
      state: backup.state,
    });
  })
);
