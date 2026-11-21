-- Planes con dos formas de cobro (mensual recurrente o único) y cobros únicos
-- con concepto. Los cobros únicos viven sin `period`: en PostgreSQL varios NULL
-- conviven en el unique `(clientId, period)`, así que no chocan con los mensuales.
-- Los dispositivos guardan el modelo del equipo y su primera activación real.

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('RECURRING', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('RECURRING', 'ONE_TIME');

-- AlterTable plans: monthlyPrice pasa a llamarse price y se agrega el tipo de cobro.
ALTER TABLE "plans" RENAME COLUMN "monthlyPrice" TO "price";
ALTER TABLE "plans" ADD COLUMN "billingType" "BillingType" NOT NULL DEFAULT 'RECURRING';

-- AlterTable payments: tipo de cobro, periodo opcional para los únicos y concepto.
ALTER TABLE "payments" ADD COLUMN "kind" "PaymentKind" NOT NULL DEFAULT 'RECURRING';
ALTER TABLE "payments" ALTER COLUMN "period" DROP NOT NULL;
ALTER TABLE "payments" ADD COLUMN "concept" TEXT;
CREATE INDEX "payments_clientId_kind_idx" ON "payments"("clientId", "kind");

-- AlterTable devices
ALTER TABLE "devices" ADD COLUMN "model" TEXT;
ALTER TABLE "devices" ADD COLUMN "activatedAt" TIMESTAMP(3);
