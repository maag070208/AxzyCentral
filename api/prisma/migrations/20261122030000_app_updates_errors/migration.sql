-- AlterTable
ALTER TABLE "plans" ADD COLUMN "maxKitchens" INTEGER,
ADD COLUMN "maxWaiters" INTEGER;

-- AlterTable
ALTER TABLE "products" ADD COLUMN "latestVersionCode" INTEGER,
ADD COLUMN "latestVersionName" TEXT,
ADD COLUMN "latestUrl" TEXT,
ADD COLUMN "latestNotes" TEXT;

-- CreateTable
CREATE TABLE "app_errors" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "appVersion" TEXT,
    "model" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_errors_clientId_occurredAt_idx" ON "app_errors"("clientId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "app_errors_deviceId_externalId_key" ON "app_errors"("deviceId", "externalId");

-- AddForeignKey
ALTER TABLE "app_errors" ADD CONSTRAINT "app_errors_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_errors" ADD CONSTRAINT "app_errors_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
