import { createHash, randomBytes } from "node:crypto";

/** Código de activación de un dispositivo de cocina: se muestra una vez; en BD solo su hash. */
export const DEVICE_CODE_PREFIX = "axc_";

export const hashCode = (code: string): string => createHash("sha256").update(code).digest("hex");

export const newDeviceCode = (): { code: string; tokenHash: string } => {
  const code = `${DEVICE_CODE_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { code, tokenHash: hashCode(code) };
};

export const bearerOf = (header: string | undefined): string | null => {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  return scheme === "Bearer" && value?.trim() ? value.trim() : null;
};
