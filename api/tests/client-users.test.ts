/**
 * Usuarios de clientes, roles y API de la app (contrato §4 y §5) contra la API
 * real y la BD local de pruebas: alta con username generado y colisiones,
 * PATCH, reset de contraseña, login de la app, `/app/me` y cambio de contraseña.
 *
 * Usa las tablas nuevas (`client_users`, `roles`, `client_user_roles`). No borra
 * el catálogo de roles de TAQUERIA que siembra la migración.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app";
import { db } from "../src/db";
import { TEMPORARY_PASSWORD_ALPHABET } from "../src/lib/passwords";

let server: Server;
let base = "";
let token = "";
let taqueria = "";
let clientA = "";
let clientB = "";
let codeA = "";
let codeB = "";
let deviceAId = "";
/** Contraseñas temporales conocidas por username, para probar el login. */
const temporaries = new Map<string, string>();

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

const cleanup = async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "client_user_roles", "client_users", "devices", "payments", "clients", "plans", "admins" CASCADE'
  );
  await db.role.deleteMany({ where: { product: { is: { key: { not: "TAQUERIA" } } } } });
  await db.product.deleteMany({ where: { key: { not: "TAQUERIA" } } });
};

before(async () => {
  await cleanup();
  await db.admin.create({ data: { username: "yo", name: "Yo", passwordHash: await bcrypt.hash("clave-de-prueba-123", 4) } });
  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

  token = (await call("POST", "/auth/login", { body: { username: "yo", password: "clave-de-prueba-123" }, auth: null })).body.token;
  taqueria = (await call("GET", "/products")).body.find((p: { key: string }) => p.key === "TAQUERIA").id;

  clientA = (await call("POST", "/clients", { body: { productId: taqueria, name: "Tacos El Güero" } })).body.id;
  clientB = (await call("POST", "/clients", { body: { productId: taqueria, name: "Taquería Norte" } })).body.id;
  const deviceA = await call("POST", `/clients/${clientA}/devices`, { body: { name: "Tablet A" } });
  codeA = deviceA.body.code;
  deviceAId = deviceA.body.device.id;
  codeB = (await call("POST", `/clients/${clientB}/devices`, { body: { name: "Tablet B" } })).body.code;
});

after(async () => {
  server.close();
  // Deja la BD local como estaba: el catálogo de roles de TAQUERIA se conserva.
  await cleanup();
  await db.$disconnect();
});

test("GET /roles: catálogo del producto TAQUERIA con los ids del contrato", async () => {
  const res = await call("GET", `/roles?productId=${taqueria}`);
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.map((role: { key: string }) => role.key),
    ["ADMIN", "CAJERO", "COCINA", "GERENTE", "MESERO"]
  );
  assert.deepEqual(res.body.find((role: { key: string }) => role.key === "ADMIN"), {
    id: "d1000000-0000-4000-8000-000000000001",
    key: "ADMIN",
    name: "Administrador",
    permissions: [],
    active: true,
  });
  assert.equal(res.body.find((role: { key: string }) => role.key === "CAJERO").id, "d1000000-0000-4000-8000-000000000003");

  // Sin producto es error de validación; sin sesión no entra la consola.
  assert.equal((await call("GET", "/roles")).status, 400);
  assert.equal((await call("GET", `/roles?productId=${taqueria}`, { auth: null })).status, 401);
});

test("alta de usuario: username generado, colisiones y validaciones", async () => {
  const first = await call("POST", `/clients/${clientA}/users`, {
    body: { name: "Asael Amaro", roles: ["ADMIN", "CAJERO"] },
  });
  assert.equal(first.status, 201);
  const user = first.body.user;
  assert.equal(user.username, "asael.amaro");
  assert.equal(user.clientId, clientA);
  assert.equal(user.name, "Asael Amaro");
  assert.equal(user.active, true);
  assert.equal(user.mustChangePassword, true);
  assert.equal(user.lastLoginAt, null);
  assert.ok(Date.parse(user.createdAt) > 0);
  assert.deepEqual(user.roles.map((role: { key: string }) => role.key), ["ADMIN", "CAJERO"]);
  assert.deepEqual(user.roles[0], {
    id: "d1000000-0000-4000-8000-000000000001",
    key: "ADMIN",
    name: "Administrador",
    permissions: [],
    active: true,
  });
  assert.ok(!("passwordHash" in user));

  const temporary = first.body.temporaryPassword as string;
  assert.equal(temporary.length, 12);
  for (const char of temporary) assert.ok(TEMPORARY_PASSWORD_ALPHABET.includes(char), `carácter raro: ${char}`);
  temporaries.set("asael.amaro", temporary);

  // En BD solo el hash, costo 12 y verifica la temporal (contrato §2).
  const stored = await db.clientUser.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(bcrypt.getRounds(stored.passwordHash), 12);
  assert.ok(await bcrypt.compare(temporary, stored.passwordHash));

  // Mismo nombre en el mismo cliente: inicial+apellido y luego sufijos.
  const second = await call("POST", `/clients/${clientA}/users`, { body: { name: "Asael Amaro", roles: ["MESERO"] } });
  assert.equal(second.status, 201);
  assert.equal(second.body.user.username, "aamaro");
  temporaries.set("aamaro", second.body.temporaryPassword);
  const third = await call("POST", `/clients/${clientA}/users`, { body: { name: "Asael Amaro", roles: ["COCINA"] } });
  assert.equal(third.status, 201);
  assert.equal(third.body.user.username, "aamaro2");
  temporaries.set("aamaro2", third.body.temporaryPassword);

  // Explícito: se normaliza; repetido en el cliente → 409; inválido → 400.
  const taken = await call("POST", `/clients/${clientA}/users`, {
    body: { name: "Otro Nombre", username: " Asael.Amaro ", roles: ["MESERO"] },
  });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.code, "USERNAME_TAKEN");
  for (const bad of ["1malo", "ab", "con espacio", "asael/amaro"]) {
    const res = await call("POST", `/clients/${clientA}/users`, {
      body: { name: "Otro Nombre", username: bad, roles: ["MESERO"] },
    });
    assert.equal(res.status, 400, `debió rechazar ${bad}`);
    assert.equal(res.body.code, "INVALID_USERNAME");
  }
  const explicit = await call("POST", `/clients/${clientA}/users`, {
    body: { name: "Jefa de Turno", username: " Jefe.Turno ", roles: ["GERENTE"] },
  });
  assert.equal(explicit.status, 201);
  assert.equal(explicit.body.user.username, "jefe.turno");
  assert.deepEqual(explicit.body.user.roles.map((role: { key: string }) => role.key), ["GERENTE"]);
  temporaries.set("jefe.turno", explicit.body.temporaryPassword);

  // Lista del cliente: todos, sin hashes.
  const list = await call("GET", `/clients/${clientA}/users`);
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.body.map((row: { username: string }) => row.username).sort(),
    ["aamaro", "aamaro2", "asael.amaro", "jefe.turno"]
  );
  assert.ok(list.body.every((row: { passwordHash?: string }) => row.passwordHash === undefined));

  // Roles: mínimo uno, solo keys activas del producto del cliente.
  assert.equal((await call("POST", `/clients/${clientA}/users`, { body: { name: "Sin Rol", roles: [] } })).status, 400);
  const badRole = await call("POST", `/clients/${clientA}/users`, { body: { name: "Rol Malo", roles: ["GOD"] } });
  assert.equal(badRole.status, 400);
  assert.equal(badRole.body.code, "INVALID_ROLES");
  assert.match(badRole.body.message, /GOD/);

  // Cliente inexistente → 404.
  const missing = await call("POST", `/clients/${randomUUID()}/users`, { body: { name: "Fantasma", roles: ["MESERO"] } });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "CLIENT_NOT_FOUND");

  // Un rol de otro producto no se puede asignar: CheckLab no tiene ADMIN.
  const checklab = await call("POST", "/products", { body: { key: "CHECKLAB", name: "CheckLab" } });
  assert.equal(checklab.status, 201);
  const labClient = await call("POST", "/clients", { body: { productId: checklab.body.id, name: "Laboratorio Uno" } });
  assert.equal(labClient.status, 201);
  const crossed = await call("POST", `/clients/${labClient.body.id}/users`, { body: { name: "RH Uno", roles: ["ADMIN"] } });
  assert.equal(crossed.status, 400);
  assert.equal(crossed.body.code, "INVALID_ROLES");
});

test("el mismo username se permite en otro cliente y el login resuelve por dispositivo", async () => {
  const created = await call("POST", `/clients/${clientB}/users`, { body: { name: "Asael Amaro", roles: ["MESERO"] } });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.username, "asael.amaro");

  const login = await call("POST", "/app/login", {
    auth: null,
    body: { code: codeB, username: "ASAEL.AMARO", password: created.body.temporaryPassword },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.client.id, clientB);
  assert.equal(login.body.client.name, "Taquería Norte");
  assert.equal(login.body.user.id, created.body.user.id);
  assert.equal(login.body.user.username, "asael.amaro");
  assert.deepEqual(login.body.roles, [{ key: "MESERO", name: "Mesero" }]);
  assert.deepEqual(login.body.product, { key: "TAQUERIA", name: "Taquería" });
  assert.equal(login.body.license.status, "ACTIVE");
  assert.deepEqual(login.body.license.tenant, { name: "Taquería Norte" });
});

test("PATCH de usuario: nombre, username, roles y activo; /app/me corta al inactivarlo", async () => {
  const list = (await call("GET", `/clients/${clientA}/users`)).body;
  const target = list.find((row: { username: string }) => row.username === "aamaro2");
  assert.ok(target);
  const appToken = (
    await call("POST", "/app/login", {
      auth: null,
      body: { code: codeA, username: "aamaro2", password: temporaries.get("aamaro2") },
    })
  ).body.token as string;

  const edited = await call("PATCH", `/clients/${clientA}/users/${target.id}`, {
    body: { name: "Asael A.", username: "asael.amaro2", roles: ["GERENTE"], active: false },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.name, "Asael A.");
  assert.equal(edited.body.username, "asael.amaro2");
  assert.equal(edited.body.active, false);
  assert.deepEqual(edited.body.roles.map((role: { key: string }) => role.key), ["GERENTE"]);

  // Inactivo: ni login ni `/app/me` con el token que ya tenía.
  const blocked = await call("POST", "/app/login", {
    auth: null,
    body: { code: codeA, username: "asael.amaro2", password: temporaries.get("aamaro2") },
  });
  assert.equal(blocked.status, 401);
  assert.equal(blocked.body.code, "INVALID_CREDENTIALS");
  assert.equal((await call("GET", "/app/me", { auth: appToken })).body.code, "INVALID_TOKEN");

  // Reactivar sin tocar username ni roles.
  const reactivated = await call("PATCH", `/clients/${clientA}/users/${target.id}`, { body: { active: true } });
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.body.active, true);
  assert.deepEqual(reactivated.body.roles.map((role: { key: string }) => role.key), ["GERENTE"]);

  // Username tomado por otro usuario del mismo cliente → 409; inválido → 400.
  const clash = await call("PATCH", `/clients/${clientA}/users/${target.id}`, { body: { username: "aamaro" } });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.code, "USERNAME_TAKEN");
  for (const bad of ["1malo", "ab", "con espacio"]) {
    const res = await call("PATCH", `/clients/${clientA}/users/${target.id}`, { body: { username: bad } });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "INVALID_USERNAME");
  }

  // Roles del PATCH: mínimo uno y del producto.
  assert.equal((await call("PATCH", `/clients/${clientA}/users/${target.id}`, { body: { roles: [] } })).status, 400);
  assert.equal(
    (await call("PATCH", `/clients/${clientA}/users/${target.id}`, { body: { roles: ["GOD"] } })).body.code,
    "INVALID_ROLES"
  );

  // Usuario de otro cliente o inexistente → 404.
  const other = (await call("GET", `/clients/${clientB}/users`)).body[0];
  assert.equal((await call("PATCH", `/clients/${clientA}/users/${other.id}`, { body: { name: "Robado" } })).status, 404);
  assert.equal(
    (await call("PATCH", `/clients/${clientA}/users/${randomUUID()}`, { body: { name: "Nadie" } })).body.code,
    "USER_NOT_FOUND"
  );
});

test("app: login, /app/me, cambio de contraseña y reset desde la consola", async () => {
  const created = await call("POST", `/clients/${clientA}/users`, { body: { name: "Lupita Cocina", roles: ["COCINA"] } });
  assert.equal(created.status, 201);
  const username = created.body.user.username as string;
  const userId = created.body.user.id as string;
  assert.equal(username, "lupita.cocina");
  const temporary = created.body.temporaryPassword as string;

  // Credenciales malas, usuario inexistente y dispositivo inválido.
  const badPassword = await call("POST", "/app/login", { auth: null, body: { code: codeA, username, password: "mala" } });
  assert.equal(badPassword.status, 401);
  assert.equal(badPassword.body.code, "INVALID_CREDENTIALS");
  const unknown = await call("POST", "/app/login", { auth: null, body: { code: codeA, username: "no.existe", password: temporary } });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.code, "INVALID_CREDENTIALS");
  const badDevice = await call("POST", "/app/login", {
    auth: null,
    body: { code: "axc_inventado", username, password: temporary },
  });
  assert.equal(badDevice.status, 401);
  assert.equal(badDevice.body.code, "INVALID_DEVICE_CODE");

  const login = await call("POST", "/app/login", {
    auth: null,
    body: { code: codeA, username: " LUPITA.COCINA ", password: temporary },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.token.split(".").length, 3);
  assert.deepEqual(login.body.user, { id: userId, name: "Lupita Cocina", username, mustChangePassword: true });
  assert.deepEqual(login.body.roles, [{ key: "COCINA", name: "Cocina" }]);
  assert.deepEqual(login.body.client, { id: clientA, name: "Tacos El Güero" });
  assert.deepEqual(login.body.product, { key: "TAQUERIA", name: "Taquería" });
  assert.equal(login.body.license.status, "ACTIVE");
  assert.deepEqual(login.body.license.tenant, { name: "Tacos El Güero" });
  assert.equal(login.body.license.plan, null);
  assert.equal(login.body.license.nextDueDate, null);
  assert.ok(Date.parse(login.body.license.validUntil) >= Date.parse(login.body.license.serverTime));
  const appToken = login.body.token as string;

  // `lastLoginAt` se ve en la consola.
  const listed = (await call("GET", `/clients/${clientA}/users`)).body.find((row: { id: string }) => row.id === userId);
  assert.ok(listed.lastLoginAt);

  // `/app/me`: mismo cuerpo que el login sin token; el token de la Central no sirve.
  const me = await call("GET", "/app/me", { auth: appToken });
  assert.equal(me.status, 200);
  assert.ok(!("token" in me.body));
  assert.deepEqual(Object.keys(me.body).sort(), ["client", "license", "product", "roles", "user"]);
  assert.deepEqual(me.body.user, login.body.user);
  assert.deepEqual(me.body.roles, login.body.roles);
  assert.deepEqual(me.body.client, login.body.client);
  assert.deepEqual(me.body.product, login.body.product);
  assert.equal(me.body.license.status, "ACTIVE");
  assert.equal((await call("GET", "/app/me", { auth: token })).body.code, "INVALID_TOKEN");
  assert.equal((await call("GET", "/app/me", { auth: null })).body.code, "INVALID_TOKEN");

  // Cambio de contraseña: actual mala → 401; nueva corta → 400; correcta → 200.
  const wrongCurrent = await call("POST", "/app/password", {
    auth: appToken,
    body: { currentPassword: "mala", newPassword: "nueva-clave-123" },
  });
  assert.equal(wrongCurrent.status, 401);
  assert.equal(wrongCurrent.body.code, "INVALID_CREDENTIALS");
  assert.equal(
    (await call("POST", "/app/password", { auth: appToken, body: { currentPassword: temporary, newPassword: "corta12" } }))
      .status,
    400
  );
  const changed = await call("POST", "/app/password", {
    auth: appToken,
    body: { currentPassword: temporary, newPassword: "nueva-clave-123" },
  });
  assert.equal(changed.status, 200);
  assert.equal((await call("GET", "/app/me", { auth: appToken })).body.user.mustChangePassword, false);

  const withNew = await call("POST", "/app/login", { auth: null, body: { code: codeA, username, password: "nueva-clave-123" } });
  assert.equal(withNew.status, 200);
  assert.equal(withNew.body.user.mustChangePassword, false);
  assert.equal(
    (await call("POST", "/app/login", { auth: null, body: { code: codeA, username, password: temporary } })).status,
    401
  );

  // Reset desde la consola: temporal nueva y `mustChangePassword` otra vez en true.
  const reset = await call("POST", `/clients/${clientA}/users/${userId}/password`);
  assert.equal(reset.status, 200);
  assert.equal(reset.body.user.mustChangePassword, true);
  const resetTemporary = reset.body.temporaryPassword as string;
  assert.notEqual(resetTemporary, temporary);
  assert.equal(resetTemporary.length, 12);
  assert.ok(await bcrypt.compare(resetTemporary, (await db.clientUser.findUniqueOrThrow({ where: { id: userId } })).passwordHash));
  const resetLogin = await call("POST", "/app/login", { auth: null, body: { code: codeA, username, password: resetTemporary } });
  assert.equal(resetLogin.status, 200);
  assert.equal(resetLogin.body.user.mustChangePassword, true);
  assert.equal(
    (await call("POST", "/app/login", { auth: null, body: { code: codeA, username, password: "nueva-clave-123" } })).status,
    401
  );

  // Dispositivo revocado: el login de la app deja de entrar.
  await call("PATCH", `/clients/${clientA}/devices/${deviceAId}`, { body: { active: false } });
  const revoked = await call("POST", "/app/login", { auth: null, body: { code: codeA, username, password: resetTemporary } });
  assert.equal(revoked.status, 401);
  assert.equal(revoked.body.code, "INVALID_DEVICE_CODE");
  await call("PATCH", `/clients/${clientA}/devices/${deviceAId}`, { body: { active: true } });
});
