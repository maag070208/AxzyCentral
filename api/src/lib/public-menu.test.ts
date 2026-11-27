import { test } from "node:test";
import assert from "node:assert/strict";
import { iconFor, iconSlug, money, renderMenu } from "./public-menu";

test("iconSlug igual que la app: acentos fuera, separadores a guion bajo", () => {
  assert.equal(iconSlug("Dragón Roll"), "dragon_roll");
  assert.equal(iconSlug("  Agua de Jamaica! "), "agua_de_jamaica");
});

test("iconFor sigue el orden de la app", () => {
  const keys = ["pizza_pepperoni", "pizza_generica", "ing_pepperoni", "cat_bebidas", "taco_asada", "rollo_dragon"];
  const p = (name: string, extra: Record<string, unknown> = {}) => ({ name, category: "Pizzas", ...extra });
  // Llave explícita del admin.
  assert.equal(iconFor(p("Pepperoni", { icon: "rollo_dragon" }), { name: "Pizzas" }, keys), "rollo_dragon");
  // Por nombre en el set, sin tomar ingredientes.
  assert.equal(iconFor(p("Pepperoni"), { name: "Pizzas" }, keys), "pizza_pepperoni");
  // Una llave explícita que ya no está en el set no gana.
  assert.equal(iconFor(p("Pepperoni", { icon: "no_existe" }), { name: "Pizzas" }, keys), "pizza_pepperoni");
  // Taquería por categoría y la de la categoría.
  assert.equal(iconFor({ name: "Asada", category: "Tacos" }, { name: "Tacos" }, ["taco_asada"]), "taco_asada");
  assert.equal(iconFor({ name: "Horchata", category: "Bebidas" }, { name: "Bebidas" }, keys), "cat_bebidas");
  // Sin nada más, el genérico; sin set, ninguno.
  assert.equal(iconFor(p("Hawaiana"), { name: "Pizzas" }, keys), "pizza_generica");
  assert.equal(iconFor(p("Hawaiana"), { name: "Pizzas" }, []), null);
});

test("money en pesos sin centavos de más", () => {
  assert.equal(money(17900), "$179");
  assert.equal(money(4550), "$45.50");
  assert.equal(money(125000), "$1,250");
});

test("renderMenu: categorías en orden, huérfanos en Otros y sin aviso de menú viejo", () => {
  const html = renderMenu({
    basePath: "/m/luigi",
    clientName: "Pizzas Don Luigi",
    giroName: "Pizzería",
    giroKey: "PIZZERIA",
    catalog: {
      categories: [{ name: "Pizzas" }, { name: "Vacía" }, { name: "Bebidas" }],
      products: [
        { id: "a", name: "Refresco", priceCents: 3000, category: "Bebidas" },
        { id: "b", name: "Hawaiana", priceCents: 15900, category: "Pizzas" },
        { id: "c", name: "Perdida", priceCents: 100, category: "Ya no existe" },
      ],
    },
    info: {},
    freeExtras: false,
    icons: new Map(),
  });
  const order = ["Pizzas", "Bebidas", "Otros"].map((n) => html.indexOf(`<h2>${n}</h2>`));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), "orden de secciones");
  assert.ok(!html.includes("<h2>Vacía</h2>"), "una categoría vacía no sale");
  // El comensal no ve desde cuándo es el menú (asustaba más de lo que ayudaba).
  assert.ok(!html.includes("actualizado hace"));
  assert.ok(!html.includes("Sin costo"));
});

test("renderMenu: opciones iguales en toda la sección se dicen una vez; sin set no hay cuadros vacíos", () => {
  const html = renderMenu({
    basePath: "/t",
    clientName: "T",
    giroName: "Taquería",
    giroKey: "TAQUERIA",
    catalog: {
      categories: [{ name: "Tacos" }],
      products: [
        { id: "a", name: "Asada", priceCents: 2500, category: "Tacos", modifierGroupIds: ["va"] },
        { id: "b", name: "Pastor", priceCents: 2500, category: "Tacos", modifierGroupIds: ["va"] },
      ],
      modifierGroups: [{ id: "va", name: "Va", options: ["Con todo", "Puro verde"] }],
    },
    info: {},
    freeExtras: false,
    icons: new Map(),
  });
  assert.equal(html.match(/Va:<\/span>/g)?.length, 1);
  assert.match(html, /<h2>Tacos<\/h2><svg class="orn"[^]*?<\/svg><\/div><ul class="opts shared">/);
  // Sin set de iconos no hay imágenes ni portada ilustrada.
  assert.ok(!html.includes("<img"));
  // Colores del giro.
  assert.match(html, /--hero:#1F3B2D/);
});

test("themeOf: cada giro tiene su paleta y uno desconocido usa la de la app", async () => {
  const { themeOf } = await import("./public-menu");
  assert.notEqual(themeOf("SUSHI").hero, themeOf("PIZZERIA").hero);
  assert.equal(themeOf("BIRRIA").hero, "#2F7358");
});
