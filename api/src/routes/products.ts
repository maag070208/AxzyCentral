import { Router } from "express";
import { Prisma, type Product } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";
import { CatalogData, Features, Terms } from "../lib/giro";

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
  .extend({
    active: z.boolean().optional(),
    latestApp: LatestApp.optional(),
    terms: Terms.optional(),
    features: Features.optional(),
    /** Set de iconos del giro; null lo quita. */
    iconSetId: z.string().uuid().nullable().optional(),
    /** Menú base para clientes nuevos; null lo quita. */
    template: CatalogData.nullable().optional(),
  });

const latestData = (l: z.infer<typeof LatestApp> | undefined) =>
  l === undefined
    ? {}
    : {
        latestVersionCode: l?.versionCode ?? null,
        latestVersionName: l?.versionName ?? null,
        latestUrl: l?.url ?? null,
        latestNotes: l?.notes ?? null,
      };

type ProductWithSet = Product & { iconSet?: { id: string; name: string; version: number; _count: { icons: number } } | null };

const countOf = (template: Prisma.JsonValue | null, field: "products" | "categories") => {
  const list = template && typeof template === "object" && !Array.isArray(template) ? (template as Record<string, unknown>)[field] : null;
  return Array.isArray(list) ? list.length : 0;
};

export const productView = (p: ProductWithSet) => ({
  id: p.id,
  key: p.key,
  name: p.name,
  description: p.description,
  active: p.active,
  terms: p.terms,
  features: p.features,
  iconSet: p.iconSet ? { id: p.iconSet.id, name: p.iconSet.name, version: p.iconSet.version, icons: p.iconSet._count.icons } : null,
  template: p.template ? { categories: countOf(p.template, "categories"), products: countOf(p.template, "products") } : null,
  latestApp:
    p.latestVersionCode != null
      ? { versionCode: p.latestVersionCode, versionName: p.latestVersionName ?? "", url: p.latestUrl, notes: p.latestNotes }
      : null,
});

const iconSetInclude = { select: { id: true, name: true, version: true, _count: { select: { icons: true } } } } as const;

export const productsRouter = Router();

productsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const products = await db.product.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { clients: true, plans: true } }, iconSet: iconSetInclude },
    });
    res.json(products.map((p) => ({ ...productView(p), clients: p._count.clients, plans: p._count.plans })));
  })
);

productsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = ProductInput.parse(req.body);
    res.status(201).json(productView(await db.product.create({ data: input, include: { iconSet: iconSetInclude } })));
  })
);

/** La clave no se edita: las apps la usan para saber de qué producto son. */
productsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { latestApp, terms, features, iconSetId, template, ...input } = ProductUpdate.parse(req.body);
    const exists = await db.product.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    if (iconSetId) {
      const set = await db.iconSet.findUnique({ where: { id: iconSetId }, select: { id: true } });
      if (!set) throw new HttpError(404, "ICON_SET_NOT_FOUND", "Set de iconos no encontrado");
    }
    const updated = await db.product.update({
      where: { id: req.params.id },
      data: {
        ...input,
        ...latestData(latestApp),
        ...(terms !== undefined ? { terms } : {}),
        ...(features !== undefined ? { features } : {}),
        ...(iconSetId !== undefined ? { iconSetId } : {}),
        ...(template !== undefined ? { template: template === null ? Prisma.DbNull : (template as Prisma.InputJsonObject) } : {}),
      },
      include: { iconSet: iconSetInclude },
    });
    res.json(productView(updated));
  })
);

/** Menú base completo del giro, para editarlo en la consola. */
productsRouter.get(
  "/:id/template",
  asyncHandler(async (req, res) => {
    const p = await db.product.findUnique({ where: { id: req.params.id }, select: { template: true } });
    if (!p) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    res.json({ template: p.template });
  })
);
