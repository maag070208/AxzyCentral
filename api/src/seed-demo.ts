/**
 * Taquería de demo con un mes de ventas inventadas, para enseñar las métricas.
 * Solo corre contra una base local (lo usa `scripts/dev-local.sh --demo`).
 * Se puede correr varias veces: reemplaza la demo anterior.
 */
import "dotenv/config";
import { db } from "./db";
import { newDeviceCode } from "./lib/tokens";

const url = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  throw new Error("La demo solo se carga en una base local");
}

const DEMO = "Taquería Demo (datos de ejemplo)";
const OFFSET = -360; // Ciudad de México

const MENU = [
  { productId: "pastor", name: "Taco Pastor", category: "Tacos", cents: 2_500, weight: 30 },
  { productId: "asada", name: "Taco Asada", category: "Tacos", cents: 3_000, weight: 18 },
  { productId: "suadero", name: "Taco Suadero", category: "Tacos", cents: 3_000, weight: 12 },
  { productId: "cabeza", name: "Taco Cabeza", category: "Tacos", cents: 3_000, weight: 6 },
  { productId: "campechano", name: "Taco Mixto", category: "Tacos", cents: 3_500, weight: 8 },
  { productId: "gringa", name: "Gringa", category: "Especialidades", cents: 7_500, weight: 5 },
  { productId: "quesataco", name: "Quesataco Asada", category: "Especialidades", cents: 4_500, weight: 6 },
  { productId: "refresco", name: "Refresco", category: "Bebidas", cents: 3_000, weight: 12 },
  { productId: "agua", name: "Agua de horchata", category: "Bebidas", cents: 3_500, weight: 9 },
];
/** Ventas por hora de la noche: sube a las 21 h y baja después de medianoche. */
const HOURS: Record<number, number> = { 18: 3, 19: 6, 20: 10, 21: 14, 22: 12, 23: 8, 0: 4, 1: 2 };
/** Lunes … domingo. */
const WEEKDAY = [0.6, 0.6, 0.7, 0.9, 1.4, 1.7, 1.2];

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T extends { weight: number }>(items: T[]) => {
  let r = rand() * items.reduce((s, i) => s + i.weight, 0);
  return items.find((i) => (r -= i.weight) <= 0) ?? items[0];
};

const main = async () => {
  const product = await db.product.findUniqueOrThrow({ where: { key: "TAQUERIA" } });
  await db.client.deleteMany({ where: { name: DEMO } });
  const client = await db.client.create({ data: { productId: product.id, name: DEMO, contactName: "Demo" } });
  const device = await db.device.create({
    data: { clientId: client.id, name: "Tablet de cocina", model: "DEMO", tokenHash: newDeviceCode().tokenHash, appVersion: "1.1.0 (4)", activatedAt: new Date(), lastSeenAt: new Date() },
  });

  const today = new Date();
  let tickets = 0;
  for (let back = 60; back >= 0; back--) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back));
    const weekday = (day.getUTCDay() + 6) % 7;
    for (const [h, base] of Object.entries(HOURS)) {
      const hour = Number(h);
      const count = Math.round(base * WEEKDAY[weekday] * (0.7 + rand() * 0.6));
      for (let i = 0; i < count; i++) {
        // Hora local → UTC. Después de medianoche cuenta como el día siguiente.
        const localMs = day.getTime() + (hour < 6 ? 24 + hour : hour) * 3_600_000 + Math.floor(rand() * 3_600_000);
        const openedAt = new Date(localMs - OFFSET * 60_000);
        const persons = 1 + Math.floor(rand() * 4);
        const lines = new Map<string, { productId: string; name: string; category: string; qty: number; unitCents: number; variant: string }>();
        for (let n = 0; n < persons * (2 + Math.floor(rand() * 3)); n++) {
          const m = pick(MENU);
          const harina = m.category === "Tacos" && rand() < 0.15;
          const key = m.productId + (harina ? "-h" : "");
          const line = lines.get(key) ?? { productId: m.productId, name: m.name, category: m.category, qty: 0, unitCents: harina ? m.cents + 1_000 : m.cents, variant: harina ? "Harina" : "" };
          line.qty += 1;
          lines.set(key, line);
        }
        const total = [...lines.values()].reduce((s, l) => s + l.qty * l.unitCents, 0);
        const cancelled = rand() < 0.02;
        const cash = rand() < 0.7 ? total : 0;
        // Más lento en la hora pico.
        const prep = Math.round((240 + base * 25) * (0.6 + rand() * 0.8));
        await db.sale.create({
          data: {
            clientId: client.id,
            deviceId: device.id,
            externalId: `demo-${tickets}`,
            table: String(1 + Math.floor(rand() * 12)),
            accountNumber: 1,
            openedAt,
            closedAt: new Date(openedAt.getTime() + (25 + rand() * 30) * 60_000),
            utcOffsetMin: OFFSET,
            cancelled,
            totalCents: cancelled ? 0 : total,
            cashCents: cancelled ? 0 : cash,
            transferCents: cancelled ? 0 : total - cash,
            persons,
            prepSeconds: prep,
            appVersion: "1.1.0 (4)",
            lines: { create: cancelled ? [] : [...lines.values()] },
          },
        });
        tickets++;
      }
    }
  }
  console.log(`Demo lista: ${DEMO} con ${tickets} cuentas en 61 días`);
};

main().finally(() => db.$disconnect());
