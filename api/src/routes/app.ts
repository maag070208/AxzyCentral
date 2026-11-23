/**
 * Rutas públicas de la app del cliente (contrato §5): login con el código de
 * activación del dispositivo, revalidación de la sesión y cambio de contraseña.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { Client, ClientUser, Plan, Product, Role } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";
import { requireApp, signAppToken } from "../auth";
import { licenseBody, licenseExtrasOf, nextDueDateOf, requireDeviceByCode } from "../lib/license";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, hashPassword, verifyPassword } from "../lib/passwords";

export const appRouter = Router();

/** 20 intentos por minuto por IP (contrato §5). */
const loginRateLimit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

const LoginInput = z.object({
  code: z.string().trim().min(1).max(200),
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const PasswordInput = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
    .max(PASSWORD_MAX_LENGTH, `Máximo ${PASSWORD_MAX_LENGTH} caracteres`),
});

const USER_INCLUDE = { roles: { include: { role: true } } } as const;

type AppUser = ClientUser & { roles: { role: Role }[] };
type AppClient = Client & { plan: Plan | null; product: Product };

/** La app nunca ve el hash ni contraseñas guardadas (contrato §5 y §6). */
const userView = (user: AppUser) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  mustChangePassword: user.mustChangePassword,
});

const rolesView = (user: AppUser) =>
  [...user.roles]
    .map((assigned) => assigned.role)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((role) => ({ key: role.key, name: role.name }));

/** Cuerpo común de `/app/login` y `/app/me` (el login agrega el token). */
const sessionBody = async (user: AppUser, client: AppClient, now: Date) => ({
  user: userView(user),
  roles: rolesView(user),
  client: { id: client.id, name: client.name },
  product: { key: client.product.key, name: client.product.name },
  license: licenseBody(client, await nextDueDateOf(client.id), now, await licenseExtrasOf(client.id, client.product.iconSetId)),
});

const invalidCredentials = (): HttpError =>
  new HttpError(401, "INVALID_CREDENTIALS", "Usuario o contraseña incorrectos");

const invalidToken = (): HttpError => new HttpError(401, "INVALID_TOKEN", "La sesión venció; vuelve a entrar");

appRouter.post(
  "/login",
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const input = LoginInput.parse(req.body);
    // El código de activación del dispositivo resuelve el cliente: el username
    // solo tiene que ser único dentro de él.
    const device = await requireDeviceByCode(input.code);
    const client = device.client;
    const user = await db.clientUser.findUnique({
      where: { clientId_username: { clientId: client.id, username: input.username.toLowerCase() } },
      include: USER_INCLUDE,
    });
    if (!user || !user.active || !(await verifyPassword(input.password, user.passwordHash))) {
      throw invalidCredentials();
    }

    const now = new Date();
    const logged = await db.clientUser.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
      include: USER_INCLUDE,
    });
    res.set("Cache-Control", "no-store").json({
      token: signAppToken({ userId: logged.id, clientId: client.id, productId: client.productId }),
      ...(await sessionBody(logged, client, now)),
    });
  })
);

/** La app revalida la sesión guardada al conectar: mismo cuerpo que el login sin token. */
appRouter.get(
  "/me",
  requireApp,
  asyncHandler(async (req, res) => {
    const user = await db.clientUser.findUnique({ where: { id: req.appSession!.userId }, include: USER_INCLUDE });
    if (!user || !user.active) throw invalidToken();
    const client = await db.client.findUnique({
      where: { id: user.clientId },
      include: { plan: true, product: true },
    });
    if (!client) throw invalidToken();
    res.set("Cache-Control", "no-store").json(await sessionBody(user, client, new Date()));
  })
);

appRouter.post(
  "/password",
  requireApp,
  asyncHandler(async (req, res) => {
    const input = PasswordInput.parse(req.body);
    const user = await db.clientUser.findUnique({ where: { id: req.appSession!.userId } });
    if (!user || !user.active) throw invalidToken();
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) throw invalidCredentials();
    const passwordHash = await hashPassword(input.newPassword);
    await db.clientUser.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
    res.json({ ok: true });
  })
);
