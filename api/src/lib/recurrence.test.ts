import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampDueDay,
  dateOnly,
  fromDateOnly,
  nextPeriod,
  periodOf,
  periodPlusMonths,
  recurringDueDate,
} from "./recurrence";

const now = new Date("2026-11-21T12:00:00.000Z");

test("periodOf: mes en UTC con dos dígitos", () => {
  assert.equal(periodOf(now), "2026-11");
  assert.equal(periodOf(new Date("2027-01-01T00:00:00.000Z")), "2027-01");
});

test("periodPlusMonths: cruza el año en los dos sentidos", () => {
  assert.equal(periodPlusMonths("2026-11", 1), "2026-12");
  assert.equal(periodPlusMonths("2026-12", 1), "2027-01");
  assert.equal(periodPlusMonths("2027-01", -1), "2026-12");
  assert.equal(periodPlusMonths("2026-11", 12), "2027-11");
  assert.equal(periodPlusMonths("2026-11", 14), "2028-01");
});

test("nextPeriod: sin cobros toma el mes actual; con cobros avanza un mes", () => {
  assert.equal(nextPeriod(null, now), "2026-11");
  assert.equal(nextPeriod(undefined, now), "2026-11");
  assert.equal(nextPeriod("2026-09", now), "2026-10");
  assert.equal(nextPeriod("2026-12", now), "2027-01");
});

test("clampDueDay: siempre entre 1 y 28", () => {
  assert.equal(clampDueDay(1), 1);
  assert.equal(clampDueDay(15), 15);
  assert.equal(clampDueDay(28), 28);
  assert.equal(clampDueDay(29), 28);
  assert.equal(clampDueDay(31), 28);
  assert.equal(clampDueDay(0), 1);
});

test("recurringDueDate: el primero vence hoy", () => {
  assert.equal(dateOnly(recurringDueDate("2026-11", null, now)), "2026-11-21");
});

test("recurringDueDate: mismo día del mes en el periodo nuevo", () => {
  const previous = fromDateOnly("2026-09-05");
  assert.equal(dateOnly(recurringDueDate("2026-10", previous, now)), "2026-10-05");
});

test("recurringDueDate: el día 31 se acota a 28", () => {
  const previous = fromDateOnly("2026-01-31");
  assert.equal(dateOnly(recurringDueDate("2026-02", previous, now)), "2026-02-28");
});

test("recurringDueDate: diciembre pasa a enero del año siguiente", () => {
  const previous = fromDateOnly("2026-12-10");
  assert.equal(dateOnly(recurringDueDate("2027-01", previous, now)), "2027-01-10");
});
