/**
 * Respaldo del teléfono de cocina (`PUT/GET /backup`) contra la API real y la BD local de pruebas.
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
    'TRUNCATE "backups", "sale_lines", "sales", "client_user_roles", "client_users", "devices", "payments", "clients", "plans", "admins" CASCADE'
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

const state = (orders: number) => ({ products: [{ id: "asada", name: "Taco Asada" }], orders: Array.from({ length: orders }, (_, i) => ({ id: `o${i}` })) });

test("sin código no hay respaldo", async () => {
  assert.equal((await call("PUT", "/backup", { body: { savedAt: "2026-11-22T10:00:00-06:00", state: state(1) }, auth: null })).status, 401);
  assert.equal((await call("GET", "/backup", { auth: "axc_no-existe" })).status, 401);
});

test("antes del primer respaldo responde NO_BACKUP", async () => {
  const r = await call("GET", "/backup", { auth: code });
  assert.equal(r.status, 404);
  assert.equal(r.body.code, "NO_BACKUP");
});

test("guarda el respaldo y otro teléfono del cliente lo recupera", async () => {
  const put = await call("PUT", "/backup", {
    body: { appVersion: "1.2.0 (5)", savedAt: "2026-11-22T10:00:00-06:00", state: state(2) },
    auth: code,
  });
  assert.equal(put.status, 200);
  assert.equal(put.body.saved, true);

  const other = (await call("POST", `/clients/${clientId}/devices`, { body: { name: "Teléfono nuevo" } })).body.code;
  const got = await call("GET", "/backup", { auth: other });
  assert.equal(got.status, 200);
  const [b] = got.body.backups;
  assert.equal(b.deviceName, "Tablet cocina");
  assert.equal(b.fromThisDevice, false);
  assert.equal(b.state.orders.length, 2);
  assert.equal(b.savedAt, "2026-11-22T16:00:00.000Z");

  // Otra cocina independiente del mismo cliente guarda el suyo sin pisar el primero.
  await call("PUT", "/backup", { body: { savedAt: "2026-11-22T10:30:00-06:00", state: state(5) }, auth: other });
  const both = (await call("GET", "/backup", { auth: code })).body.backups;
  assert.deepEqual(both.map((x: { deviceName: string; state: { orders: unknown[] } }) => [x.deviceName, x.state.orders.length]), [
    ["Teléfono nuevo", 5],
    ["Tablet cocina", 2],
  ]);
});

test("uno más viejo no pisa al guardado", async () => {
  const old = await call("PUT", "/backup", { body: { savedAt: "2026-11-22T09:00:00-06:00", state: state(0) }, auth: code });
  assert.equal(old.body.saved, false);
  const mine = (await call("GET", "/backup", { auth: code })).body.backups.find((x: { fromThisDevice: boolean }) => x.fromThisDevice);
  assert.equal(mine.state.orders.length, 2);
});

test("acepta respaldos de más de 100 kB y rechaza los gigantes", async () => {
  const big = { ...state(1), notes: "x".repeat(500_000) };
  assert.equal((await call("PUT", "/backup", { body: { savedAt: "2026-11-22T11:00:00-06:00", state: big }, auth: code })).status, 200);
  const huge = { ...state(1), notes: "x".repeat(3_000_000) };
  assert.equal((await call("PUT", "/backup", { body: { savedAt: "2026-11-22T12:00:00-06:00", state: huge }, auth: code })).status, 413);
});

test("un dispositivo revocado no descarga el respaldo", async () => {
  await call("PATCH", `/clients/${clientId}/devices/${deviceId}`, { body: { active: false } });
  assert.equal((await call("GET", "/backup", { auth: code })).status, 401);
});
