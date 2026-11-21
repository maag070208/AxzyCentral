import { test } from "node:test";
import assert from "node:assert/strict";
import { licenseBody } from "./license";

const now = new Date("2026-11-21T12:00:00.000Z");
const client = {
  name: "Tacos El Güero",
  status: "ACTIVE" as const,
  plan: { name: "Básico" },
  product: { key: "TAQUERIA", name: "Taquería" },
};

test("licencia activa con cobro pendiente: mismo contrato de siempre", () => {
  const body = licenseBody(client, new Date("2026-12-01T00:00:00.000Z"), now);
  assert.deepEqual(body, {
    status: "ACTIVE",
    tenant: { name: "Tacos El Güero" },
    product: { key: "TAQUERIA", name: "Taquería" },
    plan: { name: "Básico" },
    nextDueDate: "2026-12-01",
    validUntil: new Date("2026-12-06T00:00:00.000Z").toISOString(),
    serverTime: now.toISOString(),
  });
});

test("licencia sin plan ni cobros: plan nulo y ventana por defecto", () => {
  const body = licenseBody({ ...client, plan: null }, null, now);
  assert.equal(body.plan, null);
  assert.equal(body.nextDueDate, null);
});

test("cliente suspendido: vence de inmediato", () => {
  const body = licenseBody({ ...client, status: "SUSPENDED" }, null, now);
  assert.equal(body.status, "SUSPENDED");
  assert.equal(body.validUntil, now.toISOString());
});
