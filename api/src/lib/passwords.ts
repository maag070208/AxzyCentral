/**
 * Contraseñas de los usuarios de clientes (contrato §2).
 *
 * El alta y el reset generan una contraseña temporal de 12 caracteres sin
 * caracteres ambiguos que se muestra una sola vez; en BD solo vive el hash
 * bcrypt (costo 12). La app obliga a cambiarla y desde ahí rige el mínimo de 8.
 */
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

/** Alfabeto sin ambigüedad del contrato (sin 0/O/1/l/I). */
export const TEMPORARY_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const TEMPORARY_PASSWORD_LENGTH = 12;

/** Límites de la contraseña nueva que captura el usuario en la app. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/** Costo bcrypt del contrato. */
const BCRYPT_ROUNDS = 12;

/** Contraseña temporal criptográficamente aleatoria (uniforme, sin sesgo). */
export const temporaryPassword = (length = TEMPORARY_PASSWORD_LENGTH): string => {
  let value = "";
  for (let index = 0; index < length; index++) {
    value += TEMPORARY_PASSWORD_ALPHABET[randomInt(TEMPORARY_PASSWORD_ALPHABET.length)];
  }
  return value;
};

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, BCRYPT_ROUNDS);

export const verifyPassword = (password: string, passwordHash: string): Promise<boolean> =>
  bcrypt.compare(password, passwordHash);
