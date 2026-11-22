/**
 * Ventas que reporta la app (`POST /sales`) y métricas de la consola
 * (`GET /clients/:id/sales/metrics`) contra la API real y la BD local de pruebas.
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
let clientId = "";
let deviceId = "";
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
  return { status: res.status, body: (await res.json()) as any };
};

const cleanup = async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "sale_lines", "sales", "client_user_roles", "client_users", "devices", "payments", "clients", "plans", "admins" CASCADE'
  );
};

before(async () => {
  await cleanup();
  await db.admin.create({ data: { username: "yo", name: "Yo", passwordHash: await bcrypt.hash("clave-de-prueba-123", 4) } });
  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  token = (await call("POST", "/auth/login", { body: { username: "yo", password: "clave-de-prueba-123" }, auth: null })).body.token;
  const taqueria = (await call("GET", "/products")).body.find((p: { key: string }) => p.key === "TAQUERIA").id;
  clientId = (await call("POST", "/clients", { body: { productId: taqueria, name: "Tacos El Güero" } })).body.id;
  const device = await call("POST", `/clients/${clientId}/devices`, { body: { name: "Tablet cocina" } });
  code = device.body.code;
  deviceId = device.body.device.id;
});

after(async () => {
  server.close();
  await cleanup();
  await db.$disconnect();
});

const ticket = (id: string, openedAt: string, over: Record<string, unknown> = {}) => ({
  id,
  table: "3",
  accountNumber: 1,
  openedAt,
  closedAt: openedAt,
  utcOffsetMin: -360,
  cancelled: false,
  totalCents: 14_000,
  cashCents: 14_000,
  transferCents: 0,
  persons: 2,
  prepSeconds: 420,
  lines: [
    { productId: "pastor", name: "Taco Pastor", variant: "", category: "Tacos", qty: 4, unitCents: 2_500 },
    { productId: "refresco", name: "Refresco", variant: "", category: "Bebidas", qty: 1, unitCents: 4_000 },
  ],
  ...over,
});

test("POST /sales: pide el código del dispositivo", async () => {
  assert.equal((await call("POST", "/sales", { auth: null, body: { tickets: [] } })).status, 401);
  assert.equal((await call("POST", "/sales", { auth: "axc_inventado", body: { tickets: [] } })).body.code, "INVALID_DEVICE_CODE");
  assert.equal((await call("POST", "/sales", { auth: code, body: { tickets: [{ id: "x" }] } })).status, 400);
});

test("POST /sales: guarda, un reenvío reemplaza sin duplicar y marca la versión", async () => {
  const first = await call("POST", "/sales", {
    auth: code,
    body: {
      appVersion: "1.1.0 (4)",
      tickets: [ticket("cuenta-1", "2026-11-21T03:30:00Z"), ticket("cuenta-2", "2026-11-21T04:10:00Z", { cancelled: true })],
    },
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.received, 2);

  // Reintento por mala señal, con la cuenta 1 corregida: se reemplaza.
  const retry = await call("POST", "/sales", {
    auth: code,
    body: {
      appVersion: "1.1.0 (4)",
      tickets: [
        ticket("cuenta-1", "2026-11-21T03:30:00Z", {
          totalCents: 10_000,
          lines: [{ productId: "pastor", name: "Taco Pastor", category: "Tacos", qty: 4, unitCents: 2_500 }],
        }),
      ],
    },
  });
  assert.equal(retry.status, 200);
  assert.equal(await db.sale.count({ where: { deviceId } }), 2);
  assert.equal(await db.saleLine.count({ where: { sale: { externalId: "cuenta-1" } } }), 1);

  const detail = await call("GET", `/clients/${clientId}`);
  assert.equal(detail.body.devices[0].appVersion, "1.1.0 (4)");
  assert.ok(detail.body.devices[0].lastSeenAt);
});

test("GET /license guarda la versión que manda la app", async () => {
  assert.equal((await call("GET", "/license", { auth: code, headers: { "X-App-Version": "1.1.1 (5)" } })).status, 200);
  assert.equal((await db.device.findUniqueOrThrow({ where: { id: deviceId } })).appVersion, "1.1.1 (5)");
});

test("GET /clients/:id/sales/metrics: en hora local y sin canceladas", async () => {
  assert.equal((await call("GET", `/clients/${clientId}/sales/metrics?from=2026-11-20&to=2026-11-20`, { auth: null })).status, 401);
  assert.equal((await call("GET", `/clients/${clientId}/sales/metrics?from=2026-11-21&to=2026-11-20`)).status, 400);

  // 03:30 UTC es 21:30 del viernes 20 en CDMX.
  const m = await call("GET", `/clients/${clientId}/sales/metrics?from=2026-11-20&to=2026-11-20`);
  assert.equal(m.status, 200);
  assert.equal(m.body.tickets, 1);
  assert.equal(m.body.cancelledTickets, 1);
  assert.equal(m.body.soldCents, 10_000);
  assert.equal(m.body.averagePerPersonCents, 5_000);
  assert.equal(m.body.byHour[21].tickets, 1);
  assert.equal(m.body.products[0].name, "Taco Pastor");

  const nextDay = await call("GET", `/clients/${clientId}/sales/metrics?from=2026-11-21&to=2026-11-21`);
  assert.equal(nextDay.body.tickets, 0);
});
