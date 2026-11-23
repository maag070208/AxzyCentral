/**
 * Menú de cada cliente, versionado (la versión más alta es la vigente).
 *
 * App (código del dispositivo como Bearer):
 * - `GET /catalog`: el menú vigente (404 `NO_CATALOG` si la Central todavía no tiene). Lleva ETag
 *   `"v<versión>"`: la cocina pregunta seguido y, si no cambió, recibe 304 sin el menú.
 * - `PUT /catalog` `{ baseVersion, data }`: el admin lo cambió en el teléfono. Si la Central
 *   ya va en otra versión responde 409 `CATALOG_CONFLICT` con la vigente. La primera vez
 *   (`baseVersion` 0 y sin menú) adopta el del teléfono: así la taquería que ya trabaja no pierde el suyo.
 *
 * Consola: `GET /clients/:id/catalog` (vigente + historial), `GET /clients/:id/catalog/:version`
 * y `PUT /clients/:id/catalog` con la misma regla de `baseVersion`.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Prisma, type CatalogVersion } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";
import { CatalogData } from "../lib/giro";
import { requireDeviceByCode } from "../lib/license";
import { bearerOf } from "../lib/tokens";

const Save = z.object({ baseVersion: z.number().int().min(0), data: CatalogData });

/** JSON con llaves ordenadas: Postgres (jsonb) reordena las llaves al guardar. */
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, (val as Record<string, unknown>)[k]]))
      : val
  );

const view = (c: CatalogVersion) => ({
  version: c.version,
  source: c.source,
  author: c.author,
  updatedAt: c.createdAt.toISOString(),
  data: c.data,
});

export const currentCatalog = (clientId: string) =>
  db.catalogVersion.findFirst({ where: { clientId }, orderBy: { version: "desc" } });

/** Versión vigente sin traer el menú (para la licencia). */
export const catalogVersionOf = async (clientId: string): Promise<number | null> =>
  (await db.catalogVersion.findFirst({ where: { clientId }, orderBy: { version: "desc" }, select: { version: true } }))?.version ?? null;

/**
 * Guarda una versión nueva si `baseVersion` es la vigente. Un menú idéntico al vigente no
 * crea versión. Dos guardados al mismo tiempo: el segundo choca con la llave única y es conflicto.
 */
export const saveCatalog = async (clientId: string, input: z.infer<typeof Save>, source: "central" | "cocina", author: string) => {
  const current = await currentCatalog(clientId);
  const currentVersion = current?.version ?? 0;
  if (input.baseVersion !== currentVersion) {
    throw Object.assign(new HttpError(409, "CATALOG_CONFLICT", "El menú cambió en otro lado; revisa la versión vigente"), {
      current: current ? view(current) : null,
    });
  }
  const json = JSON.stringify(input.data);
  if (current && canonical(current.data) === canonical(input.data)) return { saved: false, catalog: view(current) };
  try {
    const created = await db.catalogVersion.create({
      data: {
        clientId,
        version: currentVersion + 1,
        data: input.data as Prisma.InputJsonObject,
        source,
        author,
        sizeBytes: Buffer.byteLength(json),
      },
    });
    return { saved: true, catalog: view(created) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const latest = await currentCatalog(clientId);
      throw Object.assign(new HttpError(409, "CATALOG_CONFLICT", "El menú cambió en otro lado; revisa la versión vigente"), {
        current: latest ? view(latest) : null,
      });
    }
    throw e;
  }
};

/** El 409 lleva la versión vigente para que quien guardó decida. */
const sendConflict = (res: import("express").Response, e: unknown) => {
  if (e instanceof HttpError && e.code === "CATALOG_CONFLICT") {
    res.status(409).json({ code: e.code, message: e.message, current: (e as HttpError & { current: unknown }).current });
    return true;
  }
  return false;
};

const deviceOf = async (authorization: string | undefined) => {
  const code = bearerOf(authorization);
  if (!code) throw new HttpError(401, "TOKEN_MISSING", "Falta el código de activación");
  return requireDeviceByCode(code);
};

export const deviceCatalogRouter = Router();
deviceCatalogRouter.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));

deviceCatalogRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const device = await deviceOf(req.headers.authorization);
    const current = await currentCatalog(device.clientId);
    if (!current) throw new HttpError(404, "NO_CATALOG", "La Central todavía no tiene el menú de esta taquería");
    const etag = `"v${current.version}"`;
    res.set("ETag", etag).set("Cache-Control", "no-cache");
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.json(view(current));
  })
);

deviceCatalogRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const device = await deviceOf(req.headers.authorization);
    const input = Save.parse(req.body);
    try {
      res.set("Cache-Control", "no-store").json(await saveCatalog(device.clientId, input, "cocina", device.name));
    } catch (e) {
      if (!sendConflict(res, e)) throw e;
    }
  })
);

export const clientCatalogRouter = Router();

const assertClient = async (id: string) => {
  const exists = await db.client.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new HttpError(404, "CLIENT_NOT_FOUND", "Cliente no encontrado");
};

clientCatalogRouter.get(
  "/:id/catalog",
  asyncHandler(async (req, res) => {
    const client = await db.client.findUnique({
      where: { id: req.params.id },
      select: { product: { select: { id: true, key: true, name: true, terms: true, features: true, iconSetId: true, template: true } } },
    });
    if (!client) throw new HttpError(404, "CLIENT_NOT_FOUND", "Cliente no encontrado");
    const { template, ...giro } = client.product;
    const [current, history] = await Promise.all([
      currentCatalog(req.params.id),
      db.catalogVersion.findMany({
        where: { clientId: req.params.id },
        orderBy: { version: "desc" },
        take: 50,
        select: { version: true, source: true, author: true, createdAt: true, sizeBytes: true },
      }),
    ]);
    res.json({
      // El giro del cliente: el editor ofrece los iconos de su set y oculta lo que el giro no usa.
      // `hasTemplate`: el giro tiene menú base para "Copiar de la plantilla".
      giro: { ...giro, hasTemplate: template !== null },
      current: current ? view(current) : null,
      history: history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
    });
  })
);

clientCatalogRouter.get(
  "/:id/catalog/:version",
  asyncHandler(async (req, res) => {
    const version = z.coerce.number().int().min(1).parse(req.params.version);
    const c = await db.catalogVersion.findUnique({ where: { clientId_version: { clientId: req.params.id, version } } });
    if (!c) throw new HttpError(404, "CATALOG_NOT_FOUND", "Esa versión del menú no existe");
    res.json(view(c));
  })
);

clientCatalogRouter.put(
  "/:id/catalog",
  asyncHandler(async (req, res) => {
    await assertClient(req.params.id);
    const input = Save.parse(req.body);
    try {
      res.json(await saveCatalog(req.params.id, input, "central", req.admin?.username ?? "consola"));
    } catch (e) {
      if (!sendConflict(res, e)) throw e;
    }
  })
);
