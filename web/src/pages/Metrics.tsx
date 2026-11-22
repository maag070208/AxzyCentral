import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ITSegmentedControl } from "@axzydev/axzy_ui_system";
import { LuChefHat, LuCircleX, LuLightbulb, LuReceipt, LuShoppingBag, LuUsers, LuWallet } from "react-icons/lu";
import { api, type ClientSummary } from "../api";
import { BarChart, Delta, ShareList, SplitBar } from "../components/SalesCharts";
import {
  PERIODS,
  WEEKDAYS,
  WEEKDAYS_LONG,
  change,
  hourLabel,
  minutes,
  pct,
  periodRange,
  pesos,
  salesMetrics,
  salesOverview,
  shortDate,
  type PeriodKey,
  type SalesMetrics,
} from "../sales";
import { errorOf } from "../shared";
import { Card, Empty, Page, StatCard } from "../ui";

/** Frases para el cliente a partir de sus números. Solo las que tienen datos suficientes. */
function insightsOf(m: SalesMetrics): string[] {
  const out: string[] = [];
  if (m.tickets === 0) return out;
  const hours = m.byHour.map((b, h) => ({ h, ...b })).filter((b) => b.tickets > 0);
  const peak = [...hours].sort((a, b) => b.soldCents - a.soldCents)[0];
  if (peak) {
    out.push(
      `La hora fuerte es de ${hourLabel(peak.h)} a ${hourLabel((peak.h + 1) % 24)}: ahí entra el ${pct(peak.soldCents / m.soldCents)} de lo vendido.`
    );
  }
  const days = m.byWeekday.map((b, d) => ({ d, ...b })).filter((b) => b.soldCents > 0);
  if (days.length >= 2) {
    const best = days.reduce((a, b) => (b.soldCents > a.soldCents ? b : a));
    const worst = days.reduce((a, b) => (b.soldCents < a.soldCents ? b : a));
    if (worst.soldCents > 0 && best.d !== worst.d) {
      out.push(
        `El ${WEEKDAYS_LONG[best.d]} vende ${(best.soldCents / worst.soldCents).toLocaleString("es-MX", { maximumFractionDigits: 1 })} veces lo del ${WEEKDAYS_LONG[worst.d]}.`
      );
    }
  }
  const star = m.products[0];
  if (star) out.push(`${star.name} es el ${pct(star.share)} de las ventas (${star.qty.toLocaleString("es-MX")} piezas).`);
  if (m.prepSecondsP90 !== null && m.prepSecondsAvg !== null) {
    out.push(`Una orden sale de cocina en ${minutes(m.prepSecondsAvg)} en promedio; 1 de cada 10 tarda más de ${minutes(m.prepSecondsP90)}.`);
  }
  return out;
}

export default function Metrics() {
  const [params, setParams] = useSearchParams();
  const period = (PERIODS.some((p) => p.value === params.get("periodo")) ? params.get("periodo") : "30d") as PeriodKey;
  const range = useMemo(() => periodRange(period), [period]);
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [withSales, setWithSales] = useState<string[]>([]);
  const [current, setCurrent] = useState<SalesMetrics | null>(null);
  const [previous, setPrevious] = useState<SalesMetrics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Clientes y quién reportó ventas en el periodo (para elegir uno por defecto).
  useEffect(() => {
    setError("");
    Promise.all([api<ClientSummary[]>("GET", "/clients"), salesOverview(range.from, range.to)])
      .then(([c, o]) => {
        setClients(c);
        setWithSales(o.clients.map((x) => x.clientId));
      })
      .catch((e) => setError(errorOf(e)));
  }, [range.from, range.to]);

  const clientId = params.get("cliente") ?? withSales[0] ?? clients?.[0]?.id ?? null;
  const client = clients?.find((c) => c.id === clientId) ?? null;

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    setError("");
    Promise.all([salesMetrics(clientId, range.from, range.to), salesMetrics(clientId, range.prevFrom, range.prevTo)])
      .then(([now, before]) => {
        setCurrent(now);
        setPrevious(before);
      })
      .catch((e) => setError(errorOf(e)))
      .finally(() => setLoading(false));
  }, [clientId, range]);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  const m = current;
  const insights = m ? insightsOf(m) : [];
  const sortedClients = useMemo(
    () => [...(clients ?? [])].sort((a, b) => Number(withSales.includes(b.id)) - Number(withSales.includes(a.id)) || a.name.localeCompare(b.name, "es")),
    [clients, withSales]
  );
  // El día del negocio empieza a las 6: las horas de madrugada van al final.
  // Solo se muestran de la primera a la última hora con ventas.
  const businessHours = m ? [...m.byHour.map((b, h) => ({ h, ...b })).slice(6), ...m.byHour.map((b, h) => ({ h, ...b })).slice(0, 6)] : [];
  const firstHour = businessHours.findIndex((b) => b.tickets > 0);
  const lastHour = businessHours.length - 1 - [...businessHours].reverse().findIndex((b) => b.tickets > 0);
  const nightOrder = firstHour < 0 ? [] : businessHours.slice(Math.max(0, firstHour - 1), Math.min(businessHours.length, lastHour + 2));
  const longPeriod = (m?.byDay.length ?? 0) > 14;

  return (
    <Page
      eyebrow="Ventas"
      title="Métricas"
      description="Lo que venden tus clientes con su app, para ayudarles a decidir con números."
      loading={clients === null && !error}
      error={error || null}
      actions={
        <>
          {sortedClients.length > 0 && (
            <label className="flex items-center gap-2">
              <span className="sr-only">Cliente</span>
              <select
                value={clientId ?? ""}
                onChange={(e) => set("cliente", e.target.value)}
                className="h-9 max-w-[260px] truncate rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-900"
              >
                {sortedClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {withSales.includes(c.id) ? "" : " · sin ventas"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ITSegmentedControl options={PERIODS} value={period} onChange={(v) => set("periodo", v)} size="sm" />
        </>
      }
    >
      {clients && clients.length === 0 ? (
        <Empty title="Todavía no tienes clientes" description="Cuando un cliente active su app y cierre cuentas, aquí verás sus ventas." />
      ) : !m ? null : m.tickets === 0 ? (
        <Empty
          title={`${client?.name ?? "Este cliente"} no tiene ventas en el periodo`}
          description="La app de cocina reporta cada cuenta cerrada cuando tiene internet. Prueba otro periodo o revisa que la app esté en la versión 1.1.0 o más nueva."
        />
      ) : (
        <div className={`flex flex-col gap-4 transition-opacity lg:gap-5 ${loading ? "opacity-60" : ""}`}>
          <p className="-mt-2 text-[13px] text-slate-500 dark:text-slate-400">
            {client?.name} · {shortDate(m.from)} – {shortDate(m.to)} · comparado con {shortDate(range.prevFrom)} – {shortDate(range.prevTo)}
          </p>

          <div className="axc-stagger grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              label="Vendido"
              value={pesos(m.soldCents)}
              hint={<Delta value={change(m.soldCents, previous?.soldCents ?? 0)} />}
              icon={<LuWallet size={16} />}
              tone="teal"
            />
            <StatCard
              label="Cuentas"
              value={m.tickets.toLocaleString("es-MX")}
              hint={<Delta value={change(m.tickets, previous?.tickets ?? 0)} />}
              icon={<LuReceipt size={16} />}
              tone="navy"
            />
            <StatCard
              label="Ticket promedio"
              value={pesos(m.averageTicketCents)}
              hint={<Delta value={change(m.averageTicketCents, previous?.averageTicketCents ?? 0)} />}
              icon={<LuShoppingBag size={16} />}
              tone="green"
            />
            <StatCard
              label="Por comensal"
              value={pesos(m.averagePerPersonCents)}
              hint={`${m.averagePersons.toLocaleString("es-MX")} personas y ${m.averageItems.toLocaleString("es-MX")} piezas por cuenta`}
              icon={<LuUsers size={16} />}
              tone="violet"
            />
          </div>

          {insights.length > 0 && (
            <Card bodyClassName="p-4 sm:p-5">
              <div className="flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                  <LuLightbulb size={16} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">Lo que dicen los números</h2>
                  <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-[13.5px] text-slate-700 md:grid-cols-2 dark:text-slate-200">
                    {insights.map((t) => (
                      <li key={t} className="flex gap-2">
                        <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:gap-5">
            <Card title="Ventas por día" subtitle={`Mejor día: ${(() => { const b = m.byDay.reduce((a, d) => (d.soldCents > a.soldCents ? d : a)); return `${shortDate(b.date)} con ${pesos(b.soldCents)}`; })()}`}>
              <BarChart
                ariaLabel="Ventas por día"
                format={pesos}
                labelEvery={longPeriod ? 5 : 1}
                data={m.byDay.map((d) => ({
                  key: d.date,
                  label: longPeriod ? String(new Date(`${d.date}T12:00:00`).getDate()) : WEEKDAYS[(new Date(`${d.date}T12:00:00`).getDay() + 6) % 7],
                  value: d.soldCents,
                  title: new Date(`${d.date}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" }),
                  detail: `${d.tickets} cuentas`,
                }))}
              />
            </Card>

            <div className="flex min-w-0 flex-col gap-4">
              <Card title="Cómo pagan">
                <SplitBar
                  format={pesos}
                  parts={[
                    { label: "Efectivo", value: m.cashCents, color: "var(--viz-cash)" },
                    { label: "Transferencia", value: m.transferCents, color: "var(--viz-transfer)" },
                  ]}
                />
              </Card>
              <Card bodyClassName="p-0">
                <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                  <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                      <LuChefHat size={16} />
                    </span>
                    <dt className="flex-1 text-[13px] text-slate-600 dark:text-slate-300">Tiempo de cocina</dt>
                    <dd className="text-right">
                      <span className="block text-[15px] font-semibold text-slate-900 dark:text-white">{minutes(m.prepSecondsAvg)}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">9 de cada 10 en {minutes(m.prepSecondsP90)}</span>
                    </dd>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                      <LuCircleX size={16} />
                    </span>
                    <dt className="flex-1 text-[13px] text-slate-600 dark:text-slate-300">Cuentas canceladas</dt>
                    <dd className="text-right">
                      <span className="block text-[15px] font-semibold text-slate-900 dark:text-white">{m.cancelledTickets}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        {pct(m.cancelledTickets / Math.max(1, m.tickets + m.cancelledTickets))} de todas
                      </span>
                    </dd>
                  </div>
                </dl>
              </Card>
            </div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2 xl:gap-5">
            <Card title="Hora pico" subtitle="Ventas según la hora en que se abrió la cuenta">
              <BarChart
                ariaLabel="Ventas por hora"
                format={pesos}
                height={160}
                labelEvery={nightOrder.length > 12 ? 2 : 1}
                data={nightOrder.map((b) => ({
                  key: String(b.h),
                  label: String(b.h),
                  value: b.soldCents,
                  title: `${hourLabel(b.h)} – ${hourLabel((b.h + 1) % 24)}`,
                  detail: `${b.tickets} cuentas`,
                }))}
              />
            </Card>
            <Card title="Día de la semana" subtitle="Suma de cada día en el periodo">
              <BarChart
                ariaLabel="Ventas por día de la semana"
                format={pesos}
                height={160}
                data={m.byWeekday.map((b, d) => ({
                  key: WEEKDAYS[d],
                  label: WEEKDAYS[d],
                  value: b.soldCents,
                  title: WEEKDAYS_LONG[d],
                  detail: `${b.tickets} cuentas`,
                }))}
              />
            </Card>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:gap-5">
            <Card title="Productos más vendidos" subtitle={`Top ${Math.min(10, m.products.length)} de ${m.products.length} por importe`}>
              <ShareList
                format={pesos}
                rows={m.products.slice(0, 10).map((p) => ({ name: p.name, value: p.soldCents, share: p.share, sub: `${p.qty.toLocaleString("es-MX")} pzas` }))}
              />
            </Card>
            <Card title="Por categoría">
              <ShareList
                format={pesos}
                rows={m.categories.map((c) => ({ name: c.name, value: c.soldCents, share: c.share, sub: `${c.qty.toLocaleString("es-MX")} pzas` }))}
              />
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}
