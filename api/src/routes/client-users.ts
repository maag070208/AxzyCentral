/**
 * Usuarios de un cliente desde la consola (contrato §4). Las rutas cuelgan de
 * `/clients/:id/users`; los roles se mandan por key y son del producto del
 * cliente. La contraseña temporal se devuelve una sola vez (alta y reset).
 */
import { Router } from "express";
import { Prisma } from "@prisma/client";
import type { ClientUser, Role } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { asyncHandler, HttpError } from "../errors";
import { hashPassword, temporaryPassword } from "../lib/passwords";
import { normalizeUsername, uniqueUsername } from "../lib/usernames";
import { roleView } from "./roles";

type UserWithRoles = ClientUser & { roles: { role: Role }[] };

const USER_INCLUDE = { roles: { include: { role: true } } } as const;

/** Vista de usuario que consume la tarjeta Usuarios (contrato §3). */
export const clientUserView = (user: UserWithRoles) => ({
  id: user.id,
  clientId: user.clientId,
  name: user.name,
  username: user.username,
  active: user.active,
  mustChangePassword: user.mustChangePassword,
  lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  roles: [...user.roles]
    .map((assigned) => assigned.role)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(roleView),
});

const RoleKeys = z.array(z.string().trim().min(1)).min(1, "Elige al menos un rol");

/** Username opcional: vacío o nulo significa "genéralo". */
const OptionalUsername = z
  .string()
  .trim()
  .max(80)
  .nullish()
  .transform((value) => (value ? value : undefined));

const UserCreate = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio").max(120),
  username: OptionalUsername,
  roles: RoleKeys,
});

const UserUpdate = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  username: z.string().trim().min(1).max(80).optional(),
  roles: RoleKeys.optional(),
  active: z.boolean().optional(),
});

type UserCreateInput = z.infer<typeof UserCreate>;
type UserUpdateInput = z.infer<typeof UserUpdate>;

const INVALID_USERNAME =
  "El username debe empezar con letra y usar minúsculas, números, punto, guion o guion bajo (3 a 40 caracteres)";

const findClient = async (id: string) => {
  const client = await db.client.findUnique({ where: { id }, select: { id: true, productId: true } });
  if (!client) throw new HttpError(404, "CLIENT_NOT_FOUND", "Cliente no encontrado");
  return client;
};

const findUser = async (clientId: string, userId: string): Promise<UserWithRoles> => {
  const user = await db.clientUser.findFirst({ where: { id: userId, clientId }, include: USER_INCLUDE });
  if (!user) throw new HttpError(404, "USER_NOT_FOUND", "Usuario no encontrado");
  return user;
};

const isUsernameTaken = async (clientId: string, username: string, exceptId?: string): Promise<boolean> => {
  const row = await db.clientUser.findFirst({
    where: { clientId, username, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return row !== null;
};

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Los roles se mandan por key y deben existir activos en el producto del cliente. */
const resolveRoles = async (productId: string, keys: string[]): Promise<Role[]> => {
  const wanted = [...new Set(keys)];
  const roles = await db.role.findMany({ where: { productId, key: { in: wanted }, active: true }, orderBy: { key: "asc" } });
  const found = new Set(roles.map((role) => role.key));
  const missing = wanted.filter((key) => !found.has(key));
  if (missing.length > 0) {
    throw new HttpError(400, "INVALID_ROLES", `Roles inválidos para este producto: ${missing.join(", ")}`);
  }
  return roles;
};

const createUser = async (clientId: string, productId: string, input: UserCreateInput) => {
  const roles = await resolveRoles(productId, input.roles);

  let username: string;
  if (input.username) {
    const normalized = normalizeUsername(input.username);
    if (!normalized) throw new HttpError(400, "INVALID_USERNAME", INVALID_USERNAME);
    if (await isUsernameTaken(clientId, normalized)) {
      throw new HttpError(409, "USERNAME_TAKEN", "Ese username ya existe en este cliente");
    }
    username = normalized;
  } else {
    const generated = await uniqueUsername(input.name, (candidate) => isUsernameTaken(clientId, candidate));
    if (!generated) {
      throw new HttpError(400, "USERNAME_UNAVAILABLE", "No se pudo generar un username para ese nombre; escríbelo tú");
    }
    username = generated;
  }

  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  // El unique `(clientId, username)` es la última palabra: si otra alta ganó la
  // carrera, se prueba el siguiente candidato.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const user = await db.clientUser.create({
        data: {
          client: { connect: { id: clientId } },
          name: input.name,
          username,
          passwordHash,
          roles: { create: roles.map((role) => ({ role: { connect: { id: role.id } } })) },
        },
        include: USER_INCLUDE,
      });
      return { user, temporaryPassword: password };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if (input.username) throw new HttpError(409, "USERNAME_TAKEN", "Ese username ya existe en este cliente");
      const lost = username;
      const next = await uniqueUsername(
        input.name,
        async (candidate) => candidate === lost || isUsernameTaken(clientId, candidate)
      );
      if (!next) throw new HttpError(409, "USERNAME_TAKEN", "Ese username ya existe en este cliente");
      username = next;
    }
  }
  throw new HttpError(409, "USERNAME_TAKEN", "Ese username ya existe en este cliente");
};

const updateUser = async (
  clientId: string,
  productId: string,
  user: UserWithRoles,
  input: UserUpdateInput
): Promise<UserWithRoles> => {
  const data: Prisma.ClientUserUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.active !== undefined) data.active = input.active;
  if (input.username !== undefined) {
    const normalized = normalizeUsername(input.username);
    if (!normalized) throw new HttpError(400, "INVALID_USERNAME", INVALID_USERNAME);
    if (normalized !== user.username && (await isUsernameTaken(clientId, normalized, user.id))) {
      throw new HttpError(409, "USERNAME_TAKEN", "Ese username ya existe en este cliente");
    }
    data.username = normalized;
  }
  const roles = input.roles ? await resolveRoles(productId, input.roles) : null;

  try {
    return await db.$transaction(async (tx) => {
      if (roles) {
        await tx.clientUserRole.deleteMany({ where: { userId: user.id } });
        await tx.clientUserRole.createMany({ data: roles.map((role) => ({ userId: user.id, roleId: role.id })) });
      }
      return tx.clientUser.update({ where: { id: user.id }, data, include: USER_INCLUDE });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "USERNAME_TAKEN", "Ese username ya existe en este cliente");
    throw error;
  }
};

const resetUserPassword = async (user: UserWithRoles) => {
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  const updated = await db.clientUser.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: true },
    include: USER_INCLUDE,
  });
  return { user: updated, temporaryPassword: password };
};

export const clientUsersRouter = Router();

clientUsersRouter.get(
  "/:id/users",
  asyncHandler(async (req, res) => {
    const client = await findClient(req.params.id);
    const users = await db.clientUser.findMany({
      where: { clientId: client.id },
      include: USER_INCLUDE,
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    res.json(users.map(clientUserView));
  })
);

clientUsersRouter.post(
  "/:id/users",
  asyncHandler(async (req, res) => {
    const input = UserCreate.parse(req.body);
    const client = await findClient(req.params.id);
    const created = await createUser(client.id, client.productId, input);
    res.status(201).json({ user: clientUserView(created.user), temporaryPassword: created.temporaryPassword });
  })
);

clientUsersRouter.patch(
  "/:id/users/:userId",
  asyncHandler(async (req, res) => {
    const input = UserUpdate.parse(req.body);
    const client = await findClient(req.params.id);
    const user = await findUser(client.id, req.params.userId);
    res.json(clientUserView(await updateUser(client.id, client.productId, user, input)));
  })
);

/** Reset desde la consola: contraseña temporal nueva y `mustChangePassword = true`. */
clientUsersRouter.post(
  "/:id/users/:userId/password",
  asyncHandler(async (req, res) => {
    const client = await findClient(req.params.id);
    const user = await findUser(client.id, req.params.userId);
    const reset = await resetUserPassword(user);
    res.json({ user: clientUserView(reset.user), temporaryPassword: reset.temporaryPassword });
  })
);
