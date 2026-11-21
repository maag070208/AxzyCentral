import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { HttpError } from "./errors";
import { bearerOf } from "./lib/tokens";

export interface AdminSession {
  id: string;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminSession;
    }
  }
}

const TOKEN_TTL = "12h";

export const signAdmin = (admin: AdminSession): string =>
  jwt.sign({ sub: admin.id, username: admin.username }, config.JWT_SECRET, { expiresIn: TOKEN_TTL });

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const token = bearerOf(req.headers.authorization);
  if (!token) throw new HttpError(401, "TOKEN_MISSING", "Inicia sesión");
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    req.admin = { id: String(payload.sub), username: String(payload.username) };
  } catch {
    throw new HttpError(401, "INVALID_TOKEN", "La sesión venció; vuelve a entrar");
  }
  next();
};
