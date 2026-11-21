import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import { requireAdmin } from "./auth";
import { errorHandler } from "./errors";
import { authRouter } from "./routes/auth";
import { licenseRouter } from "./routes/license";
import { plansRouter } from "./routes/plans";
import { clientsRouter } from "./routes/clients";
import { productsRouter } from "./routes/products";

export const createApp = () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: config.WEB_ORIGIN.split(",").map((o) => o.trim()) }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const api = express.Router();
  api.use("/auth", authRouter);
  api.use("/license", licenseRouter);
  api.use("/products", requireAdmin, productsRouter);
  api.use("/plans", requireAdmin, plansRouter);
  api.use("/clients", requireAdmin, clientsRouter);
  app.use("/api/v1", api);

  app.use((_req, res) => {
    res.status(404).json({ code: "NOT_FOUND", message: "No existe" });
  });
  app.use(errorHandler);
  return app;
};
