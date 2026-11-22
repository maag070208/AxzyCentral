import { Router } from "express";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler } from "../errors";

/** Vista de rol que comparten la tarjeta de usuarios y el catálogo (contrato §3). */
export const roleView = (role: Role) => ({
  id: role.id,
  key: role.key,
  name: role.name,
  permissions: Array.isArray(role.permissions) ? role.permissions : [],
  active: role.active,
});

export const rolesRouter = Router();

const RolesQuery = z.object({ productId: z.string().uuid() });

/** Catálogo del producto, activos e inactivos, ordenado por key. */
rolesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { productId } = RolesQuery.parse(req.query);
    const roles = await db.role.findMany({ where: { productId }, orderBy: { key: "asc" } });
    res.json(roles.map(roleView));
  })
);
