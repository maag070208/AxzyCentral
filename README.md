# Axzy Central

Consola de axzydev para administrar **todos tus clientes, de cualquier producto**
(la app de taquerías, CheckLab, lo que venga): alta, plan, cobros, activar/suspender
y las licencias de sus dispositivos. Las apps trabajan sin internet; cuando se
conectan preguntan aquí si la cuenta sigue activa.

- **Productos**: lo que vendes (`TAQUERIA` viene de fábrica). La clave no se cambia: las apps la usan.
- **Planes**: por producto, en dos formas de cobro: **recurrente** (precio mensual) o **único** (cargo inicial que se cobra una sola vez).
- **Clientes**: de un producto; activos o suspendidos, con contacto, plan, cobros y licencias.
- **Cobros**: registro de pagos de todos los clientes en una sola pantalla, con filtros por estado y tipo.
- **Licencias**: activación de las tablets de cocina **escaneando un QR** generado aquí.
- **Diseño**: lenguaje bento del AXZY UI System (misma familia visual que PTNV), con la marca teal/navy de axzydev.

```
api/  Express + TypeScript + Prisma (PostgreSQL)   → Docker: axzydev/axzy_central_api
web/  React + Vite + AXZY UI System (marca axzydev) → FTP: central.axzy.dev (Hostinger)
```

Pantallas de la consola: `Inicio`, `Clientes` (detalle con licencias y cobros), `Cobros`, `Productos` y `Planes`.

## Cómo funciona la licencia

- Cada cliente tiene uno o más **dispositivos** (p. ej. la tablet de cocina de una taquería).
- Desde el detalle del cliente → **Licencias → Generar QR de activación** se crea el dispositivo y se muestra su **QR** (y el código de respaldo, `axc_…`) **una sola vez**; en la base solo queda el hash.
  - El QR lleva un payload compacto: `{"v":1,"u":"https://<api>/api/v1","c":"axc_…","p":"TAQUERIA"}`; `v` versión, `u` URL del API, `c` código y `p` producto.
  - La app de taquería lo escanea desde **Cocina → Escanear QR de la Central** (CameraX + ZXing, sin Google Play Services). Si la cámara no está disponible, el código manual sigue sirviendo.
- Al escanear, la app llama `POST /api/v1/activate` y el dispositivo queda **dado de alta**: se guardan modelo, `activatedAt` y `lastSeenAt` en la Central.
- Después la app consulta `GET /api/v1/license` con `Authorization: Bearer <código>` y recibe `{ status, tenant { name }, plan, nextDueDate, validUntil, serverTime }`.
  - Además trae `product { key, name }` para que la app sepa de qué producto es.
  - **Suspendido** → 200 con `status: SUSPENDED`: la app se bloquea y sigue bloqueada aunque pierda internet.
  - Código revocado o inexistente → 401: la app pide uno nuevo.
  - `validUntil` = hasta cuándo puede abrir **sin internet**: vencimiento del cobro pendiente más antiguo + 5 días; sin cobros pendientes, 35 días; siempre entre 3 y 45 días (`api/src/lib/license-window.ts`).
- Un pago vencido **no** suspende solo: tú decides con el botón Suspender.
- `GET /api/v1/config` (público) devuelve la URL del API que viaja dentro del QR. Se toma de `PUBLIC_API_URL`; si no está, se deriva de la petición.

## Planes y cobros

- Un plan es de un producto y tiene `billingType`:
  - `RECURRING`: precio mensual. La Central puede generar el siguiente cobro.
  - `ONE_TIME`: precio de una sola vez (instalación, licencia única). Solo se genera un cobro único por cliente.
- En el detalle del cliente:
  - **Generar siguiente cobro** crea el cobro según el plan: mes siguiente de un recurrente (día de vencimiento acotado a 1..28) o el cargo único; nunca duplica un pendiente (`409 CHARGE_PENDING` / `409 ALREADY_CHARGED`).
  - El alta manual permite cobros recurrentes (con periodo `AAAA-MM`) y únicos (con concepto, sin periodo).
- **Generar cobros del mes** (Inicio o Cobros) recorre los clientes activos con plan recurrente que no tengan un pendiente; los que ya tienen uno se omiten. Responde `{ created, skipped, charges }`.
- La pantalla **Cobros** lista todos los pagos (`GET /api/v1/payments`, filtros por estado/tipo) y permite marcar efectivo/transferencia, cancelar o reabrir.
- Los cobros únicos conviven con el unique `(clientId, period)` porque viven con `period = NULL` (varios `NULL` conviven en PostgreSQL).

Contrato técnico completo (tablas, endpoints y payload del QR): `docs/CONTRATO-QR-COBROS.md`.

## Marca

La consola usa `@axzydev/axzy_ui_system` (mismo orden de capas que TimeManager, con `@source` sobre la librería), `appearance="bento"` y el kit `AXZY_UI_SYSTEM/axzydev-brand-kit`: paleta teal/navy, fuentes Outfit y JetBrains Mono, logos en `web/public/brand`, favicons en `web/public` y animaciones Lottie en `web/public/lottie` (`src/AxzyLogo.tsx`: logo del login y loader). Modo claro y oscuro.

## Desarrollo

```bash
pnpm install
cp api/.env.example api/.env        # DATABASE_URL, JWT_SECRET (32+ caracteres), PUBLIC_API_URL opcional
pnpm prisma:migrate                 # aplica migraciones a la base del .env
INITIAL_ADMIN_USERNAME=tu-usuario INITIAL_ADMIN_PASSWORD='mínimo-12-caracteres' pnpm seed
pnpm dev                            # API :4100 y consola :5100 (Vite pasa /api al API)
```

- `PUBLIC_API_URL` es la URL pública del API que se mete en el QR (p. ej. `https://central-api.axzy.dev/api/v1`, sin `/` final). En desarrollo, si el QR se va a escanear desde un teléfono real, apunta a la IP de tu Mac (`http://192.168.x.x:4100/api/v1`); desde el emulador de Android, `http://10.0.2.2:4100/api/v1`.
- La app Android en debug usa `http://10.0.2.2:4100/api/v1` por defecto; si el QR trae `u`, ese servidor manda.

**Central local sin tocar Railway** (base propia en Docker, puerto 55433):

```bash
pnpm dev:local          # API :4100 y consola :5100; entra con dev / dev-local-12345
pnpm dev:local --demo   # además "Taquería Demo" con un mes de ventas para ver métricas
```

Ignora el `DATABASE_URL` del `.env` (Railway). La base local vive en el volumen `axc-dev-pg` y sobrevive reinicios.

Pruebas:

```bash
pnpm test                           # unitarias
pnpm db:test:up                     # Postgres de pruebas en Docker (puerto 55434)
pnpm test:integration               # flujo completo contra la API real (solo BD local)
pnpm typecheck
```

> `api/.env` de esta máquina apunta a la base de Railway: las pruebas de integración **nunca** la tocan (el script solo acepta una BD local y la truncan). Para inspeccionar datos usa Prisma/tsx con `DATABASE_URL=postgresql://postgres:test@127.0.0.1:55434/axc_test`, no `docker exec` (hay un contenedor viejo de otra VM que puede mostrar otra base).

## Publicar

Los dos workflows de `.github/workflows/` corren al subir a `main` (o a mano desde Actions).

**API (Docker Hub)** — `docker-publish-api.yml` publica `axzydev/axzy_central_api:latest` y `:sha-<commit>`.
Secretos del repo: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`. A mano:

```bash
docker build -f api/Dockerfile -t axzydev/axzy_central_api:<tag> .
docker push axzydev/axzy_central_api:<tag>
```

El contenedor aplica las migraciones pendientes al arrancar (incluida `20261121020000_planes_cobros_qr`) y escucha en `PORT` (4100). Variables: `DATABASE_URL`, `JWT_SECRET`, `PUBLIC_API_URL` (la URL pública del API para el QR), `WEB_ORIGIN=https://central.axzy.dev`. Administrador inicial dentro del contenedor:

```bash
docker exec -e INITIAL_ADMIN_USERNAME=… -e INITIAL_ADMIN_PASSWORD=… <contenedor> node dist/seed.js
```

**Web (FTP a Hostinger)** — `deploy-web.yml` compila y sube `web/dist/` por FTPS.
Secretos: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`. Variables: `VITE_API_URL` (URL pública del API, `https://…/api/v1`) y opcional `FTP_SERVER_DIR` (default `public_html/`). La consola usa rutas con `#`, así que no necesita reglas de reescritura en el hosting.

## App Android

La URL del API se puede fijar al compilar (`./gradlew :app:assembleRelease -Ptaqueria.apiUrl=https://<api>/api/v1`) **o** dejar que llegue dentro del QR de activación (recomendado: el mismo APK sirve para cualquier cliente y servidor). El activador manual sigue funcionando. Ver README de `Taqueria`.
