/**
 * Límites del plan, aviso de actualización y fallas de la app contra la API real y la BD local de pruebas.
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
let productId = "";

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
    'TRUNCATE "app_errors", "backups", "sale_lines", "sales", "client_user_roles", "client_users", "devices", "payments", "clients", "plans", "admins" CASCADE'
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
  productId = taqueria;
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

test("el plan limita los teléfonos de cocina y la licencia trae los límites", async () => {
  const plan = await call("POST", "/plans", { body: { productId, name: "Básico", price: 500, maxKitchens: 1, maxWaiters: 2 } });
  assert.equal(plan.status, 201);
  assert.equal(plan.body.maxWaiters, 2);
  await call("PATCH", `/clients/${clientId}`, { body: { planId: plan.body.id } });

  const second = await call("POST", `/clients/${clientId}/devices`, { body: { name: "Otra cocina" } });
  assert.equal(second.status, 409);
  assert.equal(second.body.code, "PLAN_LIMIT");

  const license = await call("GET", "/license", { auth: code });
  assert.deepEqual(license.body.limits, { kitchens: 1, waiters: 2 });

  // Revocar libera el lugar; reactivar el viejo ya no cabe.
  await call("PATCH", `/clients/${clientId}/devices/${deviceId}`, { body: { active: false } });
  const replacement = await call("POST", `/clients/${clientId}/devices`, { body: { name: "Cocina nueva" } });
  assert.equal(replacement.status, 201);
  assert.equal((await call("PATCH", `/clients/${clientId}/devices/${deviceId}`, { body: { active: true } })).status, 409);
  assert.equal((await call("POST", `/clients/${clientId}/devices/${deviceId}/code`)).status, 409);
  code = replacement.body.code;

  // Ilimitado: sin tope.
  await call("PATCH", `/plans/${plan.body.id}`, { body: { maxKitchens: null, maxWaiters: null } });
  assert.equal((await call("POST", `/clients/${clientId}/devices`, { body: { name: "Tercera" } })).status, 201);
  assert.deepEqual((await call("GET", "/license", { auth: code })).body.limits, { kitchens: null, waiters: null });
});

test("la versión publicada viaja en la licencia y se puede quitar", async () => {
  assert.equal((await call("GET", "/license", { auth: code })).body.latestApp, null);
  const bad = await call("PATCH", `/products/${productId}`, { body: { latestApp: { versionCode: 6, versionName: "1.3.0", url: "no-es-url" } } });
  assert.equal(bad.status, 400);
  const ok = await call("PATCH", `/products/${productId}`, {
    body: { latestApp: { versionCode: 6, versionName: "1.3.0", url: "https://drive.google.com/x", notes: "Cola sin conexión" } },
  });
  assert.equal(ok.status, 200);
  assert.deepEqual((await call("GET", "/license", { auth: code })).body.latestApp, {
    versionCode: 6, versionName: "1.3.0", url: "https://drive.google.com/x", notes: "Cola sin conexión",
  });
  await call("PATCH", `/products/${productId}`, { body: { latestApp: null } });
  assert.equal((await call("GET", "/license", { auth: code })).body.latestApp, null);
});

test("las fallas se guardan una vez y la consola las ve", async () => {
  const report = {
    id: "f1", source: "mesero", appVersion: "1.2.0 (5)", model: "SAMSUNG SM-A175F",
    occurredAt: "2026-11-22T13:00:00-06:00", message: "IllegalStateException: boom", stack: "at com.axzy...",
  };
  assert.equal((await call("POST", "/app-errors", { body: { errors: [report] }, auth: null })).status, 401);
  assert.equal((await call("POST", "/app-errors", { body: { errors: [report] }, auth: code })).status, 200);
  assert.equal((await call("POST", "/app-errors", { body: { errors: [report] }, auth: code })).status, 200);

  const list = await call("GET", `/clients/${clientId}/app-errors`);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].source, "mesero");
  assert.equal(list.body[0].deviceName, "Cocina nueva");

  const recent = await call("GET", "/app-errors/recent?days=30");
  assert.deepEqual(recent.body.map((r: { name: string; count: number }) => [r.name, r.count]), [["Tacos El Güero", 1]]);
  assert.equal((await call("GET", "/app-errors/recent", { auth: null })).status, 401);
});
