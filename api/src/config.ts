import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  PORT: z.coerce.number().int().default(4100),
  WEB_ORIGIN: z.string().default("http://localhost:5100"),
  NODE_ENV: z.string().default("development"),
});

export const config = Env.parse(process.env);
