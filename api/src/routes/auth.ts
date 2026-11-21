import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";
import { requireAdmin, signAdmin } from "../auth";

const Login = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });

export const authRouter = Router();

authRouter.post(
  "/login",
  rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }),
  asyncHandler(async (req, res) => {
    const { username, password } = Login.parse(req.body);
    const admin = await db.admin.findUnique({ where: { username } });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Usuario o contraseña incorrectos");
    }
    res.json({ token: signAdmin(admin), admin: { id: admin.id, username: admin.username, name: admin.name } });
  })
);

authRouter.get(
  "/me",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const admin = await db.admin.findUnique({ where: { id: req.admin!.id } });
    if (!admin) throw new HttpError(401, "INVALID_TOKEN", "La sesión venció; vuelve a entrar");
    res.json({ id: admin.id, username: admin.username, name: admin.name });
  })
);
