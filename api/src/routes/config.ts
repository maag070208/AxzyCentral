import { Router } from "express";
import type { Request } from "express";
import { config } from "../config";

export const configRouter = Router();

/** URL pública del API sin `/` final: la que viaja dentro del QR de activación. */
const apiUrlOf = (req: Request): string => {
  const configured = config.PUBLIC_API_URL ?? `${req.protocol}://${req.get("host") ?? "localhost"}/api/v1`;
  return configured.replace(/\/+$/, "");
};

/** Público: la consola lo usa para armar el QR y la app para guardar el servidor. */
configRouter.get("/", (req, res) => {
  res.set("Cache-Control", "no-store").json({ apiUrl: apiUrlOf(req) });
});
