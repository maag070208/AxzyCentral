import { test } from "node:test";
import assert from "node:assert/strict";
import { licenseValidUntil } from "./license-window";

const now = new Date("2026-11-21T12:00:00.000Z");
const days = (d: Date) => Math.round((d.getTime() - now.getTime()) / 86_400_000);

test("suspendida: vence de inmediato", () => {
  assert.equal(licenseValidUntil(now, "SUSPENDED", null).getTime(), now.getTime());
});

test("sin pagos pendientes: 35 días", () => {
  assert.equal(days(licenseValidUntil(now, "ACTIVE", null)), 35);
});

test("pago pendiente: su vencimiento más 5 días", () => {
  assert.equal(days(licenseValidUntil(now, "ACTIVE", new Date("2026-12-01T12:00:00.000Z"))), 15);
});

test("pago ya vencido pero activa: mínimo 3 días", () => {
  assert.equal(days(licenseValidUntil(now, "ACTIVE", new Date("2026-10-01T12:00:00.000Z"))), 3);
});

test("pago muy lejano: tope de 45 días", () => {
  assert.equal(days(licenseValidUntil(now, "ACTIVE", new Date("2027-06-01T12:00:00.000Z"))), 45);
});
