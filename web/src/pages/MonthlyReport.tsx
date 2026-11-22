import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ITButton } from "@axzydev/axzy_ui_system";
import { LuArrowLeft, LuPrinter } from "react-icons/lu";
import { api, type ClientSummary } from "../api";
import { BarChart, Delta, ShareList, SplitBar } from "../components/SalesCharts";
import {
  WEEKDAYS,
  WEEKDAYS_LONG,
  change,
  hourLabel,
  insightsOf,
  lastMonthKey,
  minutes,
  monthRange,
  pct,
  pesos,
  recentMonths,
  salesMetrics,
  type SalesMetrics,
} from "../sales";
import { errorOf } from "../shared";

/**
 * Reporte mensual de ventas para mandarle al cliente: una hoja imprimible
 * (o "Guardar como PDF" desde el navegador). Va sin el menú de la consola y
 * siempre en claro, como papel.
 */
export default function MonthlyReport() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const clientId = params.get("cliente");
  const month = /^\d{4}-\d{2}$/.test(params.get("mes") ?? "") ? params.get("mes")! : lastMonthKey();
  const range = useMemo(() => monthRange(month), [month]);
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [m, setM] = useState<SalesMetrics | null>(null);
  const [prev, setPrev] = useState<SalesMetrics | null>(null);
  const [error, setError] = useState("");

  // Papel: el reporte se ve e imprime en claro aunque la consola esté en oscuro.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => {
      if (wasDark) root.classList.add("dark");
    };
  }, []);

  useEffect(() => {
    if (!clientId) return;
    setError("");
    setM(null);
    Promise.all([
      api<ClientSummary>("GET", `/clients/${clientId}`),
      salesMetrics(clientId, range.from, range.to),
      salesMetrics(clientId, range.prevFrom, range.prevTo),
    ])
      .then(([c, now, before]) => {
        setClient(c);
        setM(now);
        setPrev(before);
      })
      .catch((e) => setError(errorOf(e)));
  }, [clientId, range]);

  useEffect(() => {
    if (client) document.title = `Reporte ${range.label} · ${client.name}`;
    return () => {
      document.title = "Axzy Central";
    };
  }, [client, range.label]);

  const setMonth = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("mes", value);
    setParams(next, { replace: true });
  };

  const insights = m ? insightsOf(m) : [];
  const hours = m ? m.byHour.map((b, h) => ({ h, ...b })) : [];
  const business = [...hours.slice(6), ...hours.slice(0, 6)];
  const first = business.findIndex((b) => b.tickets > 0);
  const last = business.length - 1 - [...business].reverse().findIndex((b) => b.tickets > 0);
  const activeHours = first < 0 ? [] : business.slice(Math.max(0, first - 1), Math.min(business.length, last + 2));
  const bestDay = m && m.byDay.length > 0 ? m.byDay.reduce((a, d) => (d.soldCents > a.soldCents ? d : a)) : null;
  const vsPrev = `vs. ${range.prevLabel}`;

  return (
    <div className="min-h-dvh bg-slate-100 py-6 text-slate-900 print:bg-white print:py-0">
      {/* Controles: no salen en la impresión */}
      <div className="mx-auto mb-4 flex max-w-[860px] flex-wrap items-center justify-between gap-2 px-4 print:hidden">
        <ITButton variant="text" color="gray" icon={<LuArrowLeft size={15} />} onClick={() => navigate(clientId ? `/metricas?cliente=${clientId}` : "/metricas")}>
          Volver a métricas
        </ITButton>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Mes
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            >
              {recentMonths(12).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <ITButton icon={<LuPrinter size={15} />} onClick={() => window.print()} disabled={!m || m.tickets === 0}>
            Imprimir o guardar PDF
          </ITButton>
        </div>
      </div>

      <article className="axc-report mx-auto max-w-[860px] rounded-2xl bg-white px-8 py-9 shadow-sm print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        {!clientId ? (
          <Notice>Elige un cliente desde Métricas para armar su reporte.</Notice>
        ) : error ? (
          <Notice>{error}</Notice>
        ) : !m || !client ? (
          <Notice>Armando el reporte…</Notice>
        ) : (
          <>
            <header className="flex items-end justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Reporte mensual de ventas</p>
                <h1 className="mt-1 text-[26px] font-bold tracking-tight">{client.name}</h1>
                <p className="mt-0.5 text-[14px] text-slate-600">
                  {range.label}
                  {range.partial ? " · mes en curso, hasta hoy" : ""}
                </p>
              </div>
              <p className="text-right text-[11px] leading-relaxed text-slate-500">
                Datos de la app de cocina
                <br />
                Generado el {new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </header>

            {m.tickets === 0 ? (
              <Notice>No hay ventas reportadas en {range.label.toLowerCase()}. Elige otro mes.</Notice>
            ) : (
              <>
                <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Kpi label="Vendido" value={pesos(m.soldCents)} hint={<Delta value={change(m.soldCents, prev?.soldCents ?? 0)} suffix={vsPrev} />} />
                  <Kpi label="Cuentas" value={m.tickets.toLocaleString("es-MX")} hint={<Delta value={change(m.tickets, prev?.tickets ?? 0)} suffix={vsPrev} />} />
                  <Kpi
                    label="Ticket promedio"
                    value={pesos(m.averageTicketCents)}
                    hint={<Delta value={change(m.averageTicketCents, prev?.averageTicketCents ?? 0)} suffix={vsPrev} />}
                  />
                  <Kpi label="Por comensal" value={pesos(m.averagePerPersonCents)} hint={`${m.averagePersons.toLocaleString("es-MX")} personas por cuenta`} />
                </section>

                {insights.length > 0 && (
                  <Section title="Lo que dicen los números">
                    <ul className="grid gap-1.5 text-[14px] leading-relaxed text-slate-700">
                      {insights.map((t) => (
                        <li key={t} className="flex gap-2">
                          <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                <Section title="Ventas por día" subtitle={bestDay ? `Mejor día: ${dayText(bestDay.date)} con ${pesos(bestDay.soldCents)}` : undefined}>
                  <BarChart
                    ariaLabel="Ventas por día"
                    format={pesos}
                    height={170}
                    labelEvery={m.byDay.length > 14 ? 5 : 1}
                    data={m.byDay.map((d) => ({
                      key: d.date,
                      label: String(new Date(`${d.date}T12:00:00`).getDate()),
                      value: d.soldCents,
                      title: dayText(d.date),
                      detail: `${d.tickets} cuentas`,
                    }))}
                  />
                </Section>

                <div className="grid gap-x-8 sm:grid-cols-2">
                  <Section title="Hora pico" subtitle="Según la hora en que se abrió la cuenta">
                    <BarChart
                      ariaLabel="Ventas por hora"
                      format={pesos}
                      height={140}
                      labelEvery={activeHours.length > 12 ? 2 : 1}
                      data={activeHours.map((b) => ({
                        key: String(b.h),
                        label: String(b.h),
                        value: b.soldCents,
                        title: `${hourLabel(b.h)} – ${hourLabel((b.h + 1) % 24)}`,
                        detail: `${b.tickets} cuentas`,
                      }))}
                    />
                  </Section>
                  <Section title="Día de la semana" subtitle="Suma de cada día del mes">
                    <BarChart
                      ariaLabel="Ventas por día de la semana"
                      format={pesos}
                      height={140}
                      data={m.byWeekday.map((b, d) => ({
                        key: WEEKDAYS[d],
                        label: WEEKDAYS[d],
                        value: b.soldCents,
                        title: WEEKDAYS_LONG[d],
                        detail: `${b.tickets} cuentas`,
                      }))}
                    />
                  </Section>
                </div>

                <div className="grid gap-x-8 sm:grid-cols-[3fr_2fr]">
                  <Section title="Productos más vendidos" subtitle={`Top ${Math.min(10, m.products.length)} por importe`}>
                    <ShareList
                      format={pesos}
                      rows={m.products.slice(0, 10).map((p) => ({ name: p.name, value: p.soldCents, share: p.share, sub: `${p.qty.toLocaleString("es-MX")} pzas` }))}
                    />
                  </Section>
                  <div>
                    <Section title="Cómo pagan">
                      <SplitBar
                        format={pesos}
                        parts={[
                          { label: "Efectivo", value: m.cashCents, color: "var(--viz-cash)" },
                          { label: "Transferencia", value: m.transferCents, color: "var(--viz-transfer)" },
                        ]}
                      />
                    </Section>
                    <Section title="Cocina">
                      <dl className="grid gap-2 text-[13.5px]">
                        <Row label="Tiempo promedio por orden" value={minutes(m.prepSecondsAvg)} />
                        <Row label="9 de cada 10 salen en" value={minutes(m.prepSecondsP90)} />
                        <Row
                          label="Cuentas canceladas"
                          value={`${m.cancelledTickets} (${pct(m.cancelledTickets / Math.max(1, m.tickets + m.cancelledTickets))})`}
                        />
                      </dl>
                    </Section>
                  </div>
                </div>

                {m.categories.length > 1 && (
                  <Section title="Por categoría">
                    <ShareList
                      format={pesos}
                      rows={m.categories.map((c) => ({ name: c.name, value: c.soldCents, share: c.share, sub: `${c.qty.toLocaleString("es-MX")} pzas` }))}
                    />
                  </Section>
                )}
              </>
            )}
          </>
        )}
      </article>
    </div>
  );
}

const dayText = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" });

function Notice({ children }: { children: ReactNode }) {
  return <p className="py-16 text-center text-[15px] text-slate-500">{children}</p>;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight">{value}</p>
      <div className="mt-0.5 text-[11.5px] text-slate-500">{hint}</div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="mt-7 break-inside-avoid">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[12px] text-slate-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
