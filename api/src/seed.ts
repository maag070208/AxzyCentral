import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "./db";

/** Crea (o actualiza la contraseña de) el administrador inicial. */
const main = async () => {
  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!username || !password || password.length < 12) {
    throw new Error("Define INITIAL_ADMIN_USERNAME e INITIAL_ADMIN_PASSWORD (mínimo 12 caracteres)");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await db.admin.upsert({
    where: { username },
    create: { username, name: process.env.INITIAL_ADMIN_NAME ?? username, passwordHash },
    update: { passwordHash },
  });
  console.log(`Administrador listo: ${username}`);
};

main().finally(() => db.$disconnect());
