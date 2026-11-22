-- Usuarios de los clientes y catálogo de roles por producto (contrato
-- docs/CONTRATO-USUARIOS-ROLES.md). Migración aditiva: solo crea tablas,
-- índices, llaves foráneas y siembra los roles del producto TAQUERIA.
-- No se modifica ni se borra ninguna tabla existente.

-- CreateTable roles
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable client_users
CREATE TABLE "client_users" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable client_user_roles
CREATE TABLE "client_user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "client_user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_productId_key_key" ON "roles"("productId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "client_users_clientId_username_key" ON "client_users"("clientId", "username");

-- CreateIndex
CREATE INDEX "client_users_clientId_idx" ON "client_users"("clientId");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_user_roles" ADD CONSTRAINT "client_user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "client_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_user_roles" ADD CONSTRAINT "client_user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: catálogo de roles del producto TAQUERIA
-- (b7a1c0de-0000-4000-8000-000000000001) con los ids fijos del contrato.
INSERT INTO "roles" ("id", "productId", "key", "name", "permissions", "updatedAt") VALUES
    ('d1000000-0000-4000-8000-000000000001', 'b7a1c0de-0000-4000-8000-000000000001', 'ADMIN',   'Administrador', '[]'::jsonb, CURRENT_TIMESTAMP),
    ('d1000000-0000-4000-8000-000000000002', 'b7a1c0de-0000-4000-8000-000000000001', 'GERENTE', 'Gerente',       '[]'::jsonb, CURRENT_TIMESTAMP),
    ('d1000000-0000-4000-8000-000000000003', 'b7a1c0de-0000-4000-8000-000000000001', 'CAJERO',  'Cajero',        '[]'::jsonb, CURRENT_TIMESTAMP),
    ('d1000000-0000-4000-8000-000000000004', 'b7a1c0de-0000-4000-8000-000000000001', 'MESERO',  'Mesero',        '[]'::jsonb, CURRENT_TIMESTAMP),
    ('d1000000-0000-4000-8000-000000000005', 'b7a1c0de-0000-4000-8000-000000000001', 'COCINA',  'Cocina',        '[]'::jsonb, CURRENT_TIMESTAMP);
