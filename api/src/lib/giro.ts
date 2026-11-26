/**
 * Giros (cada producto de la Central): sus palabras, las partes del modelo que usa,
 * cómo se agrupan los iconos de un kit y el formato del menú que viaja a la app.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

const word = z.string().trim().min(1).max(30);

/** Cómo se llama cada cosa en el giro. Lo que falte, la app lo toma de la taquería. */
export const Terms = z
  .object({ kitchenRole: word, waiterRole: word, item: word, kitchen: word })
  .partial()
  .strict();

/** Partes del modelo que usa el giro (la taquería las usa todas). */
export const Features = z
  .object({ mixes: z.boolean(), meatColors: z.boolean(), freeExtras: z.boolean() })
  .partial()
  .strict();

/** Menú que viaja entre la Central y la cocina: el mismo formato que usa la app. */
export const CatalogData = z
  .object({
    categories: z.array(z.record(z.unknown())).max(200).default([]),
    products: z.array(z.record(z.unknown())).max(2000),
    modifierGroups: z.array(z.record(z.unknown())).max(500).default([]),
    freeExtras: z.array(z.string().max(60)).max(100).default([]),
    stations: z.array(z.record(z.unknown())).max(50).default([]),
  })
  .passthrough();
export type CatalogData = z.infer<typeof CatalogData>;

/** Tope del menú (JSON); un menú real ronda los 50 kB. */
export const CATALOG_LIMIT = "1mb";
/** Tope de un kit de iconos subido desde la consola (PNG en base64). */
export const ICON_SET_LIMIT = "16mb";

const GROUPS: Record<string, string> = {
  rollo: "Rollos",
  sushi: "Sushi",
  pizza: "Pizzas",
  taco: "Tacos",
  esp: "Especialidades",
  cat: "Categorías",
  ing: "Ingredientes",
  side: "Acompañamientos",
  beb: "Bebidas",
  extra: "Extras",
  serv: "Servicio",
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** `rollo_dragon` → grupo "Rollos" y etiqueta "Dragon". Sin prefijo conocido, el prefijo es el grupo. */
export const groupOf = (key: string): string => {
  const prefix = key.includes("_") ? key.slice(0, key.indexOf("_")) : "";
  return GROUPS[prefix] ?? (prefix ? capitalize(prefix) : "Otros");
};

export const labelOf = (key: string): string => {
  const rest = key.includes("_") && GROUPS[key.slice(0, key.indexOf("_"))] ? key.slice(key.indexOf("_") + 1) : key;
  return capitalize(rest.replace(/_/g, " "));
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Un icono de 256 px pesa ~20 kB; 400 kB deja margen sin aceptar fotos. */
export const MAX_ICON_BYTES = 400_000;

/** PNG en base64 → bytes; null si no es un PNG o es demasiado grande. */
export const pngOf = (base64: string): Buffer | null => {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < PNG_MAGIC.length || bytes.length > MAX_ICON_BYTES) return null;
  return bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC) ? bytes : null;
};

export const shaOf = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
