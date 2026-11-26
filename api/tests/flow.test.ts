/**
 * Flujo completo contra la API real y la BD local de pruebas: entrar, dar de
 * alta producto, plan y cliente, generar el código del dispositivo, cobrar,
 * suspender y revocar, y lo que ve la app en `GET /license`.
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
  await db.$executeRawUnsafe(
    'TRUNCATE "client_user_roles", "client_users", "devices", "payments", "clients", "plans", "admins" CASCADE'
  );
  // Los productos de otras pruebas se van con sus roles; el catálogo de
  // TAQUERIA que siembra la migración se conserva.
  await db.role.deleteMany({ where: { product: { is: { key: { not: "TAQUERIA" } } } } });
  await db.product.deleteMany({ where: { key: { not: "TAQUERIA" } } });
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
  assert.equal((await call("GET", "/clients", { auth: null })).status, 401);
  assert.equal((await call("POST", "/auth/login", { body: { username: "yo", password: "otra" }, auth: null })).status, 401);
  const ok = await call("POST", "/auth/login", { body: { username: "yo", password: "clave-de-prueba-123" }, auth: null });
  assert.equal(ok.status, 200);
  token = ok.body.token;
  assert.equal((await call("GET", "/auth/me")).body.username, "yo");
});

let taqueria = "";

test("productos: el de taquerías viene de la migración y se pueden agregar otros", async () => {
  const list = await call("GET", "/products");
  taqueria = list.body.find((p: { key: string }) => p.key === "TAQUERIA").id;
  assert.ok(taqueria);
  const checklab = await call("POST", "/products", { body: { key: "CHECKLAB", name: "CheckLab", description: "RH y checadas" } });
  assert.equal(checklab.status, 201);
  assert.equal((await call("POST", "/products", { body: { key: "CHECKLAB", name: "Otro" } })).status, 409);
  assert.equal((await call("POST", "/products", { body: { key: "minusculas", name: "Mal" } })).status, 400);
});

test("cliente de punta a punta", async () => {
  const plan = await call("POST", "/plans", { body: { productId: taqueria, name: "Básico", price: 399 } });
  assert.equal(plan.status, 201);
  assert.equal(plan.body.productName, "Taquería");
  assert.equal(plan.body.price, "399.00");
  assert.equal(plan.body.billingType, "RECURRING");

  const created = await call("POST", "/clients", {
    body: { productId: taqueria, name: "Tacos El Güero", contactName: "Don Güero", phone: "5512345678", email: "", planId: plan.body.id },
  });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.body.status, "ACTIVE");
  assert.equal(created.body.product.key, "TAQUERIA");
  assert.equal(created.body.plan.name, "Básico");
  assert.equal(created.body.email, null);

  const device = await call("POST", `/clients/${id}/devices`, { body: { name: "Tablet cocina" } });
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
  // Lo que lee la 1.2.x no cambia; terms/features son agregados.
  assert.deepEqual({ key: active.body.product.key, name: active.body.product.name }, { key: "TAQUERIA", name: "Taquería" });
  assert.equal(active.body.nextDueDate, null);
  assert.ok(Date.parse(active.body.validUntil) > Date.parse(active.body.serverTime));

  // Cobro pendiente: define la fecha sin conexión; pagado deja de contar.
  const charged = await call("POST", `/clients/${id}/payments`, { body: { period: "2099-01", amount: 399, dueDate: "2099-01-05" } });
  assert.equal(charged.status, 201);
  assert.equal(charged.body.payments[0].kind, "RECURRING");
  assert.equal(charged.body.payments[0].period, "2099-01");
  assert.equal(charged.body.payments[0].concept, null);
  assert.equal((await call("GET", "/license", { auth: code })).body.nextDueDate, "2099-01-05");
  const paymentId = charged.body.payments[0].id;
  const paid = await call("PATCH", `/clients/${id}/payments/${paymentId}`, { body: { status: "PAID", method: "Transferencia" } });
  assert.equal(paid.body.payments[0].status, "PAID");
  assert.ok(paid.body.payments[0].paidAt);
  assert.equal((await call("GET", "/license", { auth: code })).body.nextDueDate, null);

  // Mismo periodo dos veces → 409.
  assert.equal((await call("POST", `/clients/${id}/payments`, { body: { period: "2099-01", amount: 399, dueDate: "2099-01-05" } })).status, 409);

  // Suspender: la app recibe 200 con SUSPENDED.
  await call("PATCH", `/clients/${id}`, { body: { status: "SUSPENDED" } });
  const suspended = await call("GET", "/license", { auth: code });
  assert.equal(suspended.status, 200);
  assert.equal(suspended.body.status, "SUSPENDED");
  assert.equal(suspended.body.validUntil, suspended.body.serverTime);
  await call("PATCH", `/clients/${id}`, { body: { status: "ACTIVE" } });
  assert.equal((await call("GET", "/license", { auth: code })).body.status, "ACTIVE");

  // La lista muestra la última conexión de la cocina.
  const list = await call("GET", "/clients");
  assert.ok(list.body[0].lastSeenAt);
  assert.deepEqual(list.body[0].devices, { total: 1, active: 1 });

  // Revocar y rotar el código.
  const deviceId = device.body.device.id;
  await call("PATCH", `/clients/${id}/devices/${deviceId}`, { body: { active: false } });
  assert.equal((await call("GET", "/license", { auth: code })).status, 401);
  const rotated = await call("POST", `/clients/${id}/devices/${deviceId}/code`);
  assert.notEqual(rotated.body.code, code);
  assert.equal((await call("GET", "/license", { auth: code })).status, 401);
  assert.equal((await call("GET", "/license", { auth: rotated.body.code })).status, 200);
});

test("un plan dado de baja o de otro producto no se asigna", async () => {
  const plan = await call("POST", "/plans", { body: { productId: taqueria, name: "Viejo", price: 100 } });
  await call("PATCH", `/plans/${plan.body.id}`, { body: { active: false } });
  const res = await call("POST", "/clients", { body: { productId: taqueria, name: "Tacos Nuevos", planId: plan.body.id } });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "PLAN_INACTIVE");

  const checklab = (await call("GET", "/products")).body.find((p: { key: string }) => p.key === "CHECKLAB").id;
  const rh = await call("POST", "/plans", { body: { productId: checklab, name: "RH 500", price: 500 } });
  const crossed = await call("POST", "/clients", { body: { productId: taqueria, name: "Tacos Cruzados", planId: rh.body.id } });
  assert.equal(crossed.body.code, "PLAN_PRODUCT_MISMATCH");
  const client = await call("POST", "/clients", { body: { productId: taqueria, name: "Tacos Sin Plan" } });
  assert.equal((await call("PATCH", `/clients/${client.body.id}`, { body: { planId: rh.body.id } })).body.code, "PLAN_PRODUCT_MISMATCH");
  const filtered = await call("GET", `/clients?productId=${checklab}`);
  assert.deepEqual(filtered.body, []);
});

// ---------------------------------------------------------------------------
// Activación por QR, /config, planes con tipo de cobro y cobros generados.
// ---------------------------------------------------------------------------

const periodOf = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
const nextPeriodOf = (period: string): string => {
  const [year, month] = period.split("-").map(Number);
  const index = year * 12 + month;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};
const dueDateOf = (period: string, day: number): string => {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, Math.min(Math.max(day, 1), 28))).toISOString().slice(0, 10);
};
const dayOf = (ymd: string): number => Number(ymd.slice(8, 10));
const today = (): string => new Date().toISOString().slice(0, 10);

let taqueriaUnicaId = "";

test("GET /config es público y devuelve la URL del API para el QR", async () => {
  const res = await call("GET", "/config", { auth: null });
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.apiUrl, "string");
  assert.match(res.body.apiUrl, /^https?:\/\//);
  assert.ok(res.body.apiUrl.endsWith("/api/v1"));
  assert.ok(!res.body.apiUrl.endsWith("/"));
  // Base del menú digital para los QR de las mesas.
  assert.match(res.body.menuUrl, /^https?:\/\/.+\/m$/);
});

test("POST /activate: da de alta, adopta nombre/modelo y responde como /license", async () => {
  const plan = await call("POST", "/plans", { body: { productId: taqueria, name: "Básico QR", price: 299 } });
  const client = await call("POST", "/clients", { body: { productId: taqueria, name: "Taquería QR", planId: plan.body.id } });
  const device = await call("POST", `/clients/${client.body.id}/devices`, { body: { name: "Tablet provisoria" } });
  const code = device.body.code as string;

  // Código inexistente y petición sin código.
  const invalid = await call("POST", "/activate", { auth: null, body: { code: "axc_inventado", device: { name: "Tablet" } } });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.code, "INVALID_DEVICE_CODE");
  assert.equal((await call("POST", "/activate", { auth: null, body: {} })).status, 400);

  // Alta real: misma forma que GET /license más `device`.
  const ok = await call("POST", "/activate", {
    auth: null,
    body: { code, device: { name: "Tablet de cocina", model: "SAMSUNG SM-T290" } },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "ACTIVE");
  assert.equal(ok.body.tenant.name, "Taquería QR");
  assert.equal(ok.body.plan.name, "Básico QR");
  // Lo que lee la 1.2.x no cambia; terms/features son agregados.
  assert.deepEqual({ key: ok.body.product.key, name: ok.body.product.name }, { key: "TAQUERIA", name: "Taquería" });
  assert.equal(ok.body.nextDueDate, null);
  assert.ok(Date.parse(ok.body.validUntil) > Date.parse(ok.body.serverTime));
  assert.equal(ok.body.device.id, device.body.device.id);
  assert.equal(ok.body.device.name, "Tablet de cocina");
  const license = await call("GET", "/license", { auth: code });
  assert.deepEqual(Object.keys(ok.body).sort(), [...Object.keys(license.body), "device"].sort());

  const detail = await call("GET", `/clients/${client.body.id}`);
  const saved = detail.body.devices[0];
  assert.equal(saved.name, "Tablet de cocina");
  assert.equal(saved.model, "SAMSUNG SM-T290");
  assert.ok(saved.activatedAt);
  assert.ok(saved.lastSeenAt);
  const activatedAt = saved.activatedAt;

  // Segunda activación: conserva el nombre, el modelo y la fecha de la primera.
  const again = await call("POST", "/activate", {
    auth: null,
    body: { code, device: { name: "Otro nombre", model: "OTRO MODELO" } },
  });
  assert.equal(again.status, 200);
  assert.equal(again.body.device.name, "Tablet de cocina");
  const detail2 = await call("GET", `/clients/${client.body.id}`);
  assert.equal(detail2.body.devices[0].name, "Tablet de cocina");
  assert.equal(detail2.body.devices[0].model, "SAMSUNG SM-T290");
  assert.equal(detail2.body.devices[0].activatedAt, activatedAt);

  // Revocado: el código deja de servir para activar.
  await call("PATCH", `/clients/${client.body.id}/devices/${device.body.device.id}`, { body: { active: false } });
  assert.equal((await call("POST", "/activate", { auth: null, body: { code } })).status, 401);
});

test("plan de cobro único: generate una sola vez y cobros sin periodo", async () => {
  const plan = await call("POST", "/plans", { body: { productId: taqueria, name: "Instalación", billingType: "ONE_TIME", price: 1500 } });
  assert.equal(plan.status, 201);
  assert.equal(plan.body.price, "1500.00");
  assert.equal(plan.body.billingType, "ONE_TIME");
  assert.equal(plan.body.productName, "Taquería");

  const plans = await call("GET", `/plans?productId=${taqueria}`);
  const listed = plans.body.find((p: { id: string }) => p.id === plan.body.id);
  assert.ok(listed);
  assert.equal(listed.clients, 0);
  assert.equal(listed.billingType, "ONE_TIME");

  const client = await call("POST", "/clients", { body: { productId: taqueria, name: "Taquería Única", planId: plan.body.id } });
  taqueriaUnicaId = client.body.id;
  assert.equal(client.body.plan.billingType, "ONE_TIME");
  assert.equal(client.body.plan.price, "1500.00");

  const generated = await call("POST", `/clients/${taqueriaUnicaId}/payments/generate`);
  assert.equal(generated.status, 201);
  const charge = generated.body.payments[0];
  assert.equal(charge.kind, "ONE_TIME");
  assert.equal(charge.period, null);
  assert.equal(charge.concept, "Instalación");
  assert.equal(charge.amount, "1500.00");
  assert.equal(charge.dueDate, today());

  const duplicated = await call("POST", `/clients/${taqueriaUnicaId}/payments/generate`);
  assert.equal(duplicated.status, 409);
  assert.equal(duplicated.body.code, "ALREADY_CHARGED");

  // En los únicos el periodo se ignora: no choca con el unique (clientId, period).
  const manual = await call("POST", `/clients/${taqueriaUnicaId}/payments`, {
    body: { kind: "ONE_TIME", period: "2099-05", amount: 200, dueDate: "2099-05-10", concept: "Capacitación extra" },
  });
  assert.equal(manual.status, 201);
  const extra = manual.body.payments.find((p: { concept: string | null }) => p.concept === "Capacitación extra");
  assert.ok(extra);
  assert.equal(extra.period, null);
  assert.equal(extra.kind, "ONE_TIME");

  // Un recurrente sin periodo no pasa la validación.
  assert.equal((await call("POST", `/clients/${taqueriaUnicaId}/payments`, { body: { amount: 100, dueDate: "2099-06-01" } })).status, 400);
});

test("cobro recurrente: generate avanza el periodo y billing/run no duplica", async () => {
  const plan = await call("POST", "/plans", { body: { productId: taqueria, name: "Mensual QR", price: 250 } });
  assert.equal(plan.status, 201);
  assert.equal(plan.body.billingType, "RECURRING");
  const client = await call("POST", "/clients", { body: { productId: taqueria, name: "Taquería Mensual", planId: plan.body.id } });
  const id = client.body.id;

  const first = await call("POST", `/clients/${id}/payments/generate`);
  assert.equal(first.status, 201);
  const firstCharge = first.body.payments[0];
  assert.equal(firstCharge.kind, "RECURRING");
  assert.equal(firstCharge.period, periodOf(new Date()));
  assert.equal(firstCharge.dueDate, today());
  assert.equal(firstCharge.amount, "250.00");
  assert.equal(firstCharge.concept, null);

  const duplicated = await call("POST", `/clients/${id}/payments/generate`);
  assert.equal(duplicated.status, 409);
  assert.equal(duplicated.body.code, "CHARGE_PENDING");

  // Pagado el pendiente, el siguiente cae el mes siguiente con el mismo día (1..28).
  await call("PATCH", `/clients/${id}/payments/${firstCharge.id}`, { body: { status: "PAID" } });
  const second = await call("POST", `/clients/${id}/payments/generate`);
  assert.equal(second.status, 201);
  const secondCharge = second.body.payments.find((p: { status: string }) => p.status === "PENDING");
  const expectedPeriod = nextPeriodOf(firstCharge.period);
  assert.equal(secondCharge.period, expectedPeriod);
  assert.equal(secondCharge.dueDate, dueDateOf(expectedPeriod, dayOf(firstCharge.dueDate)));
  assert.equal(secondCharge.amount, "250.00");

  // El cuerpo ajusta importe y concepto.
  await call("PATCH", `/clients/${id}/payments/${secondCharge.id}`, { body: { status: "PAID" } });
  const third = await call("POST", `/clients/${id}/payments/generate`, { body: { amount: 300, concept: "Ajuste" } });
  assert.equal(third.status, 201);
  const thirdCharge = third.body.payments.find((p: { status: string }) => p.status === "PENDING");
  assert.equal(thirdCharge.period, nextPeriodOf(expectedPeriod));
  assert.equal(thirdCharge.amount, "300.00");
  assert.equal(thirdCharge.concept, "Ajuste");

  // billing/run: genera para quien no tiene pendiente y omite al que sí.
  const fresh = await call("POST", "/clients", { body: { productId: taqueria, name: "Taquería Sin Cobros", planId: plan.body.id } });
  const run1 = await call("POST", "/billing/run");
  assert.equal(run1.status, 200);
  const created = run1.body.charges.find((c: { clientId: string }) => c.clientId === fresh.body.id);
  assert.ok(created);
  assert.equal(created.clientName, "Taquería Sin Cobros");
  assert.equal(created.period, periodOf(new Date()));
  assert.equal(created.dueDate, today());
  assert.equal(created.amount, "250.00");
  assert.equal(run1.body.created, run1.body.charges.length);
  assert.ok(run1.body.skipped >= 1);

  const run2 = await call("POST", "/billing/run");
  assert.equal(run2.body.created, 0);
  assert.deepEqual(run2.body.charges, []);

  const detail = await call("GET", `/clients/${id}`);
  assert.equal(detail.body.payments.filter((p: { status: string }) => p.status === "PENDING").length, 1);
});

test("GET /payments: lista global de cobros con filtros", async () => {
  const all = await call("GET", "/payments");
  assert.equal(all.status, 200);
  assert.ok(all.body.length >= 4);

  const row = all.body.find((p: { clientId: string }) => p.clientId === taqueriaUnicaId);
  assert.ok(row);
  assert.equal(row.clientName, "Taquería Única");
  assert.equal(row.productName, "Taquería");
  assert.equal(row.planName, "Instalación");
  assert.equal(row.kind, "ONE_TIME");
  assert.equal(row.period, null);
  for (const key of ["id", "clientId", "clientName", "productName", "planName", "kind", "period", "concept", "amount", "dueDate", "status", "paidAt", "method"]) {
    assert.ok(key in row, `falta la llave ${key}`);
  }

  const dueDates = all.body.map((p: { dueDate: string }) => p.dueDate);
  assert.deepEqual(dueDates, [...dueDates].sort());

  const pending = await call("GET", "/payments?status=PENDING&kind=RECURRING");
  assert.ok(pending.body.length > 0);
  assert.ok(pending.body.every((p: { status: string; kind: string }) => p.status === "PENDING" && p.kind === "RECURRING"));

  const oneTime = await call("GET", `/payments?kind=ONE_TIME&clientId=${taqueriaUnicaId}`);
  assert.ok(oneTime.body.length >= 1);
  assert.ok(oneTime.body.every((p: { kind: string; clientId: string }) => p.kind === "ONE_TIME" && p.clientId === taqueriaUnicaId));

  assert.equal((await call("GET", "/payments", { auth: null })).status, 401);
});
