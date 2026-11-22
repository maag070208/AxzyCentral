/**
 * Ventas que reporta la app de cocina y sus métricas para la consola.
 *
 * - `POST /sales` (público, con el código del dispositivo como Bearer): la app
 *   manda cuentas ya cerradas en lotes. Cada cuenta se guarda una vez por
 *   dispositivo; un reenvío la reemplaza.
 * - `GET /clients/:id/sales/metrics?from&to` (consola): métricas de un cliente.
 * - `GET /sales-overview?from&to` (consola): todos los clientes contra el periodo anterior.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";
import { requireDeviceByCode } from "../lib/license";
import { salesMetrics, salesOverview } from "../lib/sales-metrics";
import { bearerOf } from "../lib/tokens";

export const salesRouter = Router();
export const clientSalesRouter = Router();
export const salesOverviewRouter = Router();

const Cents = z.number().int().min(-100_000_000).max(100_000_000);
const IsoDate = z.string().datetime({ offset: true });

const Ticket = z.object({
  id: z.string().trim().min(1).max(100),
  table: z.string().max(40),
  accountNumber: z.number().int().min(0).max(100_000),
  openedAt: IsoDate,
  closedAt: IsoDate.nullish(),
  utcOffsetMin: z.number().int().min(-840).max(840),
  cancelled: z.boolean(),
  totalCents: Cents,
  cashCents: Cents,
  transferCents: Cents,
  persons: z.number().int().min(0).max(500),
  prepSeconds: z.number().int().min(0).max(7 * 86_400).nullish(),
  lines: z
    .array(
      z.object({
        productId: z.string().max(100),
        name: z.string().max(120),
        variant: z.string().max(60).default(""),
        category: z.string().max(60).nullish(),
        qty: z.number().int().min(1).max(10_000),
        unitCents: z.number().int().min(0).max(10_000_000),
      })
    )
    .max(300),
});

const Upload = z.object({
  appVersion: z.string().trim().max(40).nullish(),
  tickets: z.array(Ticket).max(100),
});

salesRouter.post(
  "/",
  rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }),
  asyncHandler(async (req, res) => {
    const code = bearerOf(req.headers.authorization);
    if (!code) throw new HttpError(401, "TOKEN_MISSING", "Falta el código de activación");
    const device = await requireDeviceByCode(code);
    const { appVersion, tickets } = Upload.parse(req.body);

    await db.$transaction(async (tx) => {
      for (const t of tickets) {
        const data = {
          table: t.table,
          accountNumber: t.accountNumber,
          openedAt: new Date(t.openedAt),
          closedAt: t.closedAt ? new Date(t.closedAt) : null,
          utcOffsetMin: t.utcOffsetMin,
          cancelled: t.cancelled,
          totalCents: t.totalCents,
          cashCents: t.cashCents,
          transferCents: t.transferCents,
          persons: t.persons,
          prepSeconds: t.prepSeconds ?? null,
          appVersion: appVersion ?? null,
        };
        const sale = await tx.sale.upsert({
          where: { deviceId_externalId: { deviceId: device.id, externalId: t.id } },
          create: { ...data, clientId: device.clientId, deviceId: device.id, externalId: t.id },
          update: data,
          select: { id: true },
        });
        await tx.saleLine.deleteMany({ where: { saleId: sale.id } });
        if (t.lines.length > 0) {
          await tx.saleLine.createMany({
            data: t.lines.map((l) => ({ ...l, category: l.category ?? null, saleId: sale.id })),
          });
        }
      }
      await tx.device.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date(), appVersion: appVersion ?? undefined },
      });
    });
    res.set("Cache-Control", "no-store").json({ received: tickets.length });
  })
);

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");
const MetricsQuery = z
  .object({ from: DateOnly, to: DateOnly })
  .refine((q) => q.from <= q.to, "`from` debe ser antes de `to`")
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 400 * 86_400_000, "Máximo 400 días");

clientSalesRouter.get(
  "/:id/sales/metrics",
  asyncHandler(async (req, res) => {
    const { from, to } = MetricsQuery.parse(req.query);
    const client = await db.client.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!client) throw new HttpError(404, "NOT_FOUND", "No existe el cliente");
    // Un día de margen por lado: el rango es en hora local y se filtra con el offset de cada venta.
    const rows = await db.sale.findMany({
      where: {
        clientId: client.id,
        openedAt: { gte: new Date(Date.parse(from) - 86_400_000), lt: new Date(Date.parse(to) + 2 * 86_400_000) },
      },
      include: { lines: true },
    });
    res.json(salesMetrics(rows, from, to));
  })
);

salesOverviewRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to } = MetricsQuery.parse(req.query);
    const span = Date.parse(to) - Date.parse(from) + 86_400_000;
    const rows = await db.sale.findMany({
      where: { openedAt: { gte: new Date(Date.parse(from) - span - 86_400_000), lt: new Date(Date.parse(to) + 2 * 86_400_000) } },
      select: { clientId: true, openedAt: true, utcOffsetMin: true, cancelled: true, totalCents: true },
    });
    res.json(salesOverview(rows, from, to));
  })
);
