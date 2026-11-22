#!/usr/bin/env bash
# Central en tu Mac con una base LOCAL (Docker, puerto 55433), sin tocar Railway.
#
#   pnpm dev:local          # desde la raíz: API :4100 + consola :5100
#   pnpm dev:local --demo   # además carga una taquería de demo con un mes de ventas
#
# (la demo trae 61 días: alcanza para comparar contra el periodo anterior)
# Entra a http://localhost:5100 con  dev / dev-local-12345  (solo existe en esta base local).
# El .env (que apunta a Railway) se ignora para la base: DATABASE_URL se fija aquí.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER=axc-dev-pg
PORT=55433
export DATABASE_URL="postgresql://postgres:dev@127.0.0.1:${PORT}/axc_dev"
export JWT_SECRET="${JWT_SECRET_LOCAL:-desarrollo-local-desarrollo-local-123456}"
export WEB_ORIGIN="http://localhost:5100"
# QR de activación: desde el emulador de Android la Mac es 10.0.2.2.
export PUBLIC_API_URL="${PUBLIC_API_URL_LOCAL:-http://10.0.2.2:4100/api/v1}"

if ! docker info >/dev/null 2>&1; then
  open -a Docker
  until docker info >/dev/null 2>&1; do sleep 2; done
fi
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker create --name "$CONTAINER" -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=dev \
    -e POSTGRES_DB=axc_dev -p "${PORT}:5432" -v axc-dev-pg:/var/lib/postgresql/data postgres:16-alpine >/dev/null
fi
docker start "$CONTAINER" >/dev/null
until docker exec "$CONTAINER" pg_isready -U postgres -d axc_dev >/dev/null 2>&1; do sleep 1; done

npx prisma migrate deploy >/dev/null
INITIAL_ADMIN_USERNAME=dev INITIAL_ADMIN_PASSWORD=dev-local-12345 INITIAL_ADMIN_NAME="Dev local" npx tsx src/seed.ts
if [ "${1:-}" = "--demo" ]; then npx tsx src/seed-demo.ts; fi

echo "▸ Central local: API http://localhost:4100/api/v1 · consola http://localhost:5100 (dev / dev-local-12345)"
cd .. && exec pnpm dev
