#!/usr/bin/env bash
# PostgreSQL local de pruebas en Docker (puerto 55434). Nunca toca la base real.
set -euo pipefail
CONTAINER="${AXC_TEST_DB_CONTAINER:-axc-test-pg}"
PORT="${AXC_TEST_DB_PORT:-55434}"
URL="postgresql://postgres:test@127.0.0.1:${PORT}/axc_test"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker create --name "$CONTAINER" -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=test \
    -e POSTGRES_DB=axc_test -p "${PORT}:5432" postgres:16-alpine >/dev/null
fi
docker start "$CONTAINER" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres -d axc_test >/dev/null 2>&1 && break
  sleep 1
done
cd "$(dirname "$0")/.."
DATABASE_URL="$URL" npx prisma migrate deploy >/dev/null
echo "BD de pruebas lista en $URL"
