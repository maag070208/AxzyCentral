import { Router } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";
import { licenseValidUntil } from "../lib/license-window";
import { bearerOf, hashCode } from "../lib/tokens";

export const licenseRouter = Router();

/**
 * Lo único que pide la app de la taquería (solo el teléfono de cocina), con su
 * código de activación. Suspendida responde 200 con `status: SUSPENDED` para
 * que la app se bloquee; código inexistente o revocado → 401.
 */
licenseRouter.get(
  "/",
  rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }),
  asyncHandler(async (req, res) => {
    const code = bearerOf(req.headers.authorization);
    if (!code) throw new HttpError(401, "TOKEN_MISSING", "Falta el código de activación");
    const device = await db.device.findUnique({
      where: { tokenHash: hashCode(code) },
      include: { taqueria: { include: { plan: true } } },
    });
    if (!device?.active) throw new HttpError(401, "INVALID_DEVICE_CODE", "Código inválido o revocado");

    const now = new Date();
    const [next] = await Promise.all([
      db.payment.findFirst({
        where: { taqueriaId: device.taqueriaId, status: "PENDING" },
        orderBy: { dueDate: "asc" },
        select: { dueDate: true },
      }),
      db.device.update({ where: { id: device.id }, data: { lastSeenAt: now } }),
    ]);
    const t = device.taqueria;
    const nextDueDate = next?.dueDate ?? null;
    res.set("Cache-Control", "no-store").json({
      status: t.status,
      tenant: { name: t.name },
      plan: t.plan ? { name: t.plan.name } : null,
      nextDueDate: nextDueDate ? nextDueDate.toISOString().slice(0, 10) : null,
      validUntil: licenseValidUntil(now, t.status, nextDueDate).toISOString(),
      serverTime: now.toISOString(),
    });
  })
);
