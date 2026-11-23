/**
 * Plantillas de menú con las que arranca un giro: el admin elige una como menú base del giro
 * (Productos → Giro) o la copia al menú de un cliente. Mismo formato que el menú de la app.
 * Taquería sale del menú semilla de la app (`OrderStore.seed()`).
 */
import { CatalogData } from "../giro";
import taqueria from "./taqueria.json";
import sushi from "./sushi.json";
import pizzeria from "./pizzeria.json";

export type MenuTemplate = { key: string; name: string; data: CatalogData };

export const MENU_TEMPLATES: MenuTemplate[] = [
  { key: "taqueria", name: "Taquería", data: CatalogData.parse(taqueria) },
  { key: "sushi", name: "Sushi", data: CatalogData.parse(sushi) },
  { key: "pizzeria", name: "Pizzería", data: CatalogData.parse(pizzeria) },
];

export const menuTemplate = (key: string) => MENU_TEMPLATES.find((t) => t.key === key) ?? null;
