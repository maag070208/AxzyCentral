import { Router } from "express";
import type { Plan, Product } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";

const BillingType = z.enum(["RECURRING", "ONE_TIME"]);

/** Cuántos incluye el plan; null = ilimitados. */
const Limit = z.number().int().min(1).max(1_000).nullable();

const PlanInput = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  billingType: BillingType.default("RECURRING"),
  price: z.number().min(0).max(1_000_000),
  maxKitchens: Limit.default(null),
  maxWaiters: Limit.default(null),
});
/** Sin `default` en `billingType`: un PATCH que no lo manda no debe tocar el tipo. */
const PlanUpdate = z
  .object({
    name: z.string().trim().min(2).max(80),
    billingType: BillingType,
    price: z.number().min(0).max(1_000_000),
    active: z.boolean(),
    maxKitchens: Limit,
    maxWaiters: Limit,
  })
  .partial();

export const planView = (p: Plan & { product?: Product }) => ({
  id: p.id,
  productId: p.productId,
  productName: p.product?.name ?? null,
  name: p.name,
  price: p.price.toFixed(2),
  billingType: p.billingType,
  maxKitchens: p.maxKitchens,
  maxWaiters: p.maxWaiters,
  active: p.active,
});

export const plansRouter = Router();

plansRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;
    const plans = await db.plan.findMany({
      where: productId ? { productId } : undefined,
      orderBy: [{ active: "desc" }, { productId: "asc" }, { price: "asc" }],
      include: { product: true, _count: { select: { clients: true } } },
    });
    res.json(plans.map((p) => ({ ...planView(p), clients: p._count.clients })));
  })
);

plansRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = PlanInput.parse(req.body);
    const product = await db.product.findUnique({ where: { id: input.productId } });
    if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    res.status(201).json(planView(await db.plan.create({ data: input, include: { product: true } })));
  })
);

/** El producto de un plan no cambia: dejaría clientes con un plan de otro producto. */
plansRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = PlanUpdate.parse(req.body);
    const exists = await db.plan.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) throw new HttpError(404, "PLAN_NOT_FOUND", "Plan no encontrado");
    res.json(planView(await db.plan.update({ where: { id: req.params.id }, data: input, include: { product: true } })));
  })
);
