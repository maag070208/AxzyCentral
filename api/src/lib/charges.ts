import type { PaymentKind, Plan, Prisma } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../errors";
import { dateOnly, fromDateOnly, nextPeriod, recurringDueDate } from "./recurrence";

/** Lo que puede mandar la consola al generar un cobro; todo es opcional. */
export interface ChargeInput {
  /** Si no viene, se usa el precio del plan. */
  amount?: number;
  /** Fecha `YYYY-MM-DD`; solo la usan los cobros únicos. */
  dueDate?: string;
  concept?: string | null;
}

export interface ChargeData {
  kind: PaymentKind;
  period: string | null;
  amount: Prisma.Decimal | number;
  dueDate: Date;
  concept: string | null;
}

/** Día de calendario de hoy en UTC, para los cobros que vencen hoy. */
const today = (now: Date): Date => fromDateOnly(dateOnly(now));

/**
 * Plan `ONE_TIME`: un solo cobro por cliente. En cuanto existe cualquier cobro
 * único (aunque esté pagado o cancelado) ya no se genera otro.
 */
const oneTimeCharge = async (clientId: string, plan: Plan, input: ChargeInput, now: Date): Promise<ChargeData> => {
  const already = await db.payment.findFirst({ where: { clientId, kind: "ONE_TIME" }, select: { id: true } });
  if (already) throw new HttpError(409, "ALREADY_CHARGED", "Este cliente ya tiene su cobro único");
  return {
    kind: "ONE_TIME",
    period: null,
    amount: input.amount ?? plan.price,
    dueDate: input.dueDate ? fromDateOnly(input.dueDate) : today(now),
    concept: input.concept ?? plan.name,
  };
};

/**
 * Plan `RECURRING`: el siguiente mes del último periodo cobrado (o el actual si
 * es el primero), con el mismo día de vencimiento acotado a 1..28. Nunca se
 * genera si ya hay un cobro PENDING: así no se duplican cobros.
 */
const recurringCharge = async (clientId: string, plan: Plan, input: ChargeInput, now: Date): Promise<ChargeData> => {
  const pending = await db.payment.findFirst({ where: { clientId, status: "PENDING" }, select: { id: true } });
  if (pending) throw new HttpError(409, "CHARGE_PENDING", "Ya hay un cobro pendiente para este cliente");
  const last = await db.payment.findFirst({
    where: { clientId, kind: "RECURRING", period: { not: null } },
    orderBy: { period: "desc" },
    select: { period: true, dueDate: true },
  });
  const period = nextPeriod(last?.period, now);
  return {
    kind: "RECURRING",
    period,
    amount: input.amount ?? plan.price,
    dueDate: recurringDueDate(period, last?.dueDate ?? null, now),
    concept: input.concept ?? null,
  };
};

/** Siguiente cobro según el plan del cliente (contrato §5.5). Lanza 409 si no aplica. */
export const nextChargeFor = async (
  client: { id: string; plan: Plan | null },
  input: ChargeInput,
  now: Date
): Promise<ChargeData> => {
  if (!client.plan) throw new HttpError(409, "PLAN_REQUIRED", "El cliente no tiene plan; asigna uno para generar cobros");
  return client.plan.billingType === "ONE_TIME"
    ? oneTimeCharge(client.id, client.plan, input, now)
    : recurringCharge(client.id, client.plan, input, now);
};
