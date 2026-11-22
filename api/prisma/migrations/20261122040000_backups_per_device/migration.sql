-- Un respaldo por teléfono de cocina (antes uno por cliente): varias cocinas
-- independientes del mismo cliente ya no se pisan. Se conservan los existentes.
ALTER TABLE "backups" DROP CONSTRAINT "backups_pkey",
ADD CONSTRAINT "backups_pkey" PRIMARY KEY ("deviceId");

-- CreateIndex
CREATE INDEX "backups_clientId_idx" ON "backups"("clientId");
