import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUsername, suggestUsernames, uniqueUsername } from "./usernames";

test("nombre.apellido: acentos, mayúsculas y espacios de más", () => {
  assert.deepEqual(suggestUsernames("Asael Amaro").slice(0, 3), ["asael.amaro", "aamaro", "aamaro2"]);
  assert.deepEqual(suggestUsernames("  JOSÉ   Ángel   GÜERO ").slice(0, 3), ["jose.guero", "jguero", "jguero2"]);
  assert.deepEqual(suggestUsernames("María José").slice(0, 2), ["maria.jose", "mjose"]);
});

test("una sola palabra: la palabra es la base de los sufijos", () => {
  assert.deepEqual(suggestUsernames("Asael").slice(0, 3), ["asael", "asael2", "asael3"]);
  assert.deepEqual(suggestUsernames("Úrsula").slice(0, 2), ["ursula", "ursula2"]);
});

test("colisiones dentro del cliente: inicial+apellido y luego sufijos", async () => {
  const taken = new Set(["asael.amaro", "aamaro"]);
  const isTaken = async (candidate: string) => taken.has(candidate);
  assert.equal(await uniqueUsername("Asael Amaro", isTaken), "aamaro2");

  taken.add("aamaro2");
  assert.equal(await uniqueUsername("Asael Amaro", isTaken), "aamaro3");

  assert.equal(await uniqueUsername("Asael Amaro", async () => false), "asael.amaro");
});

test("nombre sin letras: no hay candidatos", async () => {
  assert.deepEqual(suggestUsernames("123"), []);
  assert.equal(await uniqueUsername("123", async () => false), null);
});

test("username explícito: se normaliza a minúsculas y se valida", () => {
  assert.equal(normalizeUsername(" Asael.Amaro "), "asael.amaro");
  assert.equal(normalizeUsername("Jefe_Turno-1"), "jefe_turno-1");
  assert.equal(normalizeUsername("a.b_c-d2"), "a.b_c-d2");
});

test("username explícito inválido: null", () => {
  for (const bad of ["ab", "1asael", "asael amaro", "asael/amaro", "-asael", "", "a"]) {
    assert.equal(normalizeUsername(bad), null, `debió rechazar ${JSON.stringify(bad)}`);
  }
});

test("los candidatos generados siempre cumplen la regla de username", () => {
  for (const name of ["Asael Amaro", "Lupita", "María de la Luz Hernández", "X"]) {
    for (const candidate of suggestUsernames(name)) {
      assert.match(candidate, /^[a-z][a-z0-9._-]{2,39}$/);
      assert.ok(candidate.length <= 40);
    }
  }
});
