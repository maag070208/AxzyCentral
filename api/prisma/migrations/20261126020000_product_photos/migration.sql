-- Fotos reales de productos para el menú digital (una por producto del menú del cliente).
CREATE TABLE "product_photos" (
    "clientId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "jpeg" BYTEA NOT NULL,
    "sha" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_photos_pkey" PRIMARY KEY ("clientId","productId")
);

ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
