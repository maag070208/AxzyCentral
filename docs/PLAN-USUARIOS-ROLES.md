# Plan — Usuarios y roles de clientes (modo admin de la app)

> Estado: **propuesta** (no implementado). Pendiente de confirmar catálogo de roles y
> política de contraseñas. La migración será **aditiva** (crear tablas), sin borrar nada.

## Objetivo

Dar a cada cliente de Axzy Central **usuarios con usuario y contraseña** para entrar a la
app en **modo admin**, con **N roles por usuario** (no un rol fijo), y mantenerlo escalable
para los próximos productos y apps.

## Convención de usuario

El `username` se genera a partir del nombre, en minúsculas y sin acentos:

1. `nombre.apellido` → `asael.amaro`
2. Si ya existe: `inicialnombre + apellido` → `aamaro`
3. Si también existe: sufijo numérico → `aamaro2`, `aamaro3`…

- El usuario puede editar el sugerido antes de guardar, pero debe respetar
  `^[a-z][a-z0-9._-]{2,39}$`.
- Se sugiere **único globalmente** (la app inicia sesión solo con usuario y contraseña, sin
  pedir el cliente). Si se quisiera único por cliente, el login tendría que pedir además el
  cliente o un código; no es lo recomendable para la app.
- Al escribir el nombre en el alta, la Central muestra el `username` sugerido en vivo.

## Modelo de datos (Prisma, migración aditiva)

```prisma
model ClientUser {
  id           String   @id @default(uuid())
  clientId     String
  client       Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  name         String
  username     String   @unique
  passwordHash String
  active       Boolean  @default(true)
  lastLoginAt  DateTime?
  mustChangePassword Boolean @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  roles        ClientUserRole[]

  @@index([clientId])
  @@map("client_users")
}

model Role {
  id        String   @id @default(uuid())
  /// Producto al que pertenece el rol (p. ej. TAQUERIA). Escalable a otras apps.
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Restrict)
  /// Clave estable que usan la API y la app.
  key       String
  name      String
  /// Permisos finos a futuro (JSON): ["menu.edit", "reports.view", …]
  permissions Json   @default("[]")
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  users     ClientUserRole[]

  @@unique([productId, key])
  @@map("roles")
}

model ClientUserRole {
  userId String
  user   ClientUser @relation(fields: [userId], references: [id], onDelete: Cascade)
  roleId String
  role   Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@id([userId, roleId])
  @@map("client_user_roles")
}
```

- Tabla puente = **N roles por usuario**, sin tocar la tabla de usuarios al agregar roles.
- Los roles son **por producto**, así mañana CheckLab/Tacomanda pueden tener catálogos
  distintos.
- Borrar un usuario no borra roles; borrar un cliente sí limpia sus usuarios (cascade).
- **Nada de borrados de datos existentes**: la migración solo crea tablas/enums nuevos.

## Roles propuestos (a confirmar)

Para la app de taquería, catálogo inicial:

| key | Nombre | Uso |
| --- | --- | --- |
| `ADMIN` | Administrador | Modo admin completo de la app del cliente |
| `GERENTE` | Gerente | Operación y reportes |
| `CAJERO` | Cajero | Cobros y cierres |
| `MESERO` | Mesero | Toma de órdenes |
| `COCINA` | Cocina | Monitor de cocina |

Se pueden sembrar solo los que quieras y agregar más después sin migrar la tabla de usuarios.

## Contraseñas

- Guardar solo `bcrypt` (costo 12), nunca en claro.
- El admin de la Central define una contraseña inicial al crear el usuario o deja que se
  **genere una temporal** y se muestre una sola vez (copiar/WhatsApp).
- `mustChangePassword = true`: la app pide cambiarla en el primer login.
- Reinicio de contraseña desde la Central (genera temporal nueva).
- Reglas: mínimo 8, máximo 72 (límite bcrypt). Rate limit en el login.

## API

Administración (JWT de la Central, `requireAdmin`):
- `GET /api/v1/clients/:id/users` — usuarios del cliente (sin hash).
- `POST /api/v1/clients/:id/users` — `{ name, username?, roles: string[], password? }`.
  Si no viene `username`, se genera con la convención; si no viene `password`, se devuelve
  una temporal **una sola vez**.
- `PATCH /api/v1/clients/:id/users/:userId` — `{ name?, username?, active?, roles? }`.
- `POST /api/v1/clients/:id/users/:userId/password` — nueva temporal (se muestra una vez).
- `GET /api/v1/roles?productId=` — catálogo de roles del producto.

App del cliente (público, rate limit):
- `POST /api/v1/app/login` — `{ username, password }` → `{ token, user: { id, name, username },
  roles: [{ key, name }], client: { id, name }, product, license: { status, validUntil } }`.
  Token JWT propio de la app (TTL corto + refresh o re-login).
- `GET /api/v1/app/me` — valida token y devuelve usuario, roles y licencia.
- `POST /api/v1/app/password` — cambio de contraseña autenticado.

Reglas:
- Usuario inactivo o cliente suspendido → 401/403 con código claro.
- La app de taquería **sigue funcionando offline** para operar; el login admin es online (se
  puede cachear la sesión y los roles localmente, con revalidación al conectar).

## Central (web)

En el detalle del cliente, nueva tarjeta **Usuarios** (debajo de Licencias):
- Tabla: nombre, usuario, roles (chips), último acceso, estado, acciones (editar, reset
  contraseña, activar/desactivar).
- Botón **Nuevo usuario**: nombre → usuario sugerido automático (nombre.apellido /
  inicial+apellido, editable) → roles multi-select → contraseña (definir o temporal).
- Al crear, si es temporal, mostrar una sola vez el usuario + contraseña con copiar/WhatsApp,
  igual que el código QR.

## App Tacomanda (siguiente bloque)

- Pantalla de roles inicial: además de Cocina/Mesero, opción **Administración**.
- Login usuario/contraseña contra `/app/login`; guardar token/roles; mostrar solo lo que
  permitan los roles (hoy el panel de menú/configuración).
- Si no hay internet: permitir operar como cocina/mesero (sin admin) o usar la última sesión
  admin cacheada, según se decida.
- Cambio obligatorio de contraseña en el primer login.

## Pruebas y despliegue

1. Migración + seed de roles en la BD local (Docker 55434).
2. Integración: alta de usuario, login OK/ko, 2+ roles, reset, usuario inactivo, cliente
   suspendido, convención de username duplicada.
3. Web: tarjeta Usuarios, alta y reset con typecheck/build y capturas.
4. App: login admin con Maestro/emulador.
5. Despliegue del API: **Docker Hub → Railway**. La migración es aditiva; no borra ni truena
   tablas existentes. Probar primero en local y luego publicar.

## Decisiones pendientes

1. ¿Catálogo de roles inicial? (propuesta arriba; ¿dejamos solo `ADMIN` por ahora?). 
2. ¿Username único global o por cliente? (recomiendo global).
3. ¿Contraseña definida por ti o temporal generada mostrada una vez?
4. ¿El modo admin de la app debe pedir login siempre o recordar sesión? 
