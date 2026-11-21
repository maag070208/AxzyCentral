import { Router } from "express";
import { Prisma } from "@prisma/client";
import type { Client, Device, Payment, Plan, Product } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";
import { nextChargeFor } from "../lib/charges";
import { dateOnly, fromDateOnly } from "../lib/recurrence";
import { newDeviceCode } from "../lib/tokens";
import { planView } from "./plans";
import { productView } from "./products";

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");
const toDate = fromDateOnly;
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

const ClientFields = z.object({
  name: z.string().trim().min(2).max(120),
  contactName: optionalText(120),
  phone: optionalText(30),
  email: z.string().trim().email("Correo inválido").max(160).nullish().or(z.literal("")).transform((v) => v || null),
  notes: optionalText(1000),
  planId: z.string().uuid().nullish(),
});
const ClientInput = ClientFields.extend({ productId: z.string().uuid() });
/** El producto no se cambia: sus planes y licencias son de ese producto. */
const ClientUpdate = ClientFields.partial().extend({ status: z.enum(["ACTIVE", "SUSPENDED"]).optional() });

const Period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo AAAA-MM");

/**
 * Cobro manual. `period` es obligatorio en los recurrentes y en los únicos se
 * ignora (viven sin periodo; el unique `(clientId, period)` no choca porque
 * varios NULL conviven en PostgreSQL).
 */
const PaymentInput = z
  .object({
    kind: z.enum(["RECURRING", "ONE_TIME"]).default("RECURRING"),
    period: Period.optional(),
    amount: z.number().positive().max(1_000_000),
    dueDate: DateOnly,
    concept: optionalText(200),
    notes: optionalText(500),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "RECURRING" && !value.period) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["period"], message: "Periodo AAAA-MM requerido para cobros recurrentes" });
    }
  });
const PaymentUpdate = z.object({
  status: z.enum(["PENDING", "PAID", "CANCELLED"]).optional(),
  amount: z.number().positive().max(1_000_000).optional(),
  dueDate: DateOnly.optional(),
  concept: optionalText(200),
  method: optionalText(40),
  notes: optionalText(500),
});

/** Datos opcionales para `payments/generate`; sin ellos manda el plan. */
const GenerateInput = z.object({
  amount: z.number().positive().max(1_000_000).optional(),
  dueDate: DateOnly.optional(),
  concept: optionalText(200),
});

const DeviceInput = z.object({ name: z.string().trim().min(1).max(60) });
const DeviceUpdate = z.object({ active: z.boolean() });

type Full = Client & { product: Product; plan: Plan | null; payments: Payment[]; devices: Device[] };

export const paymentView = (p: Payment) => ({
  id: p.id,
  kind: p.kind,
  period: p.period,
  concept: p.concept,
  amount: p.amount.toFixed(2),
  dueDate: dateOnly(p.dueDate),
  status: p.status,
  paidAt: p.paidAt?.toISOString() ?? null,
  method: p.method,
  notes: p.notes,
});

const deviceView = (d: Device) => ({
  id: d.id,
  name: d.name,
  model: d.model,
  active: d.active,
  lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
  activatedAt: d.activatedAt?.toISOString() ?? null,
  createdAt: d.createdAt.toISOString(),
});

/** Resumen para la lista: estado, plan, siguiente pago, si debe y última conexión de cocina. */
const summary = (t: Full, today = dateOnly(new Date())) => {
  const nextDue = t.payments
    .filter((p) => p.status === "PENDING")
    .map((p) => dateOnly(p.dueDate))
    .sort()[0] ?? null;
  const seen = t.devices.map((d) => d.lastSeenAt?.getTime() ?? 0).filter(Boolean);
  return {
    id: t.id,
    name: t.name,
    product: productView(t.product),
    contactName: t.contactName,
    phone: t.phone,
    email: t.email,
    notes: t.notes,
    status: t.status,
    plan: t.plan ? planView(t.plan) : null,
    nextDueDate: nextDue,
    overdue: nextDue !== null && nextDue < today,
    devices: { total: t.devices.length, active: t.devices.filter((d) => d.active).length },
    lastSeenAt: seen.length ? new Date(Math.max(...seen)).toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
};

const include = { product: true, plan: true, payments: true, devices: true } as const;

const findFull = async (id: string): Promise<Full> => {
  const t = await db.client.findUnique({ where: { id }, include });
  if (!t) throw new HttpError(404, "CLIENT_NOT_FOUND", "Cliente no encontrado");
  return t;
};

const detail = (t: Full) => ({
  ...summary(t),
  payments: [...t.payments].sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime()).map(paymentView),
  devices: [...t.devices].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(deviceView),
});

/** El plan debe ser del producto del cliente; uno dado de baja ya no se asigna (quien lo tiene lo conserva). */
const assertAssignable = async (productId: string, planId: string | null | undefined, currentPlanId?: string | null) => {
  if (!planId || planId === currentPlanId) return;
  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new HttpError(404, "PLAN_NOT_FOUND", "Plan no encontrado");
  if (plan.productId !== productId) throw new HttpError(409, "PLAN_PRODUCT_MISMATCH", "Ese plan es de otro producto");
  if (!plan.active) throw new HttpError(409, "PLAN_INACTIVE", "Ese plan está dado de baja");
};

/** El unique `(clientId, period)` es el que impide dos cobros del mismo mes. */
const isPeriodConflict = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

const createPayment = async (data: Prisma.PaymentUncheckedCreateInput) => {
  try {
    return await db.payment.create({ data });
  } catch (err) {
    if (isPeriodConflict(err)) throw new HttpError(409, "PAYMENT_PERIOD_EXISTS", "Ese periodo ya tiene un cobro para este cliente");
    throw err;
  }
};

export const clientsRouter = Router();

clientsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;
    const rows = await db.client.findMany({ where: productId ? { productId } : undefined, include, orderBy: { name: "asc" } });
    res.json(rows.map((t) => summary(t)));
  })
);

clientsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = ClientInput.parse(req.body);
    const product = await db.product.findUnique({ where: { id: input.productId } });
    if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    if (!product.active) throw new HttpError(409, "PRODUCT_INACTIVE", "Ese producto está dado de baja");
    await assertAssignable(input.productId, input.planId);
    const t = await db.client.create({ data: { ...input, planId: input.planId ?? null }, include });
    res.status(201).json(detail(t));
  })
);

clientsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(detail(await findFull(req.params.id)));
  })
);

clientsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = ClientUpdate.parse(req.body);
    const current = await findFull(req.params.id);
    if (input.planId !== undefined) await assertAssignable(current.productId, input.planId, current.planId);
    const t = await db.client.update({ where: { id: current.id }, data: input, include });
    res.json(detail(t));
  })
);

clientsRouter.post(
  "/:id/payments",
  asyncHandler(async (req, res) => {
    const input = PaymentInput.parse(req.body);
    const t = await findFull(req.params.id);
    await createPayment({
      clientId: t.id,
      kind: input.kind,
      period: input.kind === "RECURRING" ? input.period! : null,
      concept: input.concept,
      amount: input.amount,
      dueDate: toDate(input.dueDate),
      notes: input.notes,
    });
    res.status(201).json(detail(await findFull(t.id)));
  })
);

/** Genera el siguiente cobro según el plan del cliente (recurrente o único). */
clientsRouter.post(
  "/:id/payments/generate",
  asyncHandler(async (req, res) => {
    const input = GenerateInput.parse(req.body);
    const t = await findFull(req.params.id);
    const charge = await nextChargeFor(t, input, new Date());
    await createPayment({ clientId: t.id, ...charge });
    res.status(201).json(detail(await findFull(t.id)));
  })
);

clientsRouter.patch(
  "/:id/payments/:paymentId",
  asyncHandler(async (req, res) => {
    const input = PaymentUpdate.parse(req.body);
    const payment = await db.payment.findFirst({ where: { id: req.params.paymentId, clientId: req.params.id } });
    if (!payment) throw new HttpError(404, "PAYMENT_NOT_FOUND", "Pago no encontrado");
    const status = input.status ?? payment.status;
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status,
        amount: input.amount,
        dueDate: input.dueDate ? toDate(input.dueDate) : undefined,
        concept: input.concept,
        method: input.method,
        notes: input.notes,
        paidAt: status === "PAID" ? payment.paidAt ?? new Date() : null,
      },
    });
    res.json(detail(await findFull(req.params.id)));
  })
);

clientsRouter.post(
  "/:id/devices",
  asyncHandler(async (req, res) => {
    const { name } = DeviceInput.parse(req.body);
    const t = await findFull(req.params.id);
    const { code, tokenHash } = newDeviceCode();
    const device = await db.device.create({ data: { clientId: t.id, name, tokenHash } });
    res.status(201).json({ device: deviceView(device), code });
  })
);

/** Código nuevo para el mismo dispositivo; el anterior deja de servir de inmediato. */
clientsRouter.post(
  "/:id/devices/:deviceId/code",
  asyncHandler(async (req, res) => {
    const device = await db.device.findFirst({ where: { id: req.params.deviceId, clientId: req.params.id } });
    if (!device) throw new HttpError(404, "DEVICE_NOT_FOUND", "Dispositivo no encontrado");
    const { code, tokenHash } = newDeviceCode();
    const updated = await db.device.update({ where: { id: device.id }, data: { tokenHash, active: true } });
    res.json({ device: deviceView(updated), code });
  })
);

clientsRouter.patch(
  "/:id/devices/:deviceId",
  asyncHandler(async (req, res) => {
    const { active } = DeviceUpdate.parse(req.body);
    const device = await db.device.findFirst({ where: { id: req.params.deviceId, clientId: req.params.id } });
    if (!device) throw new HttpError(404, "DEVICE_NOT_FOUND", "Dispositivo no encontrado");
    await db.device.update({ where: { id: device.id }, data: { active } });
    res.json(detail(await findFull(req.params.id)));
  })
);
