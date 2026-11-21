#!/usr/bin/env bash
# Pruebas de flujo contra la API real y la BD local de pruebas (pnpm db:test:up antes).
set -euo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="${TEST_DATABASE_URL:-postgresql://postgres:test@127.0.0.1:55434/axc_test}"
case "$DATABASE_URL" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "Las pruebas solo corren contra una BD local" >&2; exit 1 ;;
esac
export JWT_SECRET="${JWT_SECRET:-pruebas-pruebas-pruebas-pruebas-pruebas}"
export NODE_ENV=test
npx tsx --test --test-concurrency=1 tests/*.test.ts
