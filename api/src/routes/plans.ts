import { Router } from "express";
import type { Plan, Product } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";

const PlanInput = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  monthlyPrice: z.number().min(0).max(1_000_000),
});
const PlanUpdate = PlanInput.omit({ productId: true }).partial().extend({ active: z.boolean().optional() });

export const planView = (p: Plan & { product?: Product }) => ({
  id: p.id,
  productId: p.productId,
  productName: p.product?.name ?? null,
  name: p.name,
  monthlyPrice: p.monthlyPrice.toFixed(2),
  active: p.active,
});

export const plansRouter = Router();

plansRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;
    const plans = await db.plan.findMany({
      where: productId ? { productId } : undefined,
      orderBy: [{ active: "desc" }, { monthlyPrice: "asc" }],
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
