import { Router } from "express";
import { Prisma } from "@prisma/client";
import type { Client, Payment, Plan, Product } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler } from "../errors";
import { dateOnly, nextPeriod, recurringDueDate } from "../lib/recurrence";

export const paymentsRouter = Router();
export const billingRouter = Router();

const PaymentsQuery = z.object({
  status: z.enum(["PENDING", "PAID", "CANCELLED"]).optional(),
  kind: z.enum(["RECURRING", "ONE_TIME"]).optional(),
  clientId: z.string().uuid().optional(),
});

type PaymentWithClient = Payment & { client: Client & { product: Product; plan: Plan | null } };

/** Fila de la pantalla global de cobros con el cliente, su producto y su plan. */
const paymentRow = (p: PaymentWithClient) => ({
  id: p.id,
  clientId: p.clientId,
  clientName: p.client.name,
  productName: p.client.product.name,
  planName: p.client.plan?.name ?? null,
  kind: p.kind,
  period: p.period,
  concept: p.concept,
  amount: p.amount.toFixed(2),
  dueDate: dateOnly(p.dueDate),
  status: p.status,
  paidAt: p.paidAt?.toISOString() ?? null,
  method: p.method,
});

/** Lista global de cobros, ordenada por vencimiento; filtros opcionales por estado, tipo y cliente. */
paymentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = PaymentsQuery.parse(req.query);
    const rows = await db.payment.findMany({
      where: { status: query.status, kind: query.kind, clientId: query.clientId },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      include: { client: { include: { product: true, plan: true } } },
    });
    res.json(rows.map(paymentRow));
  })
);

/**
 * Genera los cobros del mes de todos los clientes activos con plan recurrente
 * que no tengan ya un pendiente. Un cliente con pendiente cuenta como omitido;
 * los de plan único o sin plan no entran (se generan a mano desde su detalle).
 */
billingRouter.post(
  "/run",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const candidates = await db.client.findMany({
      where: { status: "ACTIVE", plan: { is: { billingType: "RECURRING" } } },
      include: { plan: true },
      orderBy: { name: "asc" },
    });
    const ids = candidates.map((c) => c.id);
    const pending = await db.payment.findMany({
      where: { clientId: { in: ids }, status: "PENDING" },
      select: { clientId: true },
    });
    const withPending = new Set(pending.map((p) => p.clientId));
    const lastRows =
      ids.length === 0
        ? []
        : await db.payment.findMany({
            where: { clientId: { in: ids }, kind: "RECURRING", period: { not: null } },
            select: { clientId: true, period: true, dueDate: true },
          });
    const lastByClient = new Map<string, { period: string; dueDate: Date }>();
    for (const row of lastRows) {
      const previous = lastByClient.get(row.clientId);
      if (row.period && (!previous || row.period > previous.period)) {
        lastByClient.set(row.clientId, { period: row.period, dueDate: row.dueDate });
      }
    }

    const charges: { clientId: string; clientName: string; period: string; dueDate: string; amount: string }[] = [];
    let skipped = 0;
    for (const client of candidates) {
      if (!client.plan) continue;
      if (withPending.has(client.id)) {
        skipped++;
        continue;
      }
      const last = lastByClient.get(client.id) ?? null;
      const period = nextPeriod(last?.period, now);
      const dueDate = recurringDueDate(period, last?.dueDate ?? null, now);
      try {
        await db.payment.create({
          data: { clientId: client.id, kind: "RECURRING", period, amount: client.plan.price, dueDate },
        });
      } catch (err) {
        // Otra corrida creó el mismo periodo entre la consulta y el alta: no se duplica.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          skipped++;
          continue;
        }
        throw err;
      }
      charges.push({
        clientId: client.id,
        clientName: client.name,
        period,
        dueDate: dateOnly(dueDate),
        amount: client.plan.price.toFixed(2),
      });
    }
    res.json({ created: charges.length, skipped, charges });
  })
);
