-- Giros: cada producto con sus palabras, sus partes, su set de iconos y su menú base;
-- y el menú de cada cliente con su historial.
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "features" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "iconSetId" TEXT,
ADD COLUMN     "template" JSONB,
ADD COLUMN     "terms" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "icon_sets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "logoPng" BYTEA,
    "appIconPng" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "icon_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icons" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "png" BYTEA NOT NULL,
    "sha" TEXT NOT NULL,

    CONSTRAINT "icons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_versions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "icon_sets_name_key" ON "icon_sets"("name");

-- CreateIndex
CREATE UNIQUE INDEX "icons_setId_key_key" ON "icons"("setId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_versions_clientId_version_key" ON "catalog_versions"("clientId", "version");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_iconSetId_fkey" FOREIGN KEY ("iconSetId") REFERENCES "icon_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icons" ADD CONSTRAINT "icons_setId_fkey" FOREIGN KEY ("setId") REFERENCES "icon_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_versions" ADD CONSTRAINT "catalog_versions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- La taquería que ya existe conserva todo lo que usa hoy.
UPDATE "products"
SET "terms" = '{"kitchenRole":"Taquero","waiterRole":"Mesero","item":"Taco","kitchen":"Cocina"}',
    "features" = '{"mixes":true,"meatColors":true,"freeExtras":true}'
WHERE "key" = 'TAQUERIA';
