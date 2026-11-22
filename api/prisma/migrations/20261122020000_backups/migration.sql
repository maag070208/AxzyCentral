-- CreateTable
CREATE TABLE "backups" (
    "clientId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL,
    "appVersion" TEXT,
    "state" JSONB NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("clientId")
);

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
