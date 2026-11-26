/**
 * Sets de iconos de los giros.
 *
 * Consola (sesión de admin): `GET/POST /icon-sets`, `GET/PUT/PATCH/DELETE /icon-sets/:id`.
 * La consola abre el zip del kit en el navegador y manda los PNG en base64; `PUT .../icons`
 * reemplaza el set completo y sube la versión si algo cambió.
 *
 * App (código del dispositivo como Bearer): `GET /icon-set` entrega el set del giro del
 * cliente; con `If-None-Match` igual a su versión responde 304.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { Icon, IconSet } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";
import { groupOf, labelOf, pngOf, shaOf } from "../lib/giro";
import { requireDeviceByCode } from "../lib/license";
import { bearerOf } from "../lib/tokens";

const Name = z.string().trim().min(2).max(60);
const Base64Png = z.string().min(8).max(600_000);
const Upload = z.object({
  icons: z
    .array(z.object({ key: z.string().trim().regex(/^[a-z0-9_]{1,60}$/, "Llave en minúsculas, números y guion bajo"), png: Base64Png }))
    .min(1)
    .max(400),
  /** Logo del giro e ícono de app; null los quita y sin el campo se quedan como están. */
  logo: Base64Png.nullish(),
  appIcon: Base64Png.nullish(),
});

const b64 = (bytes: Uint8Array | null) => (bytes ? Buffer.from(bytes).toString("base64") : null);

const summary = (s: IconSet & { _count?: { icons: number; products: number } }) => ({
  id: s.id,
  name: s.name,
  version: s.version,
  hasLogo: s.logoPng !== null,
  hasAppIcon: s.appIconPng !== null,
  icons: s._count?.icons ?? 0,
  products: s._count?.products ?? 0,
  updatedAt: s.updatedAt.toISOString(),
});

const iconView = (i: Icon) => ({ key: i.key, group: i.group, label: i.label, png: b64(i.png)! });

/** Set completo (con los PNG), como lo bajan la consola y la app. */
const fullView = (s: IconSet & { icons: Icon[] }) => ({
  id: s.id,
  name: s.name,
  version: s.version,
  logo: b64(s.logoPng),
  appIcon: b64(s.appIconPng),
  icons: s.icons.sort((a, b) => a.group.localeCompare(b.group) || a.key.localeCompare(b.key)).map(iconView),
});

const findSet = async (id: string) => {
  const s = await db.iconSet.findUnique({ where: { id }, include: { icons: true } });
  if (!s) throw new HttpError(404, "ICON_SET_NOT_FOUND", "Set de iconos no encontrado");
  return s;
};

export const iconSetsRouter = Router();

iconSetsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const sets = await db.iconSet.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { icons: true, products: true } } } });
    res.json(sets.map(summary));
  })
);

iconSetsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: Name }).parse(req.body);
    res.status(201).json(summary(await db.iconSet.create({ data: { name } })));
  })
);

/** Grupos que no son platillos: en la vista previa van al final. */
const SECONDARY_GROUPS = new Set(["Ingredientes", "Extras", "Servicio", "Bebidas", "Acompañamientos", "Categorías"]);

/** `?icons=6`: solo N, primero los platillos (rollos, pizzas, tacos…), para la vista previa de productos. */
iconSetsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(400).optional().parse(req.query.icons);
    const full = fullView(await findSet(req.params.id));
    if (!limit) {
      res.json(full);
      return;
    }
    const dishesFirst = [...full.icons].sort(
      (a, b) => Number(SECONDARY_GROUPS.has(a.group)) - Number(SECONDARY_GROUPS.has(b.group)) || a.key.localeCompare(b.key)
    );
    res.json({ ...full, icons: dishesFirst.slice(0, limit) });
  })
);

iconSetsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: Name }).parse(req.body);
    await findSet(req.params.id);
    res.json(summary(await db.iconSet.update({ where: { id: req.params.id }, data: { name } })));
  })
);

/** Reemplaza el set con el kit subido: agrega, cambia y quita iconos; sube la versión si algo cambió. */
iconSetsRouter.put(
  "/:id/icons",
  asyncHandler(async (req, res) => {
    const input = Upload.parse(req.body);
    const current = await findSet(req.params.id);
    const seen = new Set<string>();
    const incoming = input.icons.map(({ key, png }) => {
      if (seen.has(key)) throw new HttpError(400, "DUPLICATE_ICON", `El icono ${key} viene dos veces`);
      seen.add(key);
      const bytes = pngOf(png);
      if (!bytes) throw new HttpError(400, "INVALID_ICON", `${key} no es un PNG válido o pesa más de 400 kB`);
      return { key, bytes, sha: shaOf(bytes) };
    });
    const pngOrNull = (v: string | null | undefined, what: string) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const bytes = pngOf(v);
      if (!bytes) throw new HttpError(400, "INVALID_ICON", `El ${what} no es un PNG válido`);
      return bytes;
    };
    const logo = pngOrNull(input.logo, "logo");
    const appIcon = pngOrNull(input.appIcon, "ícono de app");

    const before = new Map(current.icons.map((i) => [i.key, i]));
    const added = incoming.filter((i) => !before.has(i.key)).map((i) => i.key);
    const changed = incoming.filter((i) => before.has(i.key) && before.get(i.key)!.sha !== i.sha).map((i) => i.key);
    const removed = current.icons.filter((i) => !seen.has(i.key)).map((i) => i.key);
    const sameBytes = (a: Uint8Array | null, b: Buffer | null | undefined) =>
      b === undefined || (a === null && b === null) || (a !== null && b !== null && Buffer.from(a).equals(b));
    const logosChanged = !sameBytes(current.logoPng, logo) || !sameBytes(current.appIconPng, appIcon);
    const dirty = added.length + changed.length + removed.length > 0 || logosChanged;

    if (dirty) {
      const write = new Set([...added, ...changed]);
      await db.$transaction([
        db.icon.deleteMany({ where: { setId: current.id, key: { in: [...removed, ...changed] } } }),
        db.icon.createMany({
          data: incoming
            .filter((i) => write.has(i.key))
            .map((i) => ({ setId: current.id, key: i.key, group: groupOf(i.key), label: labelOf(i.key), png: i.bytes, sha: i.sha })),
        }),
        db.iconSet.update({
          where: { id: current.id },
          data: {
            version: { increment: 1 },
            ...(logo !== undefined ? { logoPng: logo } : {}),
            ...(appIcon !== undefined ? { appIconPng: appIcon } : {}),
          },
        }),
      ]);
    }
    const after = await db.iconSet.findUniqueOrThrow({ where: { id: current.id } });
    res.json({ version: after.version, added, changed, removed, logoChanged: logosChanged });
  })
);

iconSetsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const used = await db.product.count({ where: { iconSetId: req.params.id } });
    if (used > 0) throw new HttpError(409, "ICON_SET_IN_USE", "Ese set lo usa un producto; cámbialo primero");
    await findSet(req.params.id);
    await db.iconSet.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

/** `GET /icon-set` de la app: el set del giro de su cliente. */
export const deviceIconSetRouter = Router();
deviceIconSetRouter.use(rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }));
deviceIconSetRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const code = bearerOf(req.headers.authorization);
    if (!code) throw new HttpError(401, "TOKEN_MISSING", "Falta el código de activación");
    const device = await requireDeviceByCode(code);
    const setId = device.client.product.iconSetId;
    if (!setId) throw new HttpError(404, "NO_ICON_SET", "Este giro todavía no tiene iconos");
    const head = await db.iconSet.findUnique({ where: { id: setId }, select: { version: true } });
    if (!head) throw new HttpError(404, "NO_ICON_SET", "Este giro todavía no tiene iconos");
    const etag = `"${setId}-v${head.version}"`;
    res.set("ETag", etag).set("Cache-Control", "no-cache");
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.json(fullView(await findSet(setId)));
  })
);
