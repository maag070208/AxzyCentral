-- Menú digital público por cliente (apagado hasta que se encienda en la consola).
ALTER TABLE "clients" ADD COLUMN "menuSlug" TEXT,
ADD COLUMN "menuEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "menuInfo" JSONB NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX "clients_menuSlug_key" ON "clients"("menuSlug");
