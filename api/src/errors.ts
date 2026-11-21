import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

/** Error con código estable para la consola y la app (`{ code, message }`). */
export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message?: string) {
    super(message ?? code);
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ code: "VALIDATION_ERROR", message: "Revisa los datos", issues: err.issues });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    res.status(409).json({ code: "ALREADY_EXISTS", message: "Ya existe un registro con esos datos" });
    return;
  }
  console.error(err);
  res.status(500).json({ code: "INTERNAL_ERROR", message: "Algo salió mal. Intenta de nuevo." });
};
