import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TEMPORARY_PASSWORD_ALPHABET,
  TEMPORARY_PASSWORD_LENGTH,
  hashPassword,
  temporaryPassword,
  verifyPassword,
} from "./passwords";

test("contraseña temporal: 12 caracteres del alfabeto sin ambigüedad", () => {
  const password = temporaryPassword();
  assert.equal(password.length, TEMPORARY_PASSWORD_LENGTH);
  for (const char of password) {
    assert.ok(TEMPORARY_PASSWORD_ALPHABET.includes(char), `carácter fuera del alfabeto: ${char}`);
  }
  // Sin 0/O/1/l/I para que no se confundan al dictarla.
  assert.doesNotMatch(password, /[0O1lI]/);
});

test("contraseña temporal: longitud configurable y aleatoria", () => {
  assert.equal(temporaryPassword(20).length, 20);
  const values = new Set(Array.from({ length: 50 }, () => temporaryPassword()));
  assert.equal(values.size, 50);
});

test("hash bcrypt costo 12: verifica la contraseña correcta y rechaza la mala", async () => {
  const password = "temporal-123";
  const hash = await hashPassword(password);
  assert.match(hash, /^\$2[aby]\$12\$/);
  assert.ok(await verifyPassword(password, hash));
  assert.ok(!(await verifyPassword("otra-clave", hash)));
});
