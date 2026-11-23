/**
 * Giros: sets de iconos, licencia con giro y menú versionado (app y consola), contra la
 * API real y la BD local de pruebas.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app";
import { db } from "../src/db";

let server: Server;
let base = "";
let token = "";
let productId = "";
let clientId = "";
let code = "";

const call = async (method: string, path: string, opts: { body?: unknown; auth?: string | null; headers?: Record<string, string> } = {}) => {
  const auth = opts.auth === undefined ? token : opts.auth;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: (text ? JSON.parse(text) : null) as any };
};

/** PNG mínimo válido (1×1) con un byte que cambia para simular otro dibujo. */
const png = (seed: number) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`IHDR-fake-${seed}`),
  ]).toString("base64");

const cleanup = async () => {
  // Los productos (y la TAQUERIA de la migración) se quedan: solo se les quita lo de esta prueba.
  // DELETE y no TRUNCATE … CASCADE: truncar icon_sets en cascada vaciaría products.
  await db.$executeRawUnsafe(`UPDATE "products" SET "iconSetId" = NULL, "template" = NULL`);
  await db.$executeRawUnsafe('DELETE FROM "icon_sets"');
  await db.$executeRawUnsafe(
    'TRUNCATE "catalog_versions", "backups", "sale_lines", "sales", "client_user_roles", "client_users", "devices", "payments", "clients", "plans", "admins" CASCADE'
  );
};

const menu = (price: number) => ({
  categories: [{ name: "Tacos", singular: "Taco" }],
  products: [{ id: "asada", name: "Asada", priceCents: price, category: "Tacos" }],
  modifierGroups: [],
  freeExtras: ["Cebollitas"],
});

before(async () => {
  await cleanup();
  await db.admin.create({ data: { username: "yo", name: "Yo", passwordHash: await bcrypt.hash("clave-de-prueba-123", 4) } });
  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  token = (await call("POST", "/auth/login", { body: { username: "yo", password: "clave-de-prueba-123" }, auth: null })).body.token;
  productId = (await call("GET", "/products")).body.find((p: { key: string }) => p.key === "TAQUERIA").id;
  clientId = (await call("POST", "/clients", { body: { productId, name: "Tacos El Güero" } })).body.id;
  code = (await call("POST", `/clients/${clientId}/devices`, { body: { name: "Cocina" } })).body.code;
});

after(async () => {
  server.close();
  await cleanup();
  await db.$disconnect();
});

test("la taquería existente trae sus palabras y partes; sin set ni menú la licencia no cambia nada más", async () => {
  const lic = await call("GET", "/license", { auth: code });
  assert.equal(lic.status, 200);
  assert.equal(lic.body.product.key, "TAQUERIA");
  assert.deepEqual(lic.body.product.terms, { kitchenRole: "Taquero", waiterRole: "Mesero", item: "Taco", kitchen: "Cocina" });
  assert.equal(lic.body.product.features.mixes, true);
  assert.equal(lic.body.iconSet, null);
  assert.equal(lic.body.catalog, null);
  // Lo que ya leía la 1.2.2 sigue ahí.
  assert.equal(lic.body.tenant.name, "Tacos El Güero");
  assert.ok(lic.body.validUntil);
});

test("set de iconos: subir el kit, reemplazarlo (agrega, cambia y quita) y bajarlo desde la app", async () => {
  const set = await call("POST", "/icon-sets", { body: { name: "Tacos" } });
  assert.equal(set.status, 201);
  const setId = set.body.id;

  const first = await call("PUT", `/icon-sets/${setId}/icons`, {
    body: { icons: [{ key: "taco_asada", png: png(1) }, { key: "taco_pastor", png: png(2) }, { key: "beb_horchata", png: png(3) }], logo: png(9) },
  });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.added.sort(), ["beb_horchata", "taco_asada", "taco_pastor"]);
  const v1 = first.body.version;

  // El mismo kit otra vez no sube la versión.
  const same = await call("PUT", `/icon-sets/${setId}/icons`, {
    body: { icons: [{ key: "taco_asada", png: png(1) }, { key: "taco_pastor", png: png(2) }, { key: "beb_horchata", png: png(3) }] },
  });
  assert.equal(same.body.version, v1);

  const second = await call("PUT", `/icon-sets/${setId}/icons`, {
    body: { icons: [{ key: "taco_asada", png: png(11) }, { key: "taco_pastor", png: png(2) }, { key: "esp_torta", png: png(4) }] },
  });
  assert.deepEqual(second.body.added, ["esp_torta"]);
  assert.deepEqual(second.body.changed, ["taco_asada"]);
  assert.deepEqual(second.body.removed, ["beb_horchata"]);
  assert.equal(second.body.version, v1 + 1);

  const bad = await call("PUT", `/icon-sets/${setId}/icons`, { body: { icons: [{ key: "taco_x", png: Buffer.from("no es png").toString("base64") }] } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "INVALID_ICON");

  // Sin set asignado al giro la app recibe 404; ya asignado lo baja con su ETag.
  assert.equal((await call("GET", "/icon-set", { auth: code })).status, 404);
  const patched = await call("PATCH", `/products/${productId}`, { body: { iconSetId: setId } });
  assert.equal(patched.body.iconSet.icons, 3);

  const lic = await call("GET", "/license", { auth: code });
  assert.deepEqual(lic.body.iconSet, { id: setId, version: v1 + 1 });

  const dl = await call("GET", "/icon-set", { auth: code });
  assert.equal(dl.status, 200);
  assert.deepEqual(dl.body.icons.map((i: { key: string }) => i.key), ["esp_torta", "taco_asada", "taco_pastor"]);
  assert.equal(dl.body.icons.find((i: { key: string }) => i.key === "esp_torta").group, "Especialidades");
  assert.equal(dl.body.icons.find((i: { key: string }) => i.key === "taco_asada").label, "Asada");
  assert.ok(dl.body.logo);
  const etag = dl.headers.get("etag")!;
  assert.equal((await call("GET", "/icon-set", { auth: code, headers: { "If-None-Match": etag } })).status, 304);

  // Un set en uso no se borra.
  assert.equal((await call("DELETE", `/icon-sets/${setId}`)).status, 409);
});

test("menú: la cocina adopta el suyo la primera vez, luego conflicto si la Central cambió", async () => {
  assert.equal((await call("GET", "/catalog", { auth: code })).body.code, "NO_CATALOG");

  // La taquería que ya trabaja sube su menú: queda como versión 1.
  const adopt = await call("PUT", "/catalog", { auth: code, body: { baseVersion: 0, data: menu(3500) } });
  assert.equal(adopt.status, 200);
  assert.equal(adopt.body.catalog.version, 1);
  assert.equal(adopt.body.catalog.source, "cocina");
  assert.equal((await call("GET", "/license", { auth: code })).body.catalog.version, 1);

  // Lo mismo otra vez no crea versión.
  const again = await call("PUT", "/catalog", { auth: code, body: { baseVersion: 1, data: menu(3500) } });
  assert.equal(again.body.saved, false);

  // La consola cambia el precio: versión 2.
  const central = await call("PUT", `/clients/${clientId}/catalog`, { body: { baseVersion: 1, data: menu(4000) } });
  assert.equal(central.body.catalog.version, 2);
  assert.equal(central.body.catalog.author, "yo");

  // La cocina, que seguía en la 1, choca y recibe la vigente.
  const stale = await call("PUT", "/catalog", { auth: code, body: { baseVersion: 1, data: menu(3800) } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "CATALOG_CONFLICT");
  assert.equal(stale.body.current.version, 2);
  assert.equal(stale.body.current.data.products[0].priceCents, 4000);

  const got = await call("GET", "/catalog", { auth: code });
  assert.equal(got.body.version, 2);

  const hist = await call("GET", `/clients/${clientId}/catalog`);
  assert.deepEqual(hist.body.history.map((h: { version: number; source: string }) => [h.version, h.source]), [[2, "central"], [1, "cocina"]]);
  assert.equal((await call("GET", `/clients/${clientId}/catalog/1`)).body.data.products[0].priceCents, 3500);

  const invalid = await call("PUT", "/catalog", { auth: code, body: { baseVersion: 2, data: { categories: [] } } });
  assert.equal(invalid.status, 400);
});

test("giro con menú base: el cliente nuevo arranca con una copia", async () => {
  const patched = await call("PATCH", `/products/${productId}`, {
    body: { template: menu(3000), terms: { kitchenRole: "Taquero", waiterRole: "Mesero", item: "Taco", kitchen: "Cocina" } },
  });
  assert.equal(patched.status, 200);
  assert.deepEqual(patched.body.template, { categories: 1, products: 1 });
  const nuevo = (await call("POST", "/clients", { body: { productId, name: "Tacos Nuevos" } })).body.id;
  const cat = await call("GET", `/clients/${nuevo}/catalog`);
  assert.equal(cat.body.current.version, 1);
  assert.equal(cat.body.current.author, "plantilla");
  assert.equal((await call("PATCH", `/products/${productId}`, { body: { terms: { otra: "x" } } })).status, 400);
});
