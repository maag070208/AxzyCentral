import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { HttpError } from "./errors";
import { bearerOf } from "./lib/tokens";

export interface AdminSession {
  id: string;
  username: string;
}

/** Sesión de un usuario de cliente en la app (no es administrador de la Central). */
export interface AppSession {
  userId: string;
  clientId: string;
  productId: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminSession;
      /** Sesión de la app del cliente (no usar `app`: es el Application de Express). */
      appSession?: AppSession;
    }
  }
}

const ADMIN_TTL = "12h";
/** La app recuerda la sesión; al conectar revalida con `/app/me` (contrato §5). */
const APP_TTL = "30d";

export const signAdmin = (admin: AdminSession): string =>
  jwt.sign({ sub: admin.id, username: admin.username, typ: "admin" }, config.JWT_SECRET, { expiresIn: ADMIN_TTL });

/** Token propio de la app del cliente, firmado con el mismo secreto pero otro `typ`. */
export const signAppToken = (app: AppSession): string =>
  jwt.sign(
    { sub: app.userId, clientId: app.clientId, productId: app.productId, typ: "app" },
    config.JWT_SECRET,
    { expiresIn: APP_TTL }
  );

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const token = bearerOf(req.headers.authorization);
  if (!token) throw new HttpError(401, "TOKEN_MISSING", "Inicia sesión");
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    // Un token de la app no sirve para la consola (los tokens viejos no traen typ).
    if (payload.typ === "app") throw new Error("token de la app");
    req.admin = { id: String(payload.sub), username: String(payload.username) };
  } catch {
    throw new HttpError(401, "INVALID_TOKEN", "La sesión venció; vuelve a entrar");
  }
  next();
};

/** Guardia de las rutas `/app/*`: solo acepta el JWT con `typ: "app"`. */
export const requireApp: RequestHandler = (req, _res, next) => {
  const token = bearerOf(req.headers.authorization);
  if (!token) throw new HttpError(401, "INVALID_TOKEN", "La sesión venció; vuelve a entrar");
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    if (payload.typ !== "app" || typeof payload.clientId !== "string" || typeof payload.productId !== "string") {
      throw new Error("no es un token de la app");
    }
    req.appSession = { userId: String(payload.sub), clientId: payload.clientId, productId: payload.productId };
  } catch {
    throw new HttpError(401, "INVALID_TOKEN", "La sesión venció; vuelve a entrar");
  }
  next();
};
