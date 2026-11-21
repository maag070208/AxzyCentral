import { Router } from "express";
import type { Device, Payment, Plan, Taqueria } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";
import { newDeviceCode } from "../lib/tokens";
import { planView } from "./plans";

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");
const toDate = (d: string) => new Date(`${d}T00:00:00.000Z`);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

const TaqueriaInput = z.object({
  name: z.string().trim().min(2).max(120),
  ownerName: optionalText(120),
  phone: optionalText(30),
  notes: optionalText(1000),
  planId: z.string().uuid().nullish(),
});
const TaqueriaUpdate = TaqueriaInput.partial().extend({ status: z.enum(["ACTIVE", "SUSPENDED"]).optional() });

const PaymentInput = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo AAAA-MM"),
  amount: z.number().positive().max(1_000_000),
  dueDate: DateOnly,
  notes: optionalText(500),
});
const PaymentUpdate = z.object({
  status: z.enum(["PENDING", "PAID", "CANCELLED"]).optional(),
  amount: z.number().positive().max(1_000_000).optional(),
  dueDate: DateOnly.optional(),
  method: optionalText(40),
  notes: optionalText(500),
});

const DeviceInput = z.object({ name: z.string().trim().min(1).max(60) });
const DeviceUpdate = z.object({ active: z.boolean() });

type Full = Taqueria & { plan: Plan | null; payments: Payment[]; devices: Device[] };

const paymentView = (p: Payment) => ({
  id: p.id,
  period: p.period,
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
  active: d.active,
  lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
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
    ownerName: t.ownerName,
    phone: t.phone,
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

const include = { plan: true, payments: true, devices: true } as const;

const findFull = async (id: string): Promise<Full> => {
  const t = await db.taqueria.findUnique({ where: { id }, include });
  if (!t) throw new HttpError(404, "TAQUERIA_NOT_FOUND", "Taquería no encontrada");
  return t;
};

const detail = (t: Full) => ({
  ...summary(t),
  payments: [...t.payments].sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime()).map(paymentView),
  devices: [...t.devices].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(deviceView),
});

/** Un plan dado de baja ya no se asigna (quien ya lo tiene lo conserva). */
const assertAssignable = async (planId: string | null | undefined, currentPlanId?: string | null) => {
  if (!planId || planId === currentPlanId) return;
  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new HttpError(404, "PLAN_NOT_FOUND", "Plan no encontrado");
  if (!plan.active) throw new HttpError(409, "PLAN_INACTIVE", "Ese plan está dado de baja");
};

export const taqueriasRouter = Router();

taqueriasRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await db.taqueria.findMany({ include, orderBy: { name: "asc" } });
    res.json(rows.map((t) => summary(t)));
  })
);

taqueriasRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = TaqueriaInput.parse(req.body);
    await assertAssignable(input.planId);
    const t = await db.taqueria.create({ data: { ...input, planId: input.planId ?? null }, include });
    res.status(201).json(detail(t));
  })
);

taqueriasRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(detail(await findFull(req.params.id)));
  })
);

taqueriasRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = TaqueriaUpdate.parse(req.body);
    const current = await findFull(req.params.id);
    if (input.planId !== undefined) await assertAssignable(input.planId, current.planId);
    const t = await db.taqueria.update({ where: { id: current.id }, data: input, include });
    res.json(detail(t));
  })
);

taqueriasRouter.post(
  "/:id/payments",
  asyncHandler(async (req, res) => {
    const input = PaymentInput.parse(req.body);
    const t = await findFull(req.params.id);
    await db.payment.create({
      data: { taqueriaId: t.id, period: input.period, amount: input.amount, dueDate: toDate(input.dueDate), notes: input.notes },
    });
    res.status(201).json(detail(await findFull(t.id)));
  })
);

taqueriasRouter.patch(
  "/:id/payments/:paymentId",
  asyncHandler(async (req, res) => {
    const input = PaymentUpdate.parse(req.body);
    const payment = await db.payment.findFirst({ where: { id: req.params.paymentId, taqueriaId: req.params.id } });
    if (!payment) throw new HttpError(404, "PAYMENT_NOT_FOUND", "Pago no encontrado");
    const status = input.status ?? payment.status;
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status,
        amount: input.amount,
        dueDate: input.dueDate ? toDate(input.dueDate) : undefined,
        method: input.method,
        notes: input.notes,
        paidAt: status === "PAID" ? payment.paidAt ?? new Date() : null,
      },
    });
    res.json(detail(await findFull(req.params.id)));
  })
);

taqueriasRouter.post(
  "/:id/devices",
  asyncHandler(async (req, res) => {
    const { name } = DeviceInput.parse(req.body);
    const t = await findFull(req.params.id);
    const { code, tokenHash } = newDeviceCode();
    const device = await db.device.create({ data: { taqueriaId: t.id, name, tokenHash } });
    res.status(201).json({ device: deviceView(device), code });
  })
);

/** Código nuevo para el mismo dispositivo; el anterior deja de servir de inmediato. */
taqueriasRouter.post(
  "/:id/devices/:deviceId/code",
  asyncHandler(async (req, res) => {
    const device = await db.device.findFirst({ where: { id: req.params.deviceId, taqueriaId: req.params.id } });
    if (!device) throw new HttpError(404, "DEVICE_NOT_FOUND", "Dispositivo no encontrado");
    const { code, tokenHash } = newDeviceCode();
    const updated = await db.device.update({ where: { id: device.id }, data: { tokenHash, active: true } });
    res.json({ device: deviceView(updated), code });
  })
);

taqueriasRouter.patch(
  "/:id/devices/:deviceId",
  asyncHandler(async (req, res) => {
    const { active } = DeviceUpdate.parse(req.body);
    const device = await db.device.findFirst({ where: { id: req.params.deviceId, taqueriaId: req.params.id } });
    if (!device) throw new HttpError(404, "DEVICE_NOT_FOUND", "Dispositivo no encontrado");
    await db.device.update({ where: { id: device.id }, data: { active } });
    res.json(detail(await findFull(req.params.id)));
  })
);
