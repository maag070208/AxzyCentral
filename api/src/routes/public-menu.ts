import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import { asyncHandler } from "../errors";
import { renderMenu, renderUnavailable, type MenuInfo } from "../lib/public-menu";

/**
 * Menú digital público, sin sesión: `/m/:slug` (la página) y `/m/:slug/i/:key.png` (sus iconos).
 * Solo existe si el cliente está activo, lo tiene encendido y la Central ya tiene su menú.
 */
export const publicMenuRouter = Router();

// Un QR en cada mesa y el WiFi del local (una IP): cada visita nueva pide la página y ~30 iconos.
publicMenuRouter.use(rateLimit({ windowMs: 60_000, limit: 1200, standardHeaders: true, legacyHeaders: false }));

// La página no lleva JavaScript ni nada de fuera: solo sus estilos y sus iconos.
publicMenuRouter.use((_req, res, next) => {
  res.set(
    "Content-Security-Policy",
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );
  next();
});

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const findMenu = (slug: string) =>
  SLUG.test(slug)
    ? db.client.findFirst({
        where: { menuSlug: slug, menuEnabled: true, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          menuInfo: true,
          product: { select: { name: true, features: true, iconSetId: true } },
          devices: { where: { active: true }, select: { lastSeenAt: true } },
        },
      })
    : Promise.resolve(null);

const unavailable = (res: Response) => res.status(404).type("html").set("Cache-Control", "no-store").send(renderUnavailable());

publicMenuRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const client = await findMenu(req.params.slug);
    const catalog = client && (await db.catalogVersion.findFirst({ where: { clientId: client.id }, orderBy: { version: "desc" } }));
    if (!client || !catalog) return void unavailable(res);
    const icons = client.product.iconSetId
      ? await db.icon.findMany({ where: { setId: client.product.iconSetId }, select: { key: true, sha: true } })
      : [];
    const seen = client.devices.map((d) => d.lastSeenAt?.getTime() ?? 0).filter(Boolean);
    const features = (client.product.features ?? {}) as Record<string, unknown>;
    const html = renderMenu({
      slug: req.params.slug,
      clientName: client.name,
      giroName: client.product.name,
      catalog: catalog.data as Record<string, unknown>,
      info: (client.menuInfo ?? {}) as MenuInfo,
      // Igual que la app: lo que no está guardado cuenta como encendido.
      freeExtras: features.freeExtras !== false,
      icons: new Map(icons.map((i) => [i.key, i.sha])),
      lastSeenAt: seen.length ? new Date(Math.max(...seen)) : null,
    });
    // La cocina sincroniza cada 30 s: más caché haría que un agotado tarde en verse.
    res.type("html").set("Cache-Control", "public, max-age=30").send(html);
  })
);

publicMenuRouter.get(
  "/:slug/i/:key.png",
  asyncHandler(async (req, res) => {
    const client = await findMenu(req.params.slug);
    const icon =
      client?.product.iconSetId &&
      (await db.icon.findUnique({ where: { setId_key: { setId: client.product.iconSetId, key: req.params.key } }, select: { png: true } }));
    if (!icon) return void res.status(404).set("Cache-Control", "no-store").end();
    // La página pide `?v=<sha>`: si el icono cambia, cambia la URL.
    res.type("png").set("Cache-Control", "public, max-age=31536000, immutable").send(Buffer.from(icon.png));
  })
);
