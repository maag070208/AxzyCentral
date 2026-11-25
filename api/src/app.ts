import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import { requireAdmin } from "./auth";
import { errorHandler } from "./errors";
import { authRouter } from "./routes/auth";
import { activateRouter, licenseRouter } from "./routes/license";
import { configRouter } from "./routes/config";
import { plansRouter } from "./routes/plans";
import { clientsRouter } from "./routes/clients";
import { clientUsersRouter } from "./routes/client-users";
import { rolesRouter } from "./routes/roles";
import { appRouter } from "./routes/app";
import { productsRouter } from "./routes/products";
import { billingRouter, paymentsRouter } from "./routes/payments";
import { clientSalesRouter, salesOverviewRouter, salesRouter } from "./routes/sales";
import { BACKUP_LIMIT, backupRouter } from "./routes/backup";
import { appErrorsRouter, clientAppErrorsRouter, recentAppErrorsRouter } from "./routes/app-errors";
import { deviceIconSetRouter, iconSetsRouter } from "./routes/icon-sets";
import { clientCatalogRouter, deviceCatalogRouter } from "./routes/catalog";
import { menuTemplatesRouter } from "./routes/menu-templates";
import { publicMenuRouter } from "./routes/public-menu";
import { CATALOG_LIMIT, ICON_SET_LIMIT } from "./lib/giro";

export const createApp = () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: config.WEB_ORIGIN.split(",").map((o) => o.trim()) }));
  // El respaldo de la cocina trae el estado completo; lo demás es chico.
  app.use("/api/v1/backup", express.json({ limit: BACKUP_LIMIT }));
  // Menú de la taquería (app y consola) y kits de iconos (PNG en base64).
  app.use("/api/v1/catalog", express.json({ limit: CATALOG_LIMIT }));
  app.use(/^\/api\/v1\/clients\/[^/]+\/catalog$/, express.json({ limit: CATALOG_LIMIT }));
  app.use(/^\/api\/v1\/products\/[^/]+$/, express.json({ limit: CATALOG_LIMIT }));
  app.use("/api/v1/icon-sets", express.json({ limit: ICON_SET_LIMIT }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const api = express.Router();
  // Públicas: la app de taquería y la consola antes de iniciar sesión.
  api.use("/config", configRouter);
  api.use("/activate", activateRouter);
  api.use("/license", licenseRouter);
  api.use("/sales", salesRouter);
  api.use("/backup", backupRouter);
  api.use("/app-errors", appErrorsRouter);
  api.use("/icon-set", deviceIconSetRouter);
  api.use("/catalog", deviceCatalogRouter);
  api.use("/auth", authRouter);
  // App del cliente: `/login` es público (con rate limit); `/me` y `/password`
  // validan su propio token de app.
  api.use("/app", appRouter);
  // Administrativas: requieren sesión de la consola.
  const admin = express.Router();
  admin.use(requireAdmin);
  admin.use("/products", productsRouter);
  admin.use("/icon-sets", iconSetsRouter);
  admin.use("/menu-templates", menuTemplatesRouter);
  admin.use("/plans", plansRouter);
  admin.use("/roles", rolesRouter);
  admin.use("/clients", clientUsersRouter);
  admin.use("/clients", clientsRouter);
  admin.use("/clients", clientSalesRouter);
  admin.use("/clients", clientAppErrorsRouter);
  admin.use("/clients", clientCatalogRouter);
  admin.use("/app-errors", recentAppErrorsRouter);
  admin.use("/sales-overview", salesOverviewRouter);
  admin.use("/payments", paymentsRouter);
  admin.use("/billing", billingRouter);
  api.use(admin);
  app.use("/api/v1", api);
  // Menú digital del comensal (público, HTML).
  app.use("/m", publicMenuRouter);

  app.use((_req, res) => {
    res.status(404).json({ code: "NOT_FOUND", message: "No existe" });
  });
  app.use(errorHandler);
  return app;
};
