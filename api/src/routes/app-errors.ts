/**
 * Fallas de la app (cierres inesperados).
 *
 * - `POST /app-errors` (público, código del dispositivo como Bearer): la cocina
 *   manda las suyas y las de sus meseras. Cada una se guarda una vez por dispositivo e id.
 * - `GET /clients/:id/app-errors` (consola): las últimas de un cliente.
 * - `GET /app-errors/recent?days=7` (consola): cuántas hubo por cliente, para Inicio.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";
import { requireDeviceByCode } from "../lib/license";
import { bearerOf } from "../lib/tokens";

export const appErrorsRouter = Router();
export const clientAppErrorsRouter = Router();
export const recentAppErrorsRouter = Router();

const Report = z.object({
  id: z.string().trim().min(1).max(100),
  source: z.enum(["cocina", "mesero"]),
  appVersion: z.string().trim().max(40).nullish(),
  model: z.string().trim().max(80).nullish(),
  occurredAt: z.string().datetime({ offset: true }),
  message: z.string().max(500),
  stack: z.string().max(16_000),
});
const Upload = z.object({ errors: z.array(Report).max(20) });

appErrorsRouter.post(
  "/",
  rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }),
  asyncHandler(async (req, res) => {
    const code = bearerOf(req.headers.authorization);
    if (!code) throw new HttpError(401, "TOKEN_MISSING", "Falta el código de activación");
    const device = await requireDeviceByCode(code);
    const { errors } = Upload.parse(req.body);
    await db.appError.createMany({
      data: errors.map((e) => ({
        clientId: device.clientId,
        deviceId: device.id,
        externalId: e.id,
        source: e.source,
        appVersion: e.appVersion ?? null,
        model: e.model ?? null,
        occurredAt: new Date(e.occurredAt),
        message: e.message,
        stack: e.stack,
      })),
      skipDuplicates: true,
    });
    res.set("Cache-Control", "no-store").json({ received: errors.length });
  })
);

const view = (e: { id: string; source: string; appVersion: string | null; model: string | null; occurredAt: Date; message: string; stack: string; device: { name: string } }) => ({
  id: e.id,
  source: e.source,
  appVersion: e.appVersion,
  model: e.model,
  occurredAt: e.occurredAt.toISOString(),
  message: e.message,
  stack: e.stack,
  deviceName: e.device.name,
});

clientAppErrorsRouter.get(
  "/:id/app-errors",
  asyncHandler(async (req, res) => {
    const rows = await db.appError.findMany({
      where: { clientId: req.params.id },
      orderBy: { occurredAt: "desc" },
      take: 50,
      include: { device: { select: { name: true } } },
    });
    res.json(rows.map(view));
  })
);

recentAppErrorsRouter.get(
  "/recent",
  asyncHandler(async (req, res) => {
    const days = z.coerce.number().int().min(1).max(90).default(7).parse(req.query.days);
    const since = new Date(Date.now() - days * 86_400_000);
    const groups = await db.appError.groupBy({
      by: ["clientId"],
      where: { occurredAt: { gte: since } },
      _count: { _all: true },
      _max: { occurredAt: true },
    });
    const clients = await db.client.findMany({ where: { id: { in: groups.map((g) => g.clientId) } }, select: { id: true, name: true } });
    const nameOf = new Map(clients.map((c) => [c.id, c.name]));
    res.json(
      groups
        .map((g) => ({ clientId: g.clientId, name: nameOf.get(g.clientId) ?? "", count: g._count._all, lastAt: g._max.occurredAt?.toISOString() ?? null }))
        .sort((a, b) => b.count - a.count)
    );
  })
);
