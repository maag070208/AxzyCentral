import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  PORT: z.coerce.number().int().default(4100),
  WEB_ORIGIN: z.string().default("http://localhost:5100"),
  NODE_ENV: z.string().default("development"),
  /// URL pública del API que viaja dentro del QR de activación. Opcional: si no
  /// está, se deriva de la petición (`req.protocol` + `Host`).
  PUBLIC_API_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().url("PUBLIC_API_URL debe ser una URL").optional()
  ),
  /// Base pública del menú digital (p. ej. `https://menu.axzy.dev`); el QR de las mesas apunta a
  /// `<base>/<slug>`. Opcional: si no está, se deriva de la petición (`…/m`).
  PUBLIC_MENU_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().url("PUBLIC_MENU_URL debe ser una URL").optional()
  ),
});

export const config = Env.parse(process.env);
