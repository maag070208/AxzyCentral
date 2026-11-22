import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ITBadget, ITButton, ITConfirmDialog, ITSegmentedControl } from "@axzydev/axzy_ui_system";
import {
  LuArrowRight,
  LuArrowUpRight,
  LuBanknote,
  LuChartColumn,
  LuClockAlert,
  LuBoxes,
  LuChevronRight,
  LuCircleAlert,
  LuCircleCheckBig,
  LuPlus,
  LuReceipt,
  LuRefreshCw,
  LuShieldAlert,
  LuUserX,
  LuUsers,
  LuWallet,
} from "react-icons/lu";
import { api, dateText, money, planPrice, runBilling, type ClientSummary, type Product } from "../api";
import { BillingTypeBadge, CountUp, CountUpMoney, StatusBadge, errorOf } from "../shared";
import QuickPayDialog from "../components/QuickPayDialog";
import { BarChart, Delta } from "../components/SalesCharts";
import { change, periodRange, pesos, salesOverview, shortDate, type SalesOverview } from "../sales";
import { Card, Empty, IconAction, Initials, Page, SectionTitle, StatCard, TableWrap, Td, Th } from "../ui";
import { useNotify } from "../toast";

type ClientFilter = "all" | "active" | "overdue";

const FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "overdue", label: "Vencidos" },
];

/** Días de calendario entre hoy y una fecha `AAAA-MM-DD` local. */
const daysUntil = (iso: string) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(`${iso}T00:00:00`);
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
};

const dueHint = (iso: string) => {
  const days = daysUntil(iso);
  if (days < 0) return `Vencido hace ${Math.abs(days)} d`;
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  return `Vence en ${days} días`;
};

/** Bloque de fecha compacto para la lista de próximos vencimientos. */
function DueDateBlock({ iso }: { iso: string }) {
  const date = new Date(`${iso}T12:00:00`);
  return (
    <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 leading-none dark:border-slate-700 dark:bg-slate-800/70">
      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {date.toLocaleDateString("es-MX", { month: "short" })}
      </span>
      <span className="mt-1 text-[13px] font-bold text-slate-900 dark:text-white">{date.getDate()}</span>
    </span>
  );
}

/** Acciones de una fila de la tabla de clientes (Cobrar / Abrir). */
function ClientRowActions({ client, onPay }: { client: ClientSummary; onPay: (client: ClientSummary) => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
      <IconAction label={`Cobrar ${client.name}`} tone="success" onClick={() => onPay(client)}>
        <LuBanknote size={14} />
      </IconAction>
      <IconAction label={`Abrir ${client.name}`} onClick={() => navigate(`/clientes/${client.id}`)}>
        <LuArrowUpRight size={14} />
      </IconAction>
    </div>
  );
}

type AttentionGroup = {
  key: string;
  label: string;
  href: string;
  clients: ClientSummary[];
  badge: "danger" | "warning" | "gray";
  iconClassName: string;
  icon: ReactNode;
};

export default function Home() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [runs, setRuns] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const [payClient, setPayClient] = useState<ClientSummary | null>(null);
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [sales, setSales] = useState<SalesOverview | null>(null);
  const range = useMemo(() => periodRange("30d"), []);

  const load = () => {
    setError("");
    Promise.all([api<ClientSummary[]>("GET", "/clients"), api<Product[]>("GET", "/products")])
      .then(([c, p]) => {
        setClients(c);
        setProducts(p);
      })
      .catch((e) => setError(errorOf(e)));
    // Las ventas son un extra: si fallan, Inicio sigue funcionando.
    salesOverview(range.from, range.to).then(setSales).catch(() => setSales(null));
  };
  useEffect(load, []);

  const stats = useMemo(() => {
    const rows = clients ?? [];
    const active = rows.filter((c) => c.status === "ACTIVE");
    const overdue = rows.filter((c) => c.overdue);
    const recurring = active.filter((c) => c.plan?.billingType === "RECURRING");
    return {
      rows,
      active,
      suspended: rows.filter((c) => c.status === "SUSPENDED"),
      overdue,
      mrr: recurring.reduce((sum, c) => sum + Number(c.plan?.price ?? 0), 0),
      recurringClients: recurring.length,
      attention: rows.filter((c) => c.overdue || c.status === "SUSPENDED" || c.devices.active === 0).length,
    };
  }, [clients]);

  /** Filtro rápido de la tarjeta: máximo 6 filas, primero lo urgente. */
  const visibleClients = useMemo(() => {
    const base = filter === "all" ? stats.rows : filter === "active" ? stats.active : stats.overdue;
    const rank = (client: ClientSummary) => (client.overdue ? 0 : client.status === "SUSPENDED" ? 1 : 2);
    return [...base]
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "es"))
      .slice(0, 6);
  }, [filter, stats]);

  const attentionGroups = useMemo<AttentionGroup[]>(() => {
    const groups: AttentionGroup[] = [
      {
        key: "overdue",
        label: "Pagos vencidos",
        href: "/cobros",
        clients: stats.overdue,
        badge: "danger",
        iconClassName: "text-rose-500 dark:text-rose-400",
        icon: <LuCircleAlert size={13} />,
      },
      {
        key: "licenses",
        label: "Licencias sin activar",
        href: "/clientes",
        clients: stats.rows.filter((c) => c.status === "ACTIVE" && !c.overdue && c.devices.active === 0),
        badge: "warning",
        iconClassName: "text-amber-500 dark:text-amber-400",
        icon: <LuShieldAlert size={13} />,
      },
      {
        key: "suspended",
        label: "Cuentas suspendidas",
        href: "/clientes",
        clients: stats.rows.filter((c) => c.status === "SUSPENDED" && !c.overdue),
        badge: "gray",
        iconClassName: "text-slate-400 dark:text-slate-500",
        icon: <LuUserX size={13} />,
      },
      {
        key: "quiet",
        label: "Sin reportar ventas en 3+ días",
        href: "/metricas",
        clients: stats.rows.filter((c) => {
          const last = sales?.clients.find((s) => s.clientId === c.id)?.lastSaleAt;
          return c.status === "ACTIVE" && !!last && Date.now() - new Date(last).getTime() > 3 * 86_400_000;
        }),
        badge: "warning",
        iconClassName: "text-amber-500 dark:text-amber-400",
        icon: <LuClockAlert size={13} />,
      },
    ];
    return groups.filter((group) => group.clients.length > 0);
  }, [stats, sales]);

  const upcoming = useMemo(() => {
    const rows: { client: ClientSummary; due: string }[] = [];
    for (const client of stats.rows) {
      if (client.nextDueDate) rows.push({ client, due: client.nextDueDate });
    }
    return rows.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  }, [stats]);

  const productStats = useMemo(
    () =>
      products
        .map((product) => {
          const rows = stats.rows.filter((c) => c.product.id === product.id);
          const active = rows.filter((c) => c.status === "ACTIVE");
          const monthly = active.reduce(
            (sum, c) => sum + (c.plan?.billingType === "RECURRING" ? Number(c.plan.price) : 0),
            0
          );
          return { product, total: rows.length, active: active.length, monthly };
        })
        .sort((a, b) => Number(b.product.active) - Number(a.product.active) || b.total - a.total),
    [products, stats]
  );

  const attentionGroupsEmpty = attentionGroups.length === 0;

  const generateDebts = async () => {
    setConfirmRun(false);
    setRuns(true);
    try {
      const result = await runBilling();
      notify(
        result.created > 0
          ? `Cobros generados: ${result.created}. Omitidos: ${result.skipped}.`
          : `Sin cobros nuevos: ${result.skipped} cliente(s) ya estaban al día o no son recurrentes.`,
        result.created > 0 ? "success" : "error"
      );
      load();
    } catch (e) {
      notify(errorOf(e), "error");
    } finally {
      setRuns(false);
    }
  };

  return (
    <Page
      eyebrow="Consola"
      title="Inicio"
      description="Cómo van tus clientes, tus cobros y tus licencias."
      loading={clients === null && !error}
      error={error || null}
      onRetry={load}
      actions={
        <>
          <ITButton
            variant="outlined"
            icon={runs ? <LuRefreshCw size={14} className="animate-spin" /> : <LuReceipt size={14} />}
            onClick={() => setConfirmRun(true)}
            disabled={runs || stats.rows.length === 0}
          >
            {runs ? "Generando…" : "Generar cobros del mes"}
          </ITButton>
          <ITButton icon={<LuPlus size={14} />} onClick={() => navigate("/clientes?nuevo=1")}>
            Nuevo cliente
          </ITButton>
        </>
      }
    >
      {stats.rows.length === 0 ? (
        <Empty
          title="Todavía no tienes clientes"
          description="Da de alta el primero, asígnale un producto y un plan recurrente."
          action={
            <ITButton icon={<LuPlus size={14} />} onClick={() => navigate("/clientes?nuevo=1")}>
              Dar de alta un cliente
            </ITButton>
          }
        />
      ) : (
        <div className="flex flex-col gap-4 lg:gap-5">
          {/* KPIs de la operación */}
          <div className="axc-stagger grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              label="Clientes activos"
              value={<CountUp value={stats.active.length} />}
              hint={`de ${stats.rows.length} en total`}
              icon={<LuUsers size={16} />}
              tone="green"
              onClick={() => navigate("/clientes")}
            />
            <StatCard
              label="Suspendidos"
              value={<CountUp value={stats.suspended.length} />}
              hint={stats.suspended.length === 0 ? "ninguna app bloqueada" : "apps bloqueadas"}
              icon={<LuUserX size={16} />}
              tone="red"
              onClick={() => navigate("/clientes")}
            />
            <StatCard
              label="Con pago vencido"
              value={<CountUp value={stats.overdue.length} />}
              hint={stats.overdue.length === 0 ? "todo al día" : "cobros por revisar"}
              icon={<LuCircleAlert size={16} />}
              tone="amber"
              onClick={() => navigate("/cobros")}
            />
            <StatCard
              label="Ingreso mensual"
              value={<CountUpMoney value={stats.mrr} />}
              hint={`${stats.recurringClients} ${stats.recurringClients === 1 ? "plan recurrente" : "planes recurrentes"}`}
              icon={<LuWallet size={16} />}
              tone="teal"
              onClick={() => navigate("/planes")}
            />
          </div>

          {/* Tabla de clientes + panel de pendientes */}
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:gap-5">
            <div className="flex min-w-0 flex-col gap-4">
            <Card
              title="Clientes"
              subtitle={`${stats.active.length} activos · ${stats.overdue.length} con pago vencido`}
              actions={<ITSegmentedControl options={FILTER_OPTIONS} value={filter} onChange={(value) => setFilter(value as ClientFilter)} size="sm" />}
              bodyClassName="p-0"
            >
              {visibleClients.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Sin clientes en este filtro</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Prueba con otro estado o revisa la lista completa.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className="mt-1 text-xs font-semibold text-sky-700 transition hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200"
                  >
                    Ver todos
                  </button>
                </div>
              ) : (
                <>
                <div className="hidden lg:block">
                <TableWrap className="min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <Th className="pl-4 sm:pl-5">Cliente</Th>
                      <Th>Plan</Th>
                      <Th>Próximo pago</Th>
                      <Th>Estado</Th>
                      <Th className="pr-4 text-right sm:pr-5">Acciones</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleClients.map((client) => (
                      <tr
                        key={client.id}
                        onClick={() => navigate(`/clientes/${client.id}`)}
                        className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/40"
                      >
                        <Td className="pl-4 sm:pl-5">
                          <div className="flex items-center gap-2.5">
                            <Initials name={client.name} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-white">{client.name}</p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {client.product.name}
                                {client.contactName ? ` · ${client.contactName}` : ""}
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          {client.plan ? (
                            <>
                              <p className="font-medium text-slate-800 dark:text-slate-100">{client.plan.name}</p>
                              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                {planPrice(client.plan)}
                                <BillingTypeBadge type={client.plan.billingType} />
                              </span>
                            </>
                          ) : (
                            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Sin plan</span>
                          )}
                        </Td>
                        <Td>
                          {client.nextDueDate ? (
                            <>
                              <span
                                className={
                                  client.overdue
                                    ? "font-semibold text-rose-600 dark:text-rose-400"
                                    : "text-slate-700 dark:text-slate-200"
                                }
                              >
                                {dateText(client.nextDueDate)}
                              </span>
                              {client.overdue && (
                                <span className="block text-[11px] font-medium text-rose-500 dark:text-rose-400">Vencido</span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">—</span>
                          )}
                        </Td>
                        <Td>
                          <StatusBadge status={client.status} />
                        </Td>
                        <Td className="pr-4 sm:pr-5">
                          <div className="flex justify-end">
                            <ClientRowActions client={client} onPay={setPayClient} />
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
                </div>

                {/* Móvil: mismas filas en tarjetas */}
                <div className="divide-y divide-slate-100 lg:hidden dark:divide-slate-800">
                  {visibleClients.map((client) => (
                    <div key={client.id} className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Initials name={client.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{client.name}</p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {client.product.name}
                            {client.plan ? ` · ${client.plan.name}` : ""}
                          </p>
                        </div>
                        <StatusBadge status={client.status} />
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 pl-[46px]">
                        <p
                          className={`text-xs ${
                            client.overdue
                              ? "font-semibold text-rose-600 dark:text-rose-400"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {client.nextDueDate ? `Próximo pago ${dateText(client.nextDueDate)}` : "Sin próximo pago"}
                        </p>
                        <ClientRowActions client={client} onPay={setPayClient} />
                      </div>
                    </div>
                  ))}
                </div>
                </>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:px-5 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {visibleClients.length} de {stats.rows.length} cliente(s)
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/clientes")}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 transition hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200"
                >
                  Ver todos los clientes <LuArrowRight size={13} />
                </button>
              </div>
            </Card>

            {/* Ventas que reportan las apps de los clientes */}
            <Card
              title="Ventas de tus clientes"
              subtitle={sales ? `Últimos 30 días · ${shortDate(sales.from)} – ${shortDate(sales.to)}` : "Lo que reportan sus apps"}
              actions={
                <ITButton size="sm" variant="text" color="gray" onClick={() => navigate("/metricas")}>
                  <span className="inline-flex items-center gap-1">
                    Ver métricas <LuArrowRight size={13} />
                  </span>
                </ITButton>
              }
            >
              {!sales || sales.tickets === 0 ? (
                <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-slate-200 px-3 py-4 dark:border-slate-700">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                    <LuChartColumn size={16} />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Aún no hay ventas reportadas</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Las apps de cocina (1.1.0 o más nueva) mandan cada cuenta cerrada cuando tienen internet.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-1">
                      <p className="text-[28px] font-bold leading-none tracking-tight text-slate-900 dark:text-white">{pesos(sales.soldCents)}</p>
                      <p className="text-xs">
                        <Delta value={change(sales.soldCents, sales.previousSoldCents)} suffix="vs. 30 días anteriores" />
                      </p>
                    </div>
                    <BarChart
                      ariaLabel="Ventas de todos los clientes por día"
                      format={pesos}
                      height={140}
                      labelEvery={5}
                      data={sales.byDay.map((d) => ({
                        key: d.date,
                        label: String(new Date(`${d.date}T12:00:00`).getDate()),
                        value: d.soldCents,
                        title: new Date(`${d.date}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" }),
                        detail: `${d.tickets} cuentas`,
                      }))}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      Quién vende más
                    </p>
                    <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                      {sales.clients.slice(0, 5).map((s) => {
                        const c = stats.rows.find((r) => r.id === s.clientId);
                        return (
                          <li key={s.clientId}>
                            <button
                              type="button"
                              onClick={() => navigate(`/metricas?cliente=${s.clientId}`)}
                              className="flex w-full items-center gap-2.5 rounded-lg px-1 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            >
                              <Initials name={c?.name ?? "?"} size="sm" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium text-slate-900 dark:text-white">{c?.name ?? "Cliente"}</span>
                                <span className="block truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                                  {s.tickets.toLocaleString("es-MX")} cuentas · ticket {pesos(s.averageTicketCents)}
                                </span>
                              </span>
                              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-slate-900 dark:text-white">{pesos(s.soldCents)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </Card>
          </div>

            <div className="flex min-w-0 flex-col gap-4">
              {/* Pendientes en tres grupos */}
              <Card
                title="Requieren atención"
                subtitle={
                  attentionGroupsEmpty
                    ? "Todo en orden"
                    : (() => {
                        const n = new Set(attentionGroups.flatMap((g) => g.clients.map((c) => c.id))).size;
                        return `${n} ${n === 1 ? "cliente por revisar" : "clientes por revisar"}`;
                      })()
                }
                bodyClassName="p-2 sm:p-2.5"
              >
                {attentionGroupsEmpty ? (
                  <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-slate-200 px-3 py-4 dark:border-slate-700">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <LuCircleCheckBig size={16} />
                    </span>
                    <div>
                      <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Todo en orden</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Sin pagos vencidos, licencias sin activar, cuentas suspendidas ni apps calladas.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {attentionGroups.map((group) => {
                      const shown = group.clients.slice(0, 3);
                      const rest = group.clients.length - shown.length;
                      return (
                        <div key={group.key} className="min-w-0">
                          <button
                            type="button"
                            onClick={() => navigate(group.href)}
                            className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          >
                            <span className={`shrink-0 ${group.iconClassName}`}>{group.icon}</span>
                            <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                              {group.label}
                            </span>
                            <ITBadget color={group.badge} label={String(group.clients.length)} size="sm" variant="outlined" />
                          </button>
                          {shown.map((client) => (
                            <button
                              key={client.id}
                              type="button"
                              onClick={() => navigate(`/clientes/${client.id}`)}
                              className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            >
                              <Initials name={client.name} size="sm" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium text-slate-900 dark:text-white">
                                  {client.name}
                                </span>
                                <span className="block truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                                  {client.product.name} · {client.plan?.name ?? "Sin plan"}
                                </span>
                              </span>
                              <LuChevronRight size={14} className="shrink-0 text-slate-300 dark:text-slate-600" />
                            </button>
                          ))}
                          {rest > 0 && (
                            <button
                              type="button"
                              onClick={() => navigate(group.href)}
                              className="px-1.5 py-1 text-[11.5px] font-medium text-sky-700 transition hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200"
                            >
                              y {rest} más
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Próximos cobros por fecha */}
              <Card
                title="Próximos vencimientos"
                subtitle={upcoming.length > 0 ? "Los cobros más cercanos de tu cartera" : undefined}
                bodyClassName="p-0"
                actions={
                  <ITButton size="sm" variant="text" color="gray" onClick={() => navigate("/cobros")}>
                    <span className="inline-flex items-center gap-1">
                      Ver cobros <LuArrowRight size={13} />
                    </span>
                  </ITButton>
                }
              >
                {upcoming.length === 0 ? (
                  <div className="px-4 py-5 text-center sm:px-5">
                    <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Sin vencimientos próximos</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Todos tus clientes están al día.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {upcoming.map(({ client, due }) => (
                      <li key={client.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/clientes/${client.id}`)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40 sm:px-5"
                        >
                          <DueDateBlock iso={due} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold text-slate-900 dark:text-white">
                              {client.name}
                            </span>
                            <span
                              className={`block truncate text-xs ${
                                daysUntil(due) < 0
                                  ? "font-medium text-rose-600 dark:text-rose-400"
                                  : "text-slate-500 dark:text-slate-400"
                              }`}
                            >
                              {dueHint(due)} · {client.product.name}
                            </span>
                          </span>
                          <LuChevronRight size={15} className="shrink-0 text-slate-300 dark:text-slate-600" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>

          {/* Resumen por producto a todo lo ancho */}
          <section aria-label="Resumen por producto" className="flex flex-col gap-3">
            <SectionTitle
              eyebrow="Portafolio"
              title="Por producto"
              description="Clientes activos y monto recurrente de cada producto."
              action={
                <ITButton size="sm" variant="text" color="gray" onClick={() => navigate("/productos")}>
                  <span className="inline-flex items-center gap-1">
                    Ver productos <LuArrowRight size={13} />
                  </span>
                </ITButton>
              }
            />
            {productStats.length === 0 ? (
              <Empty
                title="Sin productos"
                description="Da de alta un producto para poder venderlo."
                action={<ITButton onClick={() => navigate("/productos")}>Ir a productos</ITButton>}
              />
            ) : (
              <div className="axc-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(250px,1fr))]">
                {productStats.map(({ product, total, active, monthly }) => {
                  const pct = total > 0 ? Math.round((active / total) * 100) : 0;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => navigate(`/clientes?producto=${product.id}`)}
                      className="group flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_28px_-20px_rgba(16,24,40,0.4)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                          <LuBoxes size={16} />
                        </span>
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
                          {product.key}
                        </span>
                      </div>
                      <p className="mt-3 truncate text-[15px] font-semibold text-slate-900 dark:text-white">{product.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {active} de {total} clientes activos
                      </p>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-sky-500 dark:bg-sky-400" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-2">
                        <p className="text-[17px] font-bold leading-none tracking-tight text-slate-900 dark:text-white">
                          {money(monthly)}
                          <span className="ml-1 text-[11px] font-normal text-slate-500 dark:text-slate-400">/mes</span>
                        </p>
                        {!product.active && <ITBadget color="gray" label="Inactivo" size="sm" variant="outlined" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      <QuickPayDialog
        isOpen={payClient !== null}
        clientId={payClient?.id ?? null}
        clientName={payClient?.name}
        onClose={() => setPayClient(null)}
        onChanged={load}
      />

      <ITConfirmDialog
        isOpen={confirmRun}
        onClose={() => setConfirmRun(false)}
        onConfirm={() => void generateDebts()}
        title="¿Generar cobros del mes?"
        message="Se crea el siguiente cobro pendiente de cada cliente activo con plan recurrente. Se omiten los que ya tienen un pago pendiente y los planes de pago único."
        confirmLabel="Generar cobros"
        cancelLabel="Cancelar"
        variant="primary"
      />
    </Page>
  );
}
