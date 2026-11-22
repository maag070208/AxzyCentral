/**
 * Usernames de los usuarios de clientes (contrato §2).
 *
 * El username es único **dentro del cliente** (la app resuelve el cliente con
 * el código de activación del dispositivo). Se arma con el nombre:
 * `nombre.apellido` → `inicial+apellido` → `base2`, `base3`…
 *
 * Ejemplo: `Asael Amaro` → `asael.amaro`; si ya existe → `aamaro`; si también
 * existe → `aamaro2`.
 */

/** Regla del contrato para un username explícito (ya normalizado a minúsculas). */
export const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,39}$/;

const MAX_USERNAME = 40;
/** Tope por palabra para que `nombre.apellido` no se pase de largo. */
const MAX_TOKEN = 20;
/** Número máximo de candidatos que se generan (suficiente para cualquier cliente). */
const MAX_CANDIDATES = 100;

/** Palabras del nombre: minúsculas, sin acentos y solo letras/números. */
const words = (name: string): string[] =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.slice(0, MAX_TOKEN));

const clamp = (value: string): string => value.slice(0, MAX_USERNAME);

/** `aamaro` + `2` → `aamaro2`, recortando la base si hace falta. */
const withSuffix = (base: string, suffix: number): string => {
  const tail = String(suffix);
  return `${base.slice(0, MAX_USERNAME - tail.length)}${tail}`;
};

/**
 * Candidatos en el orden del contrato. El primero es `nombre.apellido`; el
 * segundo (`inicial+apellido`) es la base de los sufijos. Un nombre de una sola
 * palabra usa esa palabra como base.
 */
export const suggestUsernames = (name: string, limit = MAX_CANDIDATES): string[] => {
  const tokens = words(name);
  if (tokens.length === 0) return [];

  const first = tokens[0];
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : null;
  const primary = last ? clamp(`${first}.${last}`) : clamp(first);
  const base = last ? clamp(`${first[0]}${last}`) : primary;

  const out: string[] = [];
  const push = (candidate: string): void => {
    if (out.length < limit && USERNAME_PATTERN.test(candidate) && !out.includes(candidate)) out.push(candidate);
  };
  push(primary);
  push(base);
  for (let suffix = 2; out.length < limit && suffix < 10_000; suffix++) push(withSuffix(base, suffix));
  return out;
};

/**
 * Normaliza un username explícito: minúsculas y sin espacios de más. Devuelve
 * `null` si no cumple la regla del contrato.
 */
export const normalizeUsername = (raw: string): string | null => {
  const value = raw.trim().toLowerCase();
  return USERNAME_PATTERN.test(value) ? value : null;
};

/**
 * Primer candidato libre según `isTaken`. Devuelve `null` si ninguno está libre
 * (nombre raro sin letras o cliente con demasiadas coincidencias).
 */
export const uniqueUsername = async (
  name: string,
  isTaken: (username: string) => Promise<boolean>
): Promise<string | null> => {
  for (const candidate of suggestUsernames(name)) {
    if (!(await isTaken(candidate))) return candidate;
  }
  return null;
};
