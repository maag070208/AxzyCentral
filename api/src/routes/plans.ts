import { Router } from "express";
import type { Plan } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";

const PlanInput = z.object({
  name: z.string().trim().min(2).max(80),
  monthlyPrice: z.number().min(0).max(1_000_000),
});
const PlanUpdate = PlanInput.partial().extend({ active: z.boolean().optional() });

export const planView = (p: Plan) => ({
  id: p.id,
  name: p.name,
  monthlyPrice: p.monthlyPrice.toFixed(2),
  active: p.active,
});

export const plansRouter = Router();

plansRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const plans = await db.plan.findMany({
      orderBy: [{ active: "desc" }, { monthlyPrice: "asc" }],
      include: { _count: { select: { taquerias: true } } },
    });
    res.json(plans.map((p) => ({ ...planView(p), taquerias: p._count.taquerias })));
  })
);

plansRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = PlanInput.parse(req.body);
    res.status(201).json(planView(await db.plan.create({ data: input })));
  })
);

plansRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = PlanUpdate.parse(req.body);
    const exists = await db.plan.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) throw new HttpError(404, "PLAN_NOT_FOUND", "Plan no encontrado");
    res.json(planView(await db.plan.update({ where: { id: req.params.id }, data: input })));
  })
);
