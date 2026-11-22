# Contrato — Usuarios y roles de clientes (modo admin de la app)

**Decidido por el dueño:**
- Catálogo de roles: `ADMIN`, `GERENTE`, `CAJERO`, `MESERO`, `COCINA`.
- `username` **único por cliente** (la app resuelve el cliente con el código de activación del dispositivo).
- Contraseña **temporal generada**, se muestra una sola vez y la app obliga a cambiarla.
- La app **recuerda la sesión** y revalida al conectar.
- Publicar a Railway tras probar en local; la migración es **aditiva** (solo crea tablas; no borra nada).

## 1. Modelo de datos (Prisma)

Migración nueva: `api/prisma/migrations/20261122000000_client_users_roles/`.

```prisma
model ClientUser {
  id                 String   @id @default(uuid())
  clientId           String
  client             Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  name               String
  username           String
  passwordHash       String
  active             Boolean  @default(true)
  lastLoginAt        DateTime?
  mustChangePassword Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  roles              ClientUserRole[]

  @@unique([clientId, username])
  @@index([clientId])
  @@map("client_users")
}

model Role {
  id          String           @id @default(uuid())
  productId   String
  product     Product          @relation(fields: [productId], references: [id], onDelete: Restrict)
  key         String
  name        String
  permissions Json             @default("[]")
  active      Boolean          @default(true)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  users       ClientUserRole[]

  @@unique([productId, key])
  @@map("roles")
}

model ClientUserRole {
  userId String
  roleId String
  user   ClientUser @relation(fields: [userId], references: [id], onDelete: Cascade)
  role   Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@id([userId, roleId])
  @@map("client_user_roles")
}
```

- `Client` gana `users ClientUser[]`; `Product` gana `roles Role[]`.
- SQL de migración crea tablas, índice único `(clientId, username)`, y **siembra los 5 roles
  del producto TAQUERIA** (`b7a1c0de-0000-4000-8000-000000000001`) con ids fijos:
  `d1000000-0000-4000-8000-000000000001` … `…0005`, `permissions = '[]'::jsonb`.
- No se modifica ni borra ninguna tabla existente.

## 2. Username y contraseña

**Generación** (módulo `api/src/lib/usernames.ts`, con pruebas):
- normaliza el nombre: minúsculas, sin acentos, separa palabras.
- candidatos: `nombre.apellido` → `inicial+apellido` → `base2`, `base3`…
- unicidad **dentro del cliente** (`clientId + username`).
- un username explícito se normaliza con `^[a-z][a-z0-9._-]{2,39}$`; si ya existe en ese
  cliente → `409 USERNAME_TAKEN`.
- Ejemplos: `Asael Amaro` → `asael.amaro`, si existe → `aamaro`, si existe → `aamaro2`.

**Contraseña temporal:**
- 12 caracteres de un alfabeto sin ambigüedad (`ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789`).
- bcrypt costo 12; en BD solo el hash.
- Se devuelve **una sola vez** en el alta y en el reset; `mustChangePassword = true`.
- Cambio desde la app: mínimo 8, máximo 72.

## 3. Vistas

```ts
roleView = { id, key, name, permissions: unknown[], active }
clientUserView = {
  id, clientId, name, username, active, mustChangePassword,
  lastLoginAt: string|null, createdAt: string,
  roles: roleView[]
}
```

## 4. API de administración (JWT de la Central)

`GET /api/v1/roles?productId=<uuid>` → `roleView[]` (activos e inactivos, orden key).

`GET /api/v1/clients/:id/users` → `clientUserView[]`.

`POST /api/v1/clients/:id/users`
```json
{ "name": "Asael Amaro", "username": "opcional", "roles": ["ADMIN", "CAJERO"] }
```
- Los roles se mandan por **key** y deben ser del producto del cliente; mínimo uno activo.
- Si no viene `username`, se genera; si viene, se valida y se respeta.
- Respuesta 201: `{ user: clientUserView, temporaryPassword: "…" }`.

`PATCH /api/v1/clients/:id/users/:userId`
`{ name?, username?, roles?, active? }` (roles por key; si se manda, mínimo uno). → `clientUserView`.

`POST /api/v1/clients/:id/users/:userId/password` → `{ user, temporaryPassword }`; marca
`mustChangePassword = true`.

Errores: 404 `CLIENT_NOT_FOUND`/`USER_NOT_FOUND`, 409 `USERNAME_TAKEN`, 400 validación.

## 5. API de la app (pública, sin JWT de la Central)

`POST /api/v1/app/login` (rate limit 20/min)
```json
{ "code": "axc_…", "username": "asael.amaro", "password": "…" }
```
- `code` = código de activación del dispositivo: resuelve el cliente (así el username es único
  por cliente sin pedirlo).
- Dispositivo inactivo → 401 `INVALID_DEVICE_CODE`; usuario inexistente/inactivo o contraseña
  mala → 401 `INVALID_CREDENTIALS` (mismo mensaje).
- Actualiza `lastLoginAt`.
- Respuesta 200:
```json
{
  "token": "…",
  "user": { "id": "…", "name": "…", "username": "…", "mustChangePassword": true },
  "roles": [{ "key": "ADMIN", "name": "Administrador" }],
  "client": { "id": "…", "name": "…" },
  "product": { "key": "TAQUERIA", "name": "Taquería" },
  "license": { "status": "ACTIVE", "tenant": {...}, "product": {...}, "plan": {...},
               "nextDueDate": "…", "validUntil": "…", "serverTime": "…" }
}
```
- Token JWT propio de la app: payload `{ sub: userId, clientId, productId, typ: "app" }`,
  `expiresIn: "30d"`, firmado con `JWT_SECRET`.

`GET /api/v1/app/me` (Bearer token de la app) → mismo cuerpo que el login **sin `token`**.
- Usuario inactivo o cliente inexistente → 401 `INVALID_TOKEN`.

`POST /api/v1/app/password` (Bearer token de la app) `{ currentPassword, newPassword }`.
- Valida la actual; actualiza hash y `mustChangePassword = false`. 401 `INVALID_CREDENTIALS`
  si la actual no coincide; 400 si nueva < 8.

## 6. Central web

En el detalle del cliente, debajo de **Licencias**, tarjeta **Usuarios**:
- Tabla: nombre + username, roles (chips), último acceso, estado, badges `Debe cambiar
  contraseña`; acciones: editar, reset contraseña, activar/desactivar.
- **Nuevo usuario**: nombre → username sugerido en vivo (editable), roles multi-select
  (checkbox/chips), aviso de contraseña temporal. Al guardar, diálogo con **usuario +
  contraseña temporal una sola vez**, copiar y WhatsApp.
- **Editar**: nombre, username, roles, activo.
- **Reset**: confirmación y diálogo con la nueva temporal una sola vez.
- No mostrar nunca el hash ni contraseñas guardadas.

## 7. Pruebas

- Unitarias: generación de usernames (acentos, una palabra, colisiones) y generador de
  contraseñas.
- Integración (BD local Docker):
  - alta de usuario + roles; username generado y colisión dentro del cliente;
  - mismo username permitido en otro cliente;
  - login app OK; contraseña mala; usuario inactivo; dispositivo inválido;
  - `/app/me` y cambio de contraseña; `mustChangePassword` baja a false;
  - reset de contraseña por la Central; roles inválidos/de otro producto → 400/409.
- Web: typecheck/build + capturas; alta, edición y reset probados contra API local.
- App Tacomanda (siguiente bloque, no en este deploy): pantalla “Administración” con login,
  guardar token y revalidar al conectar.

## 8. Publicación

- Commit de `api/**` + `web/**` → GitHub Actions publica imagen Docker y despliega web FTP.
- Railway redepliega el API y aplica la migración **aditiva** al arrancar. No se borran datos.
- Verificar en producción: `/api/v1/app/login` responde 401/400 (existe), no 404; `/config`
  sigue 200; la consola muestra la tarjeta Usuarios.
