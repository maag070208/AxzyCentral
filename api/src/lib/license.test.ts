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
    // terms/features, iconSet y catalog son agregados: la 1.2.x los ignora y lee lo demás igual.
    product: { key: "TAQUERIA", name: "Taquería", terms: {}, features: {} },
    plan: { name: "Básico" },
    nextDueDate: "2026-12-01",
    validUntil: new Date("2026-12-06T00:00:00.000Z").toISOString(),
    serverTime: now.toISOString(),
    limits: { kitchens: null, waiters: null },
    latestApp: null,
    iconSet: null,
    catalog: null,
  });
});

test("límites del plan y última versión publicada", () => {
  const body = licenseBody(
    {
      ...client,
      plan: { name: "Básico", maxKitchens: 1, maxWaiters: 2 },
      product: { ...client.product, latestVersionCode: 6, latestVersionName: "1.3.0", latestUrl: "https://example.com/apk" },
    },
    null,
    now
  );
  assert.deepEqual(body.limits, { kitchens: 1, waiters: 2 });
  assert.deepEqual(body.latestApp, { versionCode: 6, versionName: "1.3.0", url: "https://example.com/apk", notes: null });
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
