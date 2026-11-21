-- Axzy Central deja de ser solo de taquerías: productos (Taquería, CheckLab, …)
-- y clientes de cada producto. Se renombra sin perder datos: lo que ya existía
-- queda como clientes y planes del producto TAQUERIA.

CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "products_key_key" ON "products"("key");

INSERT INTO "products" ("id", "key", "name", "description", "updatedAt")
VALUES ('b7a1c0de-0000-4000-8000-000000000001', 'TAQUERIA', 'Taquería', 'App Android de comandas para taquerías', CURRENT_TIMESTAMP);

-- Clientes (antes taquerías)
ALTER TYPE "TaqueriaStatus" RENAME TO "ClientStatus";
ALTER TABLE "taquerias" RENAME TO "clients";
ALTER TABLE "clients" RENAME CONSTRAINT "taquerias_pkey" TO "clients_pkey";
ALTER TABLE "clients" RENAME CONSTRAINT "taquerias_planId_fkey" TO "clients_planId_fkey";
ALTER INDEX "taquerias_planId_idx" RENAME TO "clients_planId_idx";
ALTER TABLE "clients" RENAME COLUMN "ownerName" TO "contactName";
ALTER TABLE "clients" ADD COLUMN "email" TEXT;
ALTER TABLE "clients" ADD COLUMN "productId" TEXT;
UPDATE "clients" SET "productId" = 'b7a1c0de-0000-4000-8000-000000000001';
ALTER TABLE "clients" ALTER COLUMN "productId" SET NOT NULL;
CREATE INDEX "clients_productId_idx" ON "clients"("productId");
ALTER TABLE "clients" ADD CONSTRAINT "clients_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Planes por producto
ALTER TABLE "plans" ADD COLUMN "productId" TEXT;
UPDATE "plans" SET "productId" = 'b7a1c0de-0000-4000-8000-000000000001';
ALTER TABLE "plans" ALTER COLUMN "productId" SET NOT NULL;
DROP INDEX "plans_name_key";
CREATE UNIQUE INDEX "plans_productId_name_key" ON "plans"("productId", "name");
ALTER TABLE "plans" ADD CONSTRAINT "plans_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cobros y dispositivos apuntan al cliente
ALTER TABLE "payments" RENAME COLUMN "taqueriaId" TO "clientId";
ALTER TABLE "payments" RENAME CONSTRAINT "payments_taqueriaId_fkey" TO "payments_clientId_fkey";
ALTER INDEX "payments_taqueriaId_period_key" RENAME TO "payments_clientId_period_key";
ALTER INDEX "payments_taqueriaId_status_dueDate_idx" RENAME TO "payments_clientId_status_dueDate_idx";

ALTER TABLE "devices" RENAME COLUMN "taqueriaId" TO "clientId";
ALTER TABLE "devices" RENAME CONSTRAINT "devices_taqueriaId_fkey" TO "devices_clientId_fkey";
ALTER INDEX "devices_taqueriaId_idx" RENAME TO "devices_clientId_idx";
