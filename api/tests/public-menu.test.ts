/**
 * Menú digital público (`/m/:slug`): quién lo enciende, qué enseña y qué nunca enseña.
 * Corre contra la BD de pruebas (scripts/test-integration.sh).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app";
import { menuHostOf } from "../src/routes/public-menu";
import { config } from "../src/config";
import { db } from "../src/db";

let server: Server;
let origin = "";
let token = "";
let productId = "";
let clientId = "";
let code = "";

const call = async (method: string, path: string, opts: { body?: unknown; auth?: string | null } = {}) => {
  const auth = opts.auth === undefined ? token : opts.auth;
  const res = await fetch(`${origin}/api/v1${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as any };
};

const page = async (path: string) => {
  const res = await fetch(`${origin}${path}`);
  return { status: res.status, headers: res.headers, html: await res.text() };
};

const png = (seed: number) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`IHDR-fake-${seed}`)]).toString("base64");

const menu = (suaderoActive: boolean) => ({
  categories: [{ name: "Tacos", singular: "Taco" }, { name: "Bebidas" }],
  products: [
    { id: "asada", name: "Asada", priceCents: 2500, category: "Tacos", modifierGroupIds: ["g-tortilla"] },
    { id: "suadero", name: "Suadero", priceCents: 2500, category: "Tacos", active: suaderoActive },
    { id: "x", name: "<script>alert(1)</script>", priceCents: 1000, category: "Tacos" },
    { id: "agua", name: "Agua de sabor", priceCents: 0, category: "Bebidas", variants: [{ name: "Chica", priceCents: 2000 }, { name: "Grande", priceCents: 3500 }] },
  ],
  modifierGroups: [{ id: "g-tortilla", name: "Tortilla", options: ["Maíz", "Harina"] }],
  freeExtras: ["Cebollitas", "Chiles toreados"],
});

const cleanup = async () => {
  await db.$executeRawUnsafe(`UPDATE "products" SET "iconSetId" = NULL, "template" = NULL`);
  await db.$executeRawUnsafe('DELETE FROM "icon_sets"');
  await db.$executeRawUnsafe(
    'TRUNCATE "catalog_versions", "backups", "sale_lines", "sales", "client_user_roles", "client_users", "devices", "payments", "clients", "plans", "admins" CASCADE'
  );
};

before(async () => {
  await cleanup();
  await db.admin.create({ data: { username: "yo", name: "Yo", passwordHash: await bcrypt.hash("clave-de-prueba-123", 4) } });
  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  token = (await call("POST", "/auth/login", { body: { username: "yo", password: "clave-de-prueba-123" }, auth: null })).body.token;
  productId = (await call("GET", "/products")).body.find((p: { key: string }) => p.key === "TAQUERIA").id;
  clientId = (
    await call("POST", "/clients", { body: { productId, name: "Tacos El Güero", phone: "3311112222", notes: "NOTA-INTERNA" } })
  ).body.id;
  code = (await call("POST", `/clients/${clientId}/devices`, { body: { name: "Cocina" } })).body.code;
});

after(async () => {
  server.close();
  await cleanup();
  await db.$disconnect();
});

test("menú digital: apagado por defecto y la dirección se valida", async () => {
  assert.equal((await page("/m/el-guero")).status, 404);
  const detail = await call("GET", `/clients/${clientId}`);
  assert.deepEqual(detail.body.menu, { slug: null, enabled: false, info: {} });

  // Sin dirección no se enciende.
  assert.equal((await call("PATCH", `/clients/${clientId}`, { body: { menuEnabled: true } })).body.code, "MENU_SLUG_REQUIRED");
  assert.equal((await call("PATCH", `/clients/${clientId}`, { body: { menuSlug: "el güero" } })).status, 400);
  assert.equal((await call("PATCH", `/clients/${clientId}`, { body: { menuSlug: "el-" } })).status, 400);

  const on = await call("PATCH", `/clients/${clientId}`, {
    body: { menuSlug: "El-Guero", menuEnabled: true, menuInfo: { hours: "Lun a sáb, 7 pm a 1 am", whatsapp: "55 1234 5678", address: "" } },
  });
  assert.equal(on.status, 200);
  assert.deepEqual(on.body.menu, { slug: "el-guero", enabled: true, info: { hours: "Lun a sáb, 7 pm a 1 am", whatsapp: "55 1234 5678", address: null } });

  // Encendido pero la cocina aún no sube su menú: no hay nada que enseñar.
  const empty = await page("/m/el-guero");
  assert.equal(empty.status, 404);
  assert.match(empty.html, /Este menú no está disponible/);

  // Otro cliente no puede usar la misma dirección.
  const otro = (await call("POST", "/clients", { body: { productId, name: "Otro" } })).body.id;
  assert.equal((await call("PATCH", `/clients/${otro}`, { body: { menuSlug: "el-guero" } })).body.code, "MENU_SLUG_TAKEN");
  await db.client.delete({ where: { id: otro } });

  // Quitar la dirección con el menú encendido tampoco.
  assert.equal((await call("PATCH", `/clients/${clientId}`, { body: { menuSlug: null } })).body.code, "MENU_SLUG_REQUIRED");
});

test("menú digital: enseña el menú de la cocina, sus agotados e iconos, y nada interno", async () => {
  const set = (await call("POST", "/icon-sets", { body: { name: "Tacos" } })).body.id;
  await call("PUT", `/icon-sets/${set}/icons`, { body: { icons: [{ key: "taco_asada", png: png(1) }, { key: "beb_agua_fresca", png: png(2) }] } });
  await call("PATCH", `/products/${productId}`, { body: { iconSetId: set } });
  assert.equal((await call("PUT", "/catalog", { auth: code, body: { baseVersion: 0, data: menu(true) } })).status, 200);

  const res = await page("/m/el-guero");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
  assert.match(res.headers.get("cache-control") ?? "", /max-age=30/);
  assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  // Solo la consola la muestra en un marco (vista previa).
  assert.ok((res.headers.get("content-security-policy") ?? "").includes(`frame-ancestors ${config.WEB_ORIGIN.split(",")[0].trim()}`));
  assert.equal(res.headers.get("x-frame-options"), null);
  const html = res.html;
  assert.match(html, /<h1>Tacos El Güero<\/h1>/);
  assert.match(html, /Asada/);
  assert.match(html, /\$25/);
  assert.match(html, /Tortilla:<\/span> Maíz, Harina/);
  assert.match(html, /Chica<\/span><b>\$20<\/b>/);
  assert.match(html, /Sin costo<\/b> Cebollitas, Chiles toreados/);
  assert.match(html, /Lun a sáb, 7 pm a 1 am/);
  assert.match(html, /href="https:\/\/wa\.me\/525512345678"/);
  assert.doesNotMatch(html, /Agotado/);
  // Los nombres vienen de la cocina: se escapan.
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script/);
  // Nada interno: notas, teléfono del contacto, código del dispositivo.
  for (const secret of ["NOTA-INTERNA", "3311112222", code]) assert.ok(!html.includes(secret), `no debe salir ${secret}`);

  // Iconos: por llave del set y por nombre con alias ("Agua de sabor" → beb_agua_fresca).
  const icon = html.match(/src="(\/m\/el-guero\/i\/taco_asada\.png\?v=[0-9a-f]+)"/);
  assert.ok(icon, "icono de asada");
  assert.match(html, /\/m\/el-guero\/i\/beb_agua_fresca\.png/);
  const img = await fetch(`${origin}${icon![1]}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/png");
  assert.match(img.headers.get("cache-control") ?? "", /immutable/);
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), Buffer.from(png(1), "base64"));
  assert.equal((await fetch(`${origin}/m/el-guero/i/taco_pastor.png`)).status, 404);

  // La cocina agota el suadero: en la siguiente sincronización la página lo tacha.
  assert.equal((await call("PUT", "/catalog", { auth: code, body: { baseVersion: 1, data: menu(false) } })).status, 200);
  const out = (await page("/m/el-guero")).html;
  assert.match(out, /<li class="item out[^"]*">.*?<h3>Suadero<\/h3><span class="tag">Agotado<\/span>/s);
});

test("menú digital: cuenta las visitas de comensales por día, no las vistas previas de enlaces", async () => {
  const phone = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36";
  for (const ua of [phone, phone, "WhatsApp/2.24.1 A", "facebookexternalhit/1.1"]) {
    assert.equal((await fetch(`${origin}/m/el-guero`, { headers: { "User-Agent": ua } })).status, 200);
  }
  // La vista previa de la consola (en un marco) tampoco.
  await fetch(`${origin}/m/el-guero`, { headers: { "User-Agent": phone, "Sec-Fetch-Dest": "iframe" } });
  // Los iconos no cuentan como visita.
  await fetch(`${origin}/m/el-guero/i/taco_asada.png`, { headers: { "User-Agent": phone } });
  const v = await call("GET", `/clients/${clientId}/menu-visits`);
  assert.equal(v.status, 200);
  assert.equal(v.body.today, 2);
  assert.equal(v.body.last7, 2);
  assert.equal(v.body.days.length, 30);
  assert.equal(v.body.days.at(-1).count, 2);
  assert.equal((await call("GET", `/clients/${clientId}/menu-visits`, { auth: null })).status, 401);
});

test("menú digital: en su dominio se sirve en la raíz y ahí no hay API", async () => {
  assert.equal(menuHostOf("https://menu.axzy.dev"), "menu.axzy.dev");
  assert.equal(menuHostOf("https://menu.axzy.dev/"), "menu.axzy.dev");
  assert.equal(menuHostOf("https://api.example.com/m"), null);
  assert.equal(menuHostOf(undefined), null);

  const site = createApp({ menuHost: "menu.test" }).listen(0, "127.0.0.1");
  await once(site, "listening");
  const port = (site.address() as AddressInfo).port;
  const get = (path: string, host: string) =>
    new Promise<{ status: number; body: string }>((ok, fail) => {
      request({ host: "127.0.0.1", port, path, headers: { Host: host } }, (res) => {
        let body = "";
        res.setEncoding("utf8").on("data", (c) => (body += c)).on("end", () => ok({ status: res.statusCode!, body }));
      }).on("error", fail).end();
    });
  try {
    const menu = await get("/el-guero", "menu.test");
    assert.equal(menu.status, 200);
    assert.match(menu.body, /src="\/el-guero\/i\/taco_asada\.png\?v=/);
    assert.equal((await get("/el-guero/i/taco_asada.png", "menu.test")).status, 200);
    // En el dominio del menú no existe el API ni otras rutas.
    const api = await get("/api/v1/config", "menu.test");
    assert.equal(api.status, 404);
    assert.match(api.body, /Este menú no está disponible/);
    assert.equal((await get("/", "menu.test")).status, 404);
    // El dominio del API sigue igual.
    assert.equal((await get("/api/v1/config", "api.test")).status, 200);
    assert.equal((await get("/m/el-guero", "api.test")).status, 200);
  } finally {
    site.close();
  }
});

test("menú digital: apagado o cliente suspendido ya no se ve, ni sus iconos", async () => {
  await call("PATCH", `/clients/${clientId}`, { body: { status: "SUSPENDED" } });
  assert.equal((await page("/m/el-guero")).status, 404);
  await call("PATCH", `/clients/${clientId}`, { body: { status: "ACTIVE", menuEnabled: false } });
  assert.equal((await page("/m/el-guero")).status, 404);
  assert.equal((await fetch(`${origin}/m/el-guero/i/taco_asada.png`)).status, 404);
  // Una dirección rara ni siquiera llega a la base.
  assert.equal((await page("/m/..%2Fadmin")).status, 404);
});
