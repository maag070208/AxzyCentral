/**
 * Flujo completo contra la API real y la BD local de pruebas: entrar, dar de
 * alta plan y taquería, generar el código de la cocina, cobrar, suspender y
 * revocar, y lo que ve la app en `GET /license`.
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

const call = async (method: string, path: string, opts: { body?: unknown; auth?: string | null } = {}) => {
  const auth = opts.auth === undefined ? token : opts.auth;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
};

before(async () => {
  await db.$executeRawUnsafe('TRUNCATE "devices", "payments", "taquerias", "plans", "admins" CASCADE');
  await db.admin.create({ data: { username: "yo", name: "Yo", passwordHash: await bcrypt.hash("clave-de-prueba-123", 4) } });
  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

after(async () => {
  server.close();
  await db.$disconnect();
});

test("login: credenciales malas y buenas; rutas protegidas", async () => {
  assert.equal((await call("GET", "/taquerias", { auth: null })).status, 401);
  assert.equal((await call("POST", "/auth/login", { body: { username: "yo", password: "otra" }, auth: null })).status, 401);
  const ok = await call("POST", "/auth/login", { body: { username: "yo", password: "clave-de-prueba-123" }, auth: null });
  assert.equal(ok.status, 200);
  token = ok.body.token;
  assert.equal((await call("GET", "/auth/me")).body.username, "yo");
});

test("taquería de punta a punta", async () => {
  const plan = await call("POST", "/plans", { body: { name: "Básico", monthlyPrice: 399 } });
  assert.equal(plan.status, 201);

  const created = await call("POST", "/taquerias", {
    body: { name: "Tacos El Güero", ownerName: "Don Güero", phone: "5512345678", planId: plan.body.id },
  });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.body.status, "ACTIVE");
  assert.equal(created.body.plan.name, "Básico");

  const device = await call("POST", `/taquerias/${id}/devices`, { body: { name: "Tablet cocina" } });
  assert.equal(device.status, 201);
  const code = device.body.code as string;
  assert.match(code, /^axc_/);

  // La app sin código o con uno inventado.
  assert.equal((await call("GET", "/license", { auth: null })).status, 401);
  assert.equal((await call("GET", "/license", { auth: "axc_inventado" })).body.code, "INVALID_DEVICE_CODE");

  const active = await call("GET", "/license", { auth: code });
  assert.equal(active.status, 200);
  assert.equal(active.body.status, "ACTIVE");
  assert.equal(active.body.tenant.name, "Tacos El Güero");
  assert.equal(active.body.plan.name, "Básico");
  assert.equal(active.body.nextDueDate, null);
  assert.ok(Date.parse(active.body.validUntil) > Date.parse(active.body.serverTime));

  // Cobro pendiente: define la fecha sin conexión; pagado deja de contar.
  const charged = await call("POST", `/taquerias/${id}/payments`, { body: { period: "2099-01", amount: 399, dueDate: "2099-01-05" } });
  assert.equal(charged.status, 201);
  assert.equal((await call("GET", "/license", { auth: code })).body.nextDueDate, "2099-01-05");
  const paymentId = charged.body.payments[0].id;
  const paid = await call("PATCH", `/taquerias/${id}/payments/${paymentId}`, { body: { status: "PAID", method: "Transferencia" } });
  assert.equal(paid.body.payments[0].status, "PAID");
  assert.ok(paid.body.payments[0].paidAt);
  assert.equal((await call("GET", "/license", { auth: code })).body.nextDueDate, null);

  // Mismo periodo dos veces → 409.
  assert.equal((await call("POST", `/taquerias/${id}/payments`, { body: { period: "2099-01", amount: 399, dueDate: "2099-01-05" } })).status, 409);

  // Suspender: la app recibe 200 con SUSPENDED.
  await call("PATCH", `/taquerias/${id}`, { body: { status: "SUSPENDED" } });
  const suspended = await call("GET", "/license", { auth: code });
  assert.equal(suspended.status, 200);
  assert.equal(suspended.body.status, "SUSPENDED");
  assert.equal(suspended.body.validUntil, suspended.body.serverTime);
  await call("PATCH", `/taquerias/${id}`, { body: { status: "ACTIVE" } });
  assert.equal((await call("GET", "/license", { auth: code })).body.status, "ACTIVE");

  // La lista muestra la última conexión de la cocina.
  const list = await call("GET", "/taquerias");
  assert.ok(list.body[0].lastSeenAt);
  assert.deepEqual(list.body[0].devices, { total: 1, active: 1 });

  // Revocar y rotar el código.
  const deviceId = device.body.device.id;
  await call("PATCH", `/taquerias/${id}/devices/${deviceId}`, { body: { active: false } });
  assert.equal((await call("GET", "/license", { auth: code })).status, 401);
  const rotated = await call("POST", `/taquerias/${id}/devices/${deviceId}/code`);
  assert.notEqual(rotated.body.code, code);
  assert.equal((await call("GET", "/license", { auth: code })).status, 401);
  assert.equal((await call("GET", "/license", { auth: rotated.body.code })).status, 200);
});

test("un plan dado de baja no se asigna", async () => {
  const plan = await call("POST", "/plans", { body: { name: "Viejo", monthlyPrice: 100 } });
  await call("PATCH", `/plans/${plan.body.id}`, { body: { active: false } });
  const res = await call("POST", "/taquerias", { body: { name: "Tacos Nuevos", planId: plan.body.id } });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "PLAN_INACTIVE");
});
