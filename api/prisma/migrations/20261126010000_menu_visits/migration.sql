-- Visitas al menú digital por cliente y día (solo el conteo).
CREATE TABLE "menu_visits" (
    "clientId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_visits_pkey" PRIMARY KEY ("clientId","day")
);

ALTER TABLE "menu_visits" ADD CONSTRAINT "menu_visits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
