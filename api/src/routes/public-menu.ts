import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config";
import { db } from "../db";
import { z } from "zod";
import { asyncHandler, HttpError } from "../errors";
import { shaOf } from "../lib/giro";
import { renderMenu, renderUnavailable, type MenuInfo } from "../lib/public-menu";

/**
 * Menú digital público, sin sesión: `/:slug` (la página) y `/:slug/i/:key.png` (sus iconos). Se monta en
 * `/m` del API y en la raíz del dominio del menú (`menu.axzy.dev`, ver `menuHost` en app.ts).
 * Solo existe si el cliente está activo, lo tiene encendido y la Central ya tiene su menú.
 */
export const publicMenuRouter = Router();

// Un QR en cada mesa y el WiFi del local (una IP): cada visita nueva pide la página y ~30 iconos.
publicMenuRouter.use(rateLimit({ windowMs: 60_000, limit: 1200, standardHeaders: true, legacyHeaders: false }));

// La página no lleva JavaScript ni nada de fuera: solo sus estilos y sus iconos. Solo la consola la
// puede mostrar en un marco (vista previa).
const frameAncestors = config.WEB_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean).join(" ") || "'none'";
publicMenuRouter.use((_req, res, next) => {
  res.removeHeader("X-Frame-Options");
  res.set(
    "Content-Security-Policy",
    `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors ${frameAncestors}`
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
          product: { select: { key: true, name: true, features: true, iconSetId: true } },
          devices: { where: { active: true }, select: { lastSeenAt: true } },
        },
      })
    : Promise.resolve(null);

/**
 * Solo cuenta navegadores (todos mandan `Mozilla/`); las vistas previas de enlaces (WhatsApp, Facebook…)
 * y los bots que se hacen pasar por navegador no son comensales.
 */
const NOT_A_DINER = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|headless/i;

/** Día de hoy en CDMX como fecha (`AAAA-MM-DD` a medianoche UTC), para la columna `DATE`. */
export const menuDay = (now = new Date()) =>
  new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(now)}T00:00:00Z`);

/** Suma una visita del día; si falla no tumba la página (el comensal ya tiene su menú). */
const countVisit = (clientId: string) =>
  db.menuVisit
    .upsert({ where: { clientId_day: { clientId, day: menuDay() } }, create: { clientId, day: menuDay(), count: 1 }, update: { count: { increment: 1 } } })
    .catch((err) => console.error("menu visit", err));

const unavailable = (res: Response) => res.status(404).type("html").set("Cache-Control", "no-store").send(renderUnavailable());

publicMenuRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const client = await findMenu(req.params.slug);
    const catalog = client && (await db.catalogVersion.findFirst({ where: { clientId: client.id }, orderBy: { version: "desc" } }));
    if (!client || !catalog) return void unavailable(res);
    const [icons, photos] = await Promise.all([
      client.product.iconSetId ? db.icon.findMany({ where: { setId: client.product.iconSetId }, select: { key: true, sha: true } }) : [],
      db.productPhoto.findMany({ where: { clientId: client.id }, select: { productId: true, sha: true } }),
    ]);
    const seen = client.devices.map((d) => d.lastSeenAt?.getTime() ?? 0).filter(Boolean);
    const features = (client.product.features ?? {}) as Record<string, unknown>;
    const html = renderMenu({
      // Las URL de los iconos cuelgan de donde se sirvió la página: `/m/<slug>` o `/<slug>`.
      basePath: `${req.baseUrl}/${req.params.slug}`,
      clientName: client.name,
      giroName: client.product.name,
      giroKey: client.product.key,
      catalog: catalog.data as Record<string, unknown>,
      info: (client.menuInfo ?? {}) as MenuInfo,
      // Igual que la app: lo que no está guardado cuenta como encendido.
      freeExtras: features.freeExtras !== false,
      icons: new Map(icons.map((i) => [i.key, i.sha])),
      photos: new Map(photos.map((f) => [f.productId, f.sha])),
      lastSeenAt: seen.length ? new Date(Math.max(...seen)) : null,
    });
    // La cocina sincroniza cada 30 s: más caché haría que un agotado tarde en verse.
    res.type("html").set("Cache-Control", "public, max-age=30").send(html);
    const ua = req.get("user-agent") ?? "";
    // La vista previa de la consola llega en un marco: no es un comensal.
    const inFrame = req.get("sec-fetch-dest") === "iframe";
    if (/Mozilla\//.test(ua) && !NOT_A_DINER.test(ua) && !inFrame) await countVisit(client.id);
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

publicMenuRouter.get(
  "/:slug/f/:productId.jpg",
  asyncHandler(async (req, res) => {
    const client = await findMenu(req.params.slug);
    const photo =
      client && (await db.productPhoto.findUnique({ where: { clientId_productId: { clientId: client.id, productId: req.params.productId } }, select: { jpeg: true } }));
    if (!photo) return void res.status(404).set("Cache-Control", "no-store").end();
    // La página pide `?v=<sha>`: si cambia la foto, cambia la URL.
    res.type("jpeg").set("Cache-Control", "public, max-age=31536000, immutable").send(Buffer.from(photo.jpeg));
  })
);

/**
 * El dominio del menú (`menu.axzy.dev`) solo sirve menús: `/<slug>` y sus iconos. Lo demás, incluido el
 * API, no existe ahí.
 */
export const menuSiteRouter = Router();
menuSiteRouter.use(publicMenuRouter);
menuSiteRouter.use((_req, res) => void res.status(404).type("html").set("Cache-Control", "no-store").send(renderUnavailable()));

/** Host del dominio propio del menú si `PUBLIC_MENU_URL` apunta a su raíz (`https://menu.axzy.dev`). */
export const menuHostOf = (publicMenuUrl: string | undefined): string | null => {
  if (!publicMenuUrl) return null;
  const url = new URL(publicMenuUrl);
  return url.pathname.replace(/\/+$/, "") === "" ? url.hostname.toLowerCase() : null;
};

/** Consola: visitas al menú digital del cliente en los últimos 30 días de CDMX. */
export const clientMenuVisitsRouter = Router();
clientMenuVisitsRouter.get(
  "/:id/menu-visits",
  asyncHandler(async (req, res) => {
    const today = menuDay();
    const since = new Date(today.getTime() - 29 * 86_400_000);
    const rows = await db.menuVisit.findMany({ where: { clientId: req.params.id, day: { gte: since } }, orderBy: { day: "asc" } });
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const counts = new Map(rows.map((r) => [iso(r.day), r.count]));
    const days = Array.from({ length: 30 }, (_, i) => {
      const day = iso(new Date(since.getTime() + i * 86_400_000));
      return { day, count: counts.get(day) ?? 0 };
    });
    const sum = (n: number) => days.slice(-n).reduce((a, d) => a + d.count, 0);
    res.json({ today: sum(1), last7: sum(7), last30: sum(30), days });
  })
);

/** Una foto pesa ~100–300 kB ya reducida en la consola; 800 kB deja margen sin aceptar originales de cámara. */
export const MAX_PHOTO_BYTES = 800_000;
const PHOTO_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PhotoInput = z.object({ jpeg: z.string().min(10) });

/** Consola: fotos reales de los productos del menú del cliente. */
export const clientPhotosRouter = Router();

const photoParams = (req: { params: Record<string, string> }) => {
  if (!PHOTO_ID.test(req.params.productId)) throw new HttpError(400, "INVALID_PRODUCT_ID", "Producto inválido");
  return { clientId: req.params.id, productId: req.params.productId };
};

clientPhotosRouter.get(
  "/:id/photos",
  asyncHandler(async (req, res) => {
    const rows = await db.productPhoto.findMany({ where: { clientId: req.params.id }, select: { productId: true, sha: true, updatedAt: true } });
    res.json(rows.map((r) => ({ productId: r.productId, sha: r.sha, updatedAt: r.updatedAt.toISOString() })));
  })
);

clientPhotosRouter.get(
  "/:id/photos/:productId",
  asyncHandler(async (req, res) => {
    const photo = await db.productPhoto.findUnique({ where: { clientId_productId: photoParams(req) }, select: { jpeg: true } });
    if (!photo) throw new HttpError(404, "PHOTO_NOT_FOUND", "Ese producto no tiene foto");
    res.type("jpeg").set("Cache-Control", "no-store").send(Buffer.from(photo.jpeg));
  })
);

clientPhotosRouter.put(
  "/:id/photos/:productId",
  asyncHandler(async (req, res) => {
    const key = photoParams(req);
    const bytes = Buffer.from(PhotoInput.parse(req.body).jpeg, "base64");
    if (!JPEG_MAGIC.every((b, i) => bytes[i] === b)) throw new HttpError(400, "INVALID_PHOTO", "La foto debe ser JPEG");
    if (bytes.length > MAX_PHOTO_BYTES) throw new HttpError(413, "PHOTO_TOO_LARGE", "La foto pesa demasiado");
    const client = await db.client.findUnique({ where: { id: key.clientId }, select: { id: true } });
    if (!client) throw new HttpError(404, "CLIENT_NOT_FOUND", "Cliente no encontrado");
    const sha = shaOf(bytes);
    const row = await db.productPhoto.upsert({
      where: { clientId_productId: key },
      create: { ...key, jpeg: bytes, sha },
      update: { jpeg: bytes, sha },
      select: { productId: true, sha: true, updatedAt: true },
    });
    res.json({ productId: row.productId, sha: row.sha, updatedAt: row.updatedAt.toISOString() });
  })
);

clientPhotosRouter.delete(
  "/:id/photos/:productId",
  asyncHandler(async (req, res) => {
    await db.productPhoto.deleteMany({ where: photoParams(req) });
    res.status(204).end();
  })
);
