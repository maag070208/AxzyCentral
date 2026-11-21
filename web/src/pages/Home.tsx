import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ITButton, ITCard, ITEmptyState, ITPage, ITStatCard, ITText } from "@axzydev/axzy_ui_system";
import { LuCircleAlert, LuLayoutDashboard, LuPlus, LuUserCheck, LuUserX, LuWallet } from "react-icons/lu";
import { agoText, api, dateText, money, type ClientSummary, type Product } from "../api";
import { Eyebrow, StatusBadge, errorOf } from "../shared";

export default function Home() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    Promise.all([api<ClientSummary[]>("GET", "/clients"), api<Product[]>("GET", "/products")])
      .then(([c, p]) => {
        setClients(c);
        setProducts(p);
      })
      .catch((e) => setError(errorOf(e)));
  };
  useEffect(load, []);

  const stats = useMemo(() => {
    const rows = clients ?? [];
    const active = rows.filter((c) => c.status === "ACTIVE");
    return {
      active: active.length,
      suspended: rows.length - active.length,
      overdue: rows.filter((c) => c.overdue).length,
      monthly: active.reduce((sum, c) => sum + Number(c.plan?.monthlyPrice ?? 0), 0),
      attention: rows.filter((c) => c.overdue || (c.status === "ACTIVE" && c.devices.active === 0)),
    };
  }, [clients]);

  return (
    <ITPage
      title="Inicio"
      description="Cómo van tus clientes en todos tus productos."
      icon={<LuLayoutDashboard size={20} />}
      loading={clients === null && !error}
      error={error || undefined}
      onRetry={load}
      actions={<ITButton icon={<LuPlus size={14} />} onClick={() => navigate("/clientes?nuevo=1")}>Nuevo cliente</ITButton>}
    >
      {clients && clients.length === 0 ? (
        <ITEmptyState
          title="Todavía no tienes clientes"
          description="Da de alta el primero y asígnale un producto y un plan."
          action={<ITButton onClick={() => navigate("/clientes?nuevo=1")}>Dar de alta un cliente</ITButton>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ITStatCard label="Clientes activos" value={stats.active} icon={<LuUserCheck size={18} />} />
            <ITStatCard label="Suspendidos" value={stats.suspended} icon={<LuUserX size={18} />} />
            <ITStatCard label="Con pago vencido" value={stats.overdue} icon={<LuCircleAlert size={18} />} />
            <ITStatCard label="Ingreso mensual" value={money(stats.monthly)} hint="Planes de clientes activos" icon={<LuWallet size={18} />} />
          </div>

          <section aria-labelledby="por-producto">
            <Eyebrow>01 — Por producto</Eyebrow>
            <h2 id="por-producto" className="mt-1 mb-3 text-xl font-bold tracking-tight">Productos</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {products.filter((p) => p.active).map((p) => {
                const rows = (clients ?? []).filter((c) => c.product.id === p.id);
                const active = rows.filter((c) => c.status === "ACTIVE");
                return (
                  <ITCard key={p.id} title={p.name} onClick={() => navigate(`/clientes?producto=${p.id}`)}>
                    <p className="font-mono text-xs text-axzy-slate dark:text-axzy-mist">{p.key}</p>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <div>
                        <p className="text-3xl font-bold tabular-nums">{active.length}</p>
                        <ITText muted className="text-sm">activos de {rows.length}</ITText>
                      </div>
                      <p className="text-right font-semibold tabular-nums">
                        {money(active.reduce((s, c) => s + Number(c.plan?.monthlyPrice ?? 0), 0))}
                        <span className="block text-xs font-normal text-axzy-slate dark:text-axzy-mist">al mes</span>
                      </p>
                    </div>
                  </ITCard>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="atencion">
            <Eyebrow>02 — Pendientes</Eyebrow>
            <h2 id="atencion" className="mt-1 mb-3 text-xl font-bold tracking-tight">Requieren atención</h2>
            {stats.attention.length === 0 ? (
              <ITCard><ITText muted>Todo en orden: sin pagos vencidos ni licencias sin activar.</ITText></ITCard>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-[14px] border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {stats.attention.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/clientes/${c.id}`)}
                      className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary-700 dark:hover:bg-slate-800"
                    >
                      <span className="min-w-40 flex-1">
                        <span className="block font-semibold">{c.name}</span>
                        <span className="block text-xs text-axzy-slate dark:text-axzy-mist">{c.product.name}</span>
                      </span>
                      <StatusBadge status={c.status} />
                      <span className="text-sm">
                        {c.overdue ? (
                          <span className="font-semibold text-red-700 dark:text-red-400">Pago vencido desde {dateText(c.nextDueDate)}</span>
                        ) : (
                          <span className="text-amber-800 dark:text-amber-400">Licencia sin activar</span>
                        )}
                      </span>
                      <span className="w-full text-xs text-axzy-slate sm:w-auto dark:text-axzy-mist">Última conexión: {agoText(c.lastSeenAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </ITPage>
  );
}
