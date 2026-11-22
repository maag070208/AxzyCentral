import { Router } from "express";
import type { Product } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";

const ProductInput = z.object({
  key: z.string().trim().regex(/^[A-Z0-9_]{2,40}$/, "Clave en MAYÚSCULAS, números y guion bajo"),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullish().transform((v) => v || null),
});
const blankToNull = (v: string | null | undefined) => (v ? v : null);
/** Versión publicada de la app; null la quita (ya no se avisa). */
const LatestApp = z
  .object({
    versionCode: z.number().int().min(1).max(2_100_000_000),
    versionName: z.string().trim().min(1).max(40),
    url: z.string().trim().url("El enlace debe ser una URL").max(500).nullish().or(z.literal("")).transform(blankToNull),
    notes: z.string().trim().max(500).nullish().transform(blankToNull),
  })
  .nullable();
const ProductUpdate = ProductInput.omit({ key: true })
  .partial()
  .extend({ active: z.boolean().optional(), latestApp: LatestApp.optional() });

const latestData = (l: z.infer<typeof LatestApp> | undefined) =>
  l === undefined
    ? {}
    : {
        latestVersionCode: l?.versionCode ?? null,
        latestVersionName: l?.versionName ?? null,
        latestUrl: l?.url ?? null,
        latestNotes: l?.notes ?? null,
      };

export const productView = (p: Product) => ({
  id: p.id,
  key: p.key,
  name: p.name,
  description: p.description,
  active: p.active,
  latestApp:
    p.latestVersionCode != null
      ? { versionCode: p.latestVersionCode, versionName: p.latestVersionName ?? "", url: p.latestUrl, notes: p.latestNotes }
      : null,
});

export const productsRouter = Router();

productsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const products = await db.product.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { clients: true, plans: true } } },
    });
    res.json(products.map((p) => ({ ...productView(p), clients: p._count.clients, plans: p._count.plans })));
  })
);

productsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = ProductInput.parse(req.body);
    res.status(201).json(productView(await db.product.create({ data: input })));
  })
);

/** La clave no se edita: las apps la usan para saber de qué producto son. */
productsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { latestApp, ...input } = ProductUpdate.parse(req.body);
    const exists = await db.product.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    res.json(productView(await db.product.update({ where: { id: req.params.id }, data: { ...input, ...latestData(latestApp) } })));
  })
);
