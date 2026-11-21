# Contrato — Activación por QR, planes y cobros

**Fecha:** 2026-11-21 · **Estado:** implementado y verificado (API, consola y app).
**Frentes:** `AxzyCentral/api` · `AxzyCentral/web` · `Taqueria/app`
**Decisiones del dueño:** diseño bento de PTNV (colores teal/navy intactos) · cobros solo
registro en la Central (sin pasarela) · la Central muestra el QR y la tablet de cocina lo
escanea con la app.

Este archivo manda. Si algo del contrato no cuadra con el código, avisa al Lead antes de
inventar una variante.

---

## 1. Objetivo

1. Rediseñar la consola con el lenguaje **bento** del UI System (`appearance="bento"`,
   shell flotante, tarjetas/tiles pastel), conservando la marca axzydev.
2. Activar la app de taquería **escaneando un QR**: la Central lo genera y lo muestra, la
   tablet de cocina lo escanea con la cámara y queda dada de alta sin teclear el código.
3. Planes **por producto** con dos formas de cobro: **recurrente** (mensual) y **único**,
   y generación de cobros desde la Central.

Sin commits, sin stash, sin `release.sh`, sin subir versiones: todo se queda en el árbol de
trabajo. Documentación y textos de UI en español.

---

## 2. Alcance por frente (scopes de escritura)

| Frente | Escribe en | No toca |
| --- | --- | --- |
| API | `AxzyCentral/api/**` | `web/`, `Taqueria/` |
| Web | `AxzyCentral/web/**`, `AxzyCentral/pnpm-lock.yaml` (solo si agrega dependencia) | `api/`, `Taqueria/` |
| App | `Taqueria/app/**`, `Taqueria/gradle/**`, `Taqueria/README.md` | `AxzyCentral/` |

El Lead es dueño de este contrato, del README raíz y de la verificación final.

---

## 3. Modelo de datos (Prisma + migración a mano)

Migración nueva: `api/prisma/migrations/20261121020000_planes_cobros_qr/migration.sql`.
**No correr `prisma migrate` contra Railway.** El `.env` apunta a la BD real; la migración se
prueba en la BD local de Docker que levanta el Lead.

### Enums nuevos

```prisma
enum BillingType { RECURRING ONE_TIME }
enum PaymentKind { RECURRING ONE_TIME }
```

### `Plan`

- `monthlyPrice` se **renombra** a `price` (`Decimal(10,2)`).
- `billingType BillingType @default(RECURRING)`.
- `RECURRING`: el precio es mensual. `ONE_TIME`: el precio se cobra una sola vez.
- `@@unique([productId, name])` se conserva. Nada de límites de dispositivos por ahora.

SQL:

```sql
CREATE TYPE "BillingType" AS ENUM ('RECURRING', 'ONE_TIME');
ALTER TABLE "plans" RENAME COLUMN "monthlyPrice" TO "price";
ALTER TABLE "plans" ADD COLUMN "billingType" "BillingType" NOT NULL DEFAULT 'RECURRING';
```

### `Payment`

- `kind PaymentKind @default(RECURRING)`.
- `period String?` pasa a **opcional** (único = sin periodo). `@@unique([clientId, period])`
  se conserva: en PostgreSQL varios `NULL` conviven, así que no bloquea los cobros únicos.
- `concept String?` nuevo (p. ej. "Instalación y capacitación").

SQL:

```sql
CREATE TYPE "PaymentKind" AS ENUM ('RECURRING', 'ONE_TIME');
ALTER TABLE "payments" ADD COLUMN "kind" "PaymentKind" NOT NULL DEFAULT 'RECURRING';
ALTER TABLE "payments" ALTER COLUMN "period" DROP NOT NULL;
ALTER TABLE "payments" ADD COLUMN "concept" TEXT;
CREATE INDEX "payments_clientId_kind_idx" ON "payments"("clientId", "kind");
```

### `Device`

- `model String?` (modelo del teléfono/tablet que se dio de alta).
- `activatedAt DateTime?` (primera activación real).

SQL:

```sql
ALTER TABLE "devices" ADD COLUMN "model" TEXT;
ALTER TABLE "devices" ADD COLUMN "activatedAt" TIMESTAMP(3);
```

---

## 4. Vistas (JSON que devuelve la API)

```ts
planView = { id, productId, productName, name, price: string, billingType: "RECURRING"|"ONE_TIME", active }
planList = planView & { clients: number }

paymentView = { id, kind: "RECURRING"|"ONE_TIME", period: string|null, concept: string|null,
                amount: string, dueDate: "YYYY-MM-DD", status: "PENDING"|"PAID"|"CANCELLED",
                paidAt: string|null, method: string|null, notes: string|null }

deviceView = { id, name, model: string|null, active: boolean,
               lastSeenAt: string|null, activatedAt: string|null, createdAt: string }
```

`ClientSummary` / `ClientDetail` conservan sus llaves actuales (`plan`, `payments`, `devices`,
`nextDueDate`, `overdue`, `product`…). La app de taquería **solo** lee `GET /license`, así que
su contrato no cambia.

---

## 5. API (Express)

Prefijo `/api/v1`. Todo lo administrativo lleva `requireAdmin`; `/activate` y `/config` son
públicos.

### 5.1 `GET /config` (público)

```json
{ "apiUrl": "https://central-api.axzy.dev/api/v1" }
```

`apiUrl` = `PUBLIC_API_URL` del entorno (nueva variable, opcional) o, si no está,
`${req.protocol}://${req.get("host")}/api/v1` (sin `/` final). Agregar `PUBLIC_API_URL` a
`api/.env.example` con su comentario. Es la URL que viaja dentro del QR.

### 5.2 `POST /activate` (público, rate limit 30/min)

Activa y **da de alta** el dispositivo al mismo tiempo.

```json
// request
{ "code": "axc_…", "device": { "name": "Tablet de cocina", "model": "SAMSUNG SM-T290" } }
// response 200 (mismo cuerpo que GET /license + device)
{ "status": "ACTIVE", "tenant": { "name": "Tacos El Güero" },
  "product": { "key": "TAQUERIA", "name": "Taquería" }, "plan": { "name": "Básico" },
  "nextDueDate": null, "validUntil": "…", "serverTime": "…",
  "device": { "id": "…", "name": "Tablet de cocina" } }
```

- Código inexistente/revocado → `401 INVALID_DEVICE_CODE`.
- Actualiza `lastSeenAt`, `activatedAt` (si venía null) y `model` (si venía null).
- Si el dispositivo nunca se había activado y llega `device.name`, lo adopta (máx. 60).
- Compartir con `GET /license` un helper `lib/license.ts` que arme la respuesta y busque el
  dispositivo por código (no duplicar lógica).

### 5.3 `GET /license` (público, igual que hoy)

Mismo cuerpo que hoy. Opcionalmente añadir el `document`/`device` no es necesario.

### 5.4 Planes

- `POST /plans` `{ productId, name, billingType?, price }` — `billingType` default
  `RECURRING`; `price` 0..1_000_000.
- `PATCH /plans/:id` `{ name?, billingType?, price?, active? }`.
- `GET /plans?productId=` devuelve `planList` ordenado por `active desc`, `productId`, `price`.

### 5.5 Clientes y cobros

- `POST /clients` y `PATCH /clients/:id` siguen igual (solo cambia la vista del plan).
- `POST /clients/:id/payments` (manual). Body:
  - Recurrente: `{ kind?: "RECURRING", period: "YYYY-MM", amount, dueDate, concept?, notes? }`.
  - Único: `{ kind: "ONE_TIME", amount, dueDate, concept?, notes? }` — sin `period` (si llega
    se ignora o se rechaza; documente la decisión).
  - Periodo repetido del mismo cliente → `409 PAYMENT_PERIOD_EXISTS` (dejar que el unique
    existente lo provoque y mapearlo).
- `PATCH /clients/:id/payments/:paymentId` sigue igual + `concept` editable.
- **`POST /clients/:id/payments/generate`** — genera el siguiente cobro según el plan:
  - Sin plan → `409 PLAN_REQUIRED`.
  - Plan `ONE_TIME`: si ya tiene cualquier cobro `ONE_TIME` → `409 ALREADY_CHARGED`; si no,
    crea uno con `amount = plan.price` (o `body.amount`), `dueDate = body.dueDate ?? hoy` y
    `concept = body.concept ?? plan.name`.
  - Plan `RECURRING`: si ya hay un `PENDING` → `409 CHARGE_PENDING`; si no, crea el siguiente
    periodo (`period` = último periodo + 1 mes; si no hay cobros, el mes actual) con
    `dueDate` = mismo día del mes que el último cobro (acotado a 1..28) o hoy si es el primero,
    `amount = plan.price` (o `body.amount`).
  - Devuelve el `ClientDetail` actualizado (mismo contrato que hoy).
- **`POST /billing/run`** (admin) — genera cobros de todos los clientes:
  - Solo clientes `ACTIVE` con plan `RECURRING`, sin cobro `PENDING`.
  - Misma regla de periodo/fecha que `payments/generate`.
  - Devuelve `{ created: number, skipped: number, charges: [{ clientId, clientName, period, dueDate, amount }] }`.
- **`GET /payments`** (admin) — lista global de cobros para la pantalla `Cobros`:
  - Query opcional: `status`, `kind`, `clientId`.
  - Fila: `{ id, clientId, clientName, productName, planName, kind, period, concept, amount,
    dueDate, status, paidAt, method }` ordenada por `dueDate` ascendente.
- `GET /clients` y `GET /clients/:id` no cambian de llaves.

### 5.6 Pruebas

- Unitarias: `api/src/lib/*.test.ts` (licencia, fechas de recurrencia).
- Integración: ampliar `api/tests/flow.test.ts` con: plan único, `payments/generate` único y
  recurrente, `billing/run`, `GET /payments`, `POST /activate` (éxito, código inválido,
  adopta nombre/modelo) y `GET /config`. Nunca contra Railway: solo BD local (`pnpm db:test:up`
  y `pnpm test:integration`).
- `pnpm --filter axzy-central-api exec tsc --noEmit`, `npx prisma validate`, `npx prisma generate`.

---

## 6. QR y app de taquería

### 6.1 Payload del QR

JSON compacto, sin saltos de línea:

```json
{"v":1,"u":"https://<api>/api/v1","c":"axc_…","p":"TAQUERIA"}
```

- `v` versión 1 · `u` URL base del API (puede faltar: se usa la compilada) · `c` código de
  activación · `p` clave del producto (opcional; si viene y no es `TAQUERIA`, error claro).
- El QR lo arma la consola con `qrcode` a partir del código que devuelve la API al generarlo
  (el código solo se muestra una vez) y de `GET /config`.

### 6.2 App (Taqueria)

- Pantalla de activación: botón primario **“Escanear QR de la Central”**; debajo, la opción de
  escribir el código a mano (se conserva como respaldo).
- Escáner con CameraX + ZXing core (sin Google Play Services). Permiso `CAMERA` en el
  manifest y solicitud en runtime; si se niega, se explica y queda el código manual.
- Parser puro (`QrPayload.kt`) con pruebas JVM: JSON válido, `p` de otro producto, versión
  distinta, URL inválida, código suelto (`axc_…`) y basura.
- `LicenseManager`:
  - `activate(code, apiUrl? = null)`: si el QR trae `u`, ese URL manda y se guarda en prefs
    (`apiBase`); si no, usa el `BuildConfig.LICENSE_API_URL`.
  - Llama `POST /activate` con `{ code, device: { name: "Tablet de cocina", model: Build.MODEL } }`.
  - `refresh()` sigue con `GET /license` sobre el mismo URL (prefs primero, build después).
  - Respuesta: el mismo `LicenseResponse` de hoy (ignorar `device` con `ignoreUnknownKeys` si
    aplica).
- La app sigue funcionando sin internet igual que hoy; el QR solo se usa la primera vez.
- `README.md` de Taqueria: explicar el escaneo, que el QR lleva el servidor (el build release
  ya no depende de `-Ptaqueria.apiUrl` si se usa QR) y conservar el respaldo manual.
- Verificación: `./gradlew :app:testDebugUnitTest` y `./gradlew :app:assembleDebug`.

---

## 7. Consola web — diseño bento (PTNV) y pantallas

### 7.1 Shell y tema

- `ITThemeProvider` con **`appearance="bento"`** (ya está en la versión 1.8.15 del UI System),
  misma paleta axzydev (teal `#387D92`, navy `#1D2636`) y modo claro/oscuro.
- `ITLayout` con `sidebar={{ variant: "bento", profile: { name, detail: "Administrador", … } }}`,
  `topBar={{ variant: "bento" }}` y el sidebar a todo lo alto. Logo axzydev + “Central”.
- Canvas bento del kit; nada de fondos navy a página completa ni bordes duros. Se permiten los
  tokens de marca (`axzy-teal`, `axzy-navy`, `axzy-slate`, `axzy-mist`, `axzy-paper`).
- Componentes del kit antes de improvisar: `ITBentoGrid`, `ITBentoTile`, `ITBentoStatStrip`,
  `ITBentoFeed`, `ITCard tone`, `ITSegmentedControl`, `ITDataTable`/`ITTable`, `ITDialog`,
  `ITBadget`, `ITButton`, `ITInput`, `ITDatePicker`. Leer `dist/index.d.ts` para props exactas.
- Los formularios y tablas deben quedar usables en móvil; un solo “Guardar” visible.

### 7.2 Pantallas

- **Inicio** (`/`): tiles bento con clientes activos, suspendidos, vencidos y MRR; tiles por
  producto (activos/total + monto mensual); lista “Requieren atención” con `ITBentoFeed` o
  tarjeta; acciones rápidas “Nuevo cliente” y “Generar cobros del mes” (`POST /billing/run`,
  toast con el resultado).
- **Clientes** (`/clientes`): filtro por producto (`ITSegmentedControl` o chips) + búsqueda;
  tabla/cards con estado, plan, siguiente pago y licencias; mismo alta en `ITDialog`.
- **Detalle de cliente** (`/clientes/:id`):
  - Cabecera bento con estado, producto, plan y botón suspender/reactivar.
  - Datos y plan (tarjeta pastel), selector de plan con tipo de cobro visible.
  - **Licencias**: botón “Generar QR de activación” que crea/rota el código y abre un
    `ITDialog` con el QR (imagen `qrcode`), instrucciones (instalar app → Cocina → Escanear
    QR), aviso de que el código solo se muestra una vez, botón copiar y WhatsApp. Al cerrar,
    el código deja de estar visible.
  - **Cobros**: alta manual (recurrente con periodo o único con concepto), botón “Generar
    siguiente cobro”, tabla con tipo/periodo/concepto/importe/vence/estado y acciones de
    pagado/cancelar.
- **Planes** (`/planes`): agrupados por producto; cada plan muestra tipo (mensual/único),
  precio, clientes; alta y edición de precio/tipo; baja/alta.
- **Productos** (`/productos`): tarjetas bento con clave, descripción, clientes y planes.
- **Cobros** (`/cobros`, nueva en la navegación): tabla global con filtros por estado y tipo,
  resumen (pendiente/vencido/cobrado), marcar pagado (efectivo/transferencia) y cancelar.
- **Login**: conservar el panel navy con la marca (gustan los colores) pero con acabado bento
  (tarjeta flotante, tipografía, logo y loader); no romper el flujo de sesión.

### 7.3 API client web

Actualizar `web/src/api.ts` con `BillingType`, `PaymentKind`, `price`, `billingType`, `concept`,
`model`, `activatedAt`, `PaymentRow`, `BillingRun`, `GET /config`; helpers de formato actuales.

### 7.4 Verificación

- `pnpm --filter axzy-central-web typecheck` y `pnpm --filter axzy-central-web build`.
- Si se agrega `qrcode`, usar `pnpm --filter axzy-central-web add qrcode` y `-D @types/qrcode`
  (actualiza lockfile del workspace).

---

## 8. Criterios de aceptación

1. La consola se ve bento (shell flotante, tiles/tarjetas pastel, píldoras) y conserva la
   paleta; typecheck y build en verde.
2. Desde el detalle del cliente se genera un QR con el código de activación; la app lo escanea,
   activa la tablet y la Central refleja modelo/última conexión/activación.
3. El código manual sigue funcionando como respaldo; un QR de otro producto o inválido da
   mensaje claro.
4. Los planes se crean con tipo recurrente o único; los cobros únicos no chocan con el unique
   de periodo; `payments/generate` y `billing/run` no duplican cobros pendientes.
5. `GET /license` mantiene su contrato (la app no se rompe) y `POST /activate` da de alta.
6. API: typecheck, unitarias e integración (BD local) verdes. App: unitarias JVM y
   `assembleDebug` verdes.

---

## 9. Verificación realizada (2026-11-21)

- **API**: `tsc --noEmit` OK · 16 unitarias OK · 9 pruebas de integración OK contra la BD local
  de Docker (`127.0.0.1:55434/axc_test`). La BD de Railway no se tocó.
- **Web**: `pnpm --filter axzy-central-web typecheck` y `build` OK; 0 errores de consola en
  Chrome headless (claro/oscuro, 1440 y 390 px). Capturas en `docs/capturas/`.
- **QR**: el QR que dibuja la consola se decodificó con `BarcodeDetector` y devuelve
  `{"v":1,"u":"…/api/v1","c":"axc_…","p":"TAQUERIA"}` (y `p:"CHECKLAB"` para ese producto).
- **App Taqueria**: 34 unitarias JVM OK · `assembleDebug` OK · APK instalado en emulador:
  pantalla de activación, permiso de cámara, pantalla del escáner y activación con el código
  (respaldo manual) contra la API local; la Central registró `model`, `activatedAt` y
  `lastSeenAt` del dispositivo.
- **Consola E2E**: "Generar cobros del mes" creó 1 cobro (3 omitidos por tener pendiente) y
  "Efectivo" marcó un cobro como pagado; ambos reflejados en `GET /payments`.
- Pendiente para hardware real: escanear un QR impreso/en pantalla con la cámara del teléfono
  (el emulador no permite inyectar la cámara fácilmente); el parser y el payload ya están
  cubiertos por pruebas y por la decodificación del QR de la consola.
