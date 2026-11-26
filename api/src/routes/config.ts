import { Router } from "express";
import type { Request } from "express";
import { config } from "../config";

export const configRouter = Router();

/** URL pública del API sin `/` final: la que viaja dentro del QR de activación. */
const apiUrlOf = (req: Request): string => {
  const configured = config.PUBLIC_API_URL ?? `${req.protocol}://${req.get("host") ?? "localhost"}/api/v1`;
  return configured.replace(/\/+$/, "");
};

/** Base del menú digital sin `/` final: `<base>/<slug>` es lo que lleva el QR de las mesas. */
const menuUrlOf = (req: Request): string =>
  (config.PUBLIC_MENU_URL ?? `${req.protocol}://${req.get("host") ?? "localhost"}/m`).replace(/\/+$/, "");

/** Público: la consola lo usa para armar los QR y la app para guardar el servidor. */
configRouter.get("/", (req, res) => {
  res.set("Cache-Control", "no-store").json({ apiUrl: apiUrlOf(req), menuUrl: menuUrlOf(req) });
});
