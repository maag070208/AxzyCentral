# Axzy Central

Consola para administrar las taquerías que usan la app Android **Taquería**
(repo `Taqueria`): alta, plan, cobros, activar/suspender y el código de la
tablet de cocina. La app trabaja sin internet; cuando se conecta pregunta aquí
si la cuenta sigue activa.

```
api/  Express + TypeScript + Prisma (PostgreSQL)   → Docker: axzydev/axzy_central_api
web/  React + Vite + Tailwind (consola, español)    → FTP: central.axzy.dev (Hostinger)
```

## Cómo funciona la licencia

- Cada taquería tiene uno o más **dispositivos de cocina**. Al generar uno se muestra su código (`axc_…`) **una sola vez**; en la base solo queda su hash. Se manda por WhatsApp y se pega en la app (Cocina → Activar).
- La app consulta `GET /api/v1/license` con `Authorization: Bearer <código>` y recibe `{ status, tenant { name }, plan, nextDueDate, validUntil, serverTime }`.
  - **Suspendida** → 200 con `status: SUSPENDED`: la app se bloquea y sigue bloqueada aunque pierda internet.
  - Código revocado o inexistente → 401: la app pide un código nuevo.
  - `validUntil` = hasta cuándo puede abrir **sin internet**: vencimiento del cobro pendiente más antiguo + 5 días; sin cobros pendientes, 35 días; siempre entre 3 y 45 días (`api/src/lib/license-window.ts`).
- Un pago vencido **no** suspende solo: tú decides con el botón Suspender.

## Desarrollo

```bash
pnpm install
cp api/.env.example api/.env        # DATABASE_URL, JWT_SECRET (32+ caracteres)
pnpm prisma:migrate                 # aplica migraciones a la base del .env
INITIAL_ADMIN_USERNAME=tu-usuario INITIAL_ADMIN_PASSWORD='mínimo-12-caracteres' pnpm seed
pnpm dev                            # API :4100 y consola :5100 (Vite pasa /api al API)
```

Pruebas:

```bash
pnpm test                           # unitarias
pnpm db:test:up                     # Postgres de pruebas en Docker (puerto 55434)
pnpm test:integration               # flujo completo contra la API real (solo BD local)
pnpm typecheck
```

## Publicar

Los dos workflows de `.github/workflows/` corren al subir a `main` (o a mano desde Actions).

**API (Docker Hub)** — `docker-publish-api.yml` publica `axzydev/axzy_central_api:latest` y `:sha-<commit>`.
Secretos del repo: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`. A mano:

```bash
docker build -f api/Dockerfile -t axzydev/axzy_central_api:<tag> .
docker push axzydev/axzy_central_api:<tag>
```

El contenedor aplica las migraciones pendientes al arrancar y escucha en `PORT` (4100). Variables: `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN=https://central.axzy.dev`. Administrador inicial dentro del contenedor:

```bash
docker exec -e INITIAL_ADMIN_USERNAME=… -e INITIAL_ADMIN_PASSWORD=… <contenedor> node dist/seed.js
```

**Web (FTP a Hostinger)** — `deploy-web.yml` compila y sube `web/dist/` por FTPS.
Secretos: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`. Variables: `VITE_API_URL` (URL pública del API, `https://…/api/v1`) y opcional `FTP_SERVER_DIR` (default `public_html/`). La consola usa rutas con `#`, así que no necesita reglas de reescritura en el hosting.

## App Android

La URL del API se fija al compilar la app: `./gradlew :app:assembleRelease -Ptaqueria.apiUrl=https://<api>/api/v1` (ver README de `Taqueria`).
