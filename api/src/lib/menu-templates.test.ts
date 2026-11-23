import { test } from "node:test";
import assert from "node:assert/strict";
import { MENU_TEMPLATES } from "./menu-templates";

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => r[k] as string;

for (const t of MENU_TEMPLATES) {
  test(`${t.name}: ids únicos y referencias que existen (la app rechaza un menú con ids repetidos)`, () => {
    const ids = t.data.products.map((p) => str(p, "id"));
    assert.equal(new Set(ids).size, ids.length, "ids de producto repetidos");
    const groups = new Set(t.data.modifierGroups.map((g) => str(g, "id")));
    assert.equal(groups.size, t.data.modifierGroups.length, "ids de opciones repetidos");
    const categories = new Set(t.data.categories.map((c) => str(c, "name")));
    for (const p of t.data.products) {
      assert.ok(categories.has(str(p, "category")), `${str(p, "name")}: categoría ${str(p, "category")} no existe`);
      for (const g of (p.modifierGroupIds as string[] | undefined) ?? []) assert.ok(groups.has(g), `${str(p, "name")}: opciones ${g} no existen`);
    }
  });

  test(`${t.name}: cada producto tiene precio y el de las presentaciones es el de la primera`, () => {
    // Las órdenes de la taquería se venden por monto: no llevan precio fijo.
    const byAmount = new Set(t.data.categories.filter((c) => c.byAmount === true).map((c) => str(c, "name")));
    for (const p of t.data.products.filter((x) => !byAmount.has(str(x, "category")))) {
      const variants = (p.variants as { name: string; priceCents: number }[] | undefined) ?? [];
      if (variants.length === 0) assert.ok((p.priceCents as number) > 0, `${str(p, "name")} sin precio`);
      else assert.equal(p.priceCents, variants[0].priceCents, str(p, "name"));
      for (const v of variants) assert.ok(v.priceCents > 0, `${str(p, "name")} ${v.name} sin precio`);
    }
  });

  test(`${t.name}: las opciones que arrancan solas son de su grupo`, () => {
    for (const g of t.data.modifierGroups) {
      const d = g.defaultOption as string | undefined;
      if (d) assert.ok((g.options as string[]).includes(d), `${str(g, "name")}: ${d}`);
    }
  });
}

test("pizzería: las pizzas vienen en Chica, Mediana y Grande con orilla como opción", () => {
  const pizzas = MENU_TEMPLATES.find((t) => t.key === "pizzeria")!.data.products.filter((p) => p.category === "Pizzas");
  assert.ok(pizzas.length >= 6);
  for (const p of pizzas) {
    assert.deepEqual((p.variants as { name: string }[]).map((v) => v.name), ["Chica", "Mediana", "Grande"]);
    assert.ok((p.modifierGroupIds as string[]).includes("g-orilla"));
  }
});
