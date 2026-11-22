import { test } from "node:test";
import assert from "node:assert/strict";
import { salesMetrics, salesOverview, type SaleRow } from "./sales-metrics";

const CDMX = -360;

const sale = (localIso: string, over: Partial<SaleRow> = {}): SaleRow => ({
  // `localIso` es hora de la Ciudad de México; se guarda en UTC.
  openedAt: new Date(Date.parse(`${localIso}Z`) - CDMX * 60_000),
  utcOffsetMin: CDMX,
  cancelled: false,
  totalCents: 10_000,
  cashCents: 10_000,
  transferCents: 0,
  persons: 2,
  prepSeconds: 300,
  lines: [{ name: "Taco Pastor", variant: "", category: "Tacos", qty: 4, unitCents: 2_500 }],
  ...over,
});

test("totales, promedios y cancelaciones", () => {
  const m = salesMetrics(
    [
      sale("2026-11-20T21:10:00"),
      sale("2026-11-20T21:40:00", {
        totalCents: 30_000,
        cashCents: 0,
        transferCents: 30_000,
        persons: 4,
        prepSeconds: 900,
        lines: [
          { name: "Taco Asada", variant: "Harina", category: "Tacos", qty: 6, unitCents: 4_000 },
          { name: "Refresco", variant: "", category: "Bebidas", qty: 2, unitCents: 3_000 },
        ],
      }),
      sale("2026-11-20T22:00:00", { cancelled: true, totalCents: 99_900 }),
    ],
    "2026-11-20",
    "2026-11-20"
  );
  assert.equal(m.tickets, 2);
  assert.equal(m.cancelledTickets, 1);
  assert.equal(m.soldCents, 40_000);
  assert.equal(m.cashCents, 10_000);
  assert.equal(m.transferCents, 30_000);
  assert.equal(m.averageTicketCents, 20_000);
  // $400 entre 6 comensales.
  assert.equal(m.averagePerPersonCents, 6_667);
  assert.equal(m.averagePersons, 3);
  assert.equal(m.averageItems, 6);
  assert.equal(m.prepSecondsAvg, 600);
  assert.equal(m.prepSecondsP90, 900);
  assert.deepEqual(
    m.products.map((p) => [p.name, p.qty, p.soldCents]),
    [
      ["Taco Asada · Harina", 6, 24_000],
      ["Taco Pastor", 4, 10_000],
      ["Refresco", 2, 6_000],
    ]
  );
  assert.equal(m.categories[0].name, "Tacos");
  assert.equal(m.categories[0].share, 34_000 / 40_000);
});

test("horas, días de la semana y días en hora local", () => {
  // 23:30 en CDMX es 05:30 UTC del día siguiente: cuenta el viernes 20 a las 23.
  const m = salesMetrics([sale("2026-11-20T23:30:00"), sale("2026-11-22T13:00:00")], "2026-11-20", "2026-11-22");
  assert.equal(m.byHour[23].tickets, 1);
  assert.equal(m.byHour[13].tickets, 1);
  assert.equal(m.byWeekday[4].tickets, 1); // viernes
  assert.equal(m.byWeekday[6].tickets, 1); // domingo
  assert.deepEqual(
    m.byDay.map((d) => [d.date, d.tickets]),
    [
      ["2026-11-20", 1],
      ["2026-11-21", 0],
      ["2026-11-22", 1],
    ]
  );
});

test("fuera del rango no cuenta y sin ventas no divide entre cero", () => {
  const m = salesMetrics([sale("2026-11-19T20:00:00")], "2026-11-20", "2026-11-20");
  assert.equal(m.tickets, 0);
  assert.equal(m.averageTicketCents, 0);
  assert.equal(m.prepSecondsAvg, null);
  assert.equal(m.products.length, 0);
});

test("resumen: periodo, periodo anterior y por cliente", () => {
  const row = (clientId: string, localIso: string, totalCents: number, cancelled = false) => ({
    clientId,
    openedAt: new Date(Date.parse(`${localIso}Z`) - CDMX * 60_000),
    utcOffsetMin: CDMX,
    cancelled,
    totalCents,
  });
  const o = salesOverview(
    [
      row("a", "2026-11-21T21:00:00", 10_000),
      row("a", "2026-11-22T22:00:00", 30_000),
      row("b", "2026-11-22T20:00:00", 5_000),
      row("b", "2026-11-22T20:30:00", 99_000, true),
      // Periodo anterior (20 y 19 de noviembre) y fuera de todo.
      row("a", "2026-11-20T21:00:00", 8_000),
      row("a", "2026-11-18T21:00:00", 1_000),
    ],
    "2026-11-21",
    "2026-11-22"
  );
  assert.equal(o.tickets, 3);
  assert.equal(o.soldCents, 45_000);
  assert.equal(o.previousSoldCents, 8_000);
  assert.deepEqual(o.byDay.map((d) => d.soldCents), [10_000, 35_000]);
  assert.deepEqual(o.clients.map((c) => [c.clientId, c.soldCents, c.averageTicketCents]), [["a", 40_000, 20_000], ["b", 5_000, 5_000]]);
});
