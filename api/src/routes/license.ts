import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";
import { licenseBody, licenseExtrasOf, licensePayload, nextDueDateOf, requireDeviceByCode } from "../lib/license";
import { bearerOf } from "../lib/tokens";

export const licenseRouter = Router();
export const activateRouter = Router();

/** Mismo límite en las dos rutas de la app, con contadores independientes. */
const rateLimitOptions = { windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false };
const licenseRateLimit = rateLimit(rateLimitOptions);
const activateRateLimit = rateLimit(rateLimitOptions);

const OptionalDeviceText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const ActivateInput = z.object({
  code: z.string().trim().min(1).max(200),
  device: z
    .object({
      /** El nombre se acota a 60 al adoptarlo; el modelo se guarda tal cual (tope sano). */
      name: OptionalDeviceText(200),
      model: OptionalDeviceText(200),
    })
    .optional(),
});

/**
 * Lo único que piden las apps de los clientes (p. ej. la tablet de cocina de
 * una taquería), con su código de activación. Suspendido responde 200 con
 * `status: SUSPENDED` para que la app se bloquee; código inexistente o
 * revocado → 401. `tenant` se llama así por compatibilidad con la app.
 */
licenseRouter.get(
  "/",
  licenseRateLimit,
  asyncHandler(async (req, res) => {
    const code = bearerOf(req.headers.authorization);
    if (!code) throw new HttpError(401, "TOKEN_MISSING", "Falta el código de activación");
    const device = await requireDeviceByCode(code);
    const version = req.header("x-app-version")?.trim().slice(0, 40) || undefined;
    res.set("Cache-Control", "no-store").json(await licensePayload(device, new Date(), version));
  })
);

/**
 * Activación desde la app: valida el código, da de alta el dispositivo
 * (`lastSeenAt`, `activatedAt` y `model` la primera vez) y responde lo mismo
 * que `GET /license` más el `device`. El nombre solo se adopta en la primera
 * activación real; después manda la consola.
 */
activateRouter.post(
  "/",
  activateRateLimit,
  asyncHandler(async (req, res) => {
    const { code, device: input } = ActivateInput.parse(req.body);
    const device = await requireDeviceByCode(code);
    const now = new Date();
    const firstActivation = device.activatedAt === null;
    const data: Prisma.DeviceUpdateInput = {
      lastSeenAt: now,
      activatedAt: device.activatedAt ?? now,
      model: device.model ?? input?.model ?? undefined,
      name: firstActivation && input?.name ? input.name.slice(0, 60) : undefined,
    };
    const [updated, nextDueDate, extras] = await Promise.all([
      db.device.update({ where: { id: device.id }, data, select: { id: true, name: true } }),
      nextDueDateOf(device.clientId),
      licenseExtrasOf(device.clientId, device.client.product.iconSetId),
    ]);
    // Igual que `GET /license`: la app recién activada ya sabe qué iconos bajar.
    res
      .set("Cache-Control", "no-store")
      .json({ ...licenseBody(device.client, nextDueDate, now, extras), device: { id: updated.id, name: updated.name } });
  })
);
