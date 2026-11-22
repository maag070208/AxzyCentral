/**
 * Respaldo del teléfono de cocina (público, con el código del dispositivo como Bearer).
 *
 * - `PUT /backup`: la cocina sube su estado completo (menú, cuentas abiertas y
 *   órdenes). Se guarda uno por dispositivo; uno más viejo que el guardado se ignora.
 * - `GET /backup`: cualquier dispositivo activo del mismo cliente lista los
 *   respaldos de sus cocinas (el más reciente primero) para recuperar uno.
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
      savedAt: at,
      appVersion: appVersion ?? null,
      state: state as Prisma.InputJsonObject,
      sizeBytes: Buffer.byteLength(JSON.stringify(state)),
    };
    const current = await db.backup.findUnique({ where: { deviceId: device.id }, select: { savedAt: true } });
    // Un teléfono viejo con reloj o datos atrasados no pisa uno más nuevo.
    const kept = current !== null && current.savedAt > at;
    if (!kept) {
      await db.backup.upsert({
        where: { deviceId: device.id },
        create: { ...data, deviceId: device.id, clientId: device.clientId },
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
    const backups = await db.backup.findMany({
      // También los de teléfonos revocados: el perdido es justo el que se quiere recuperar.
      where: { clientId: device.clientId },
      orderBy: { savedAt: "desc" },
      include: { device: { select: { name: true } } },
    });
    if (backups.length === 0) throw new HttpError(404, "NO_BACKUP", "Esta taquería todavía no tiene respaldo");
    res.set("Cache-Control", "no-store").json({
      backups: backups.map((b) => ({
        deviceId: b.deviceId,
        deviceName: b.device.name,
        fromThisDevice: b.deviceId === device.id,
        savedAt: b.savedAt.toISOString(),
        appVersion: b.appVersion,
        state: b.state,
      })),
    });
  })
);
