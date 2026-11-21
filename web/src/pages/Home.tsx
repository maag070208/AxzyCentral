import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ITBentoFeed,
  ITBentoGrid,
  ITBentoPill,
  ITBentoPillRow,
  ITBentoStatStrip,
  ITBentoTile,
  ITButton,
  ITConfirmDialog,
  ITEmptyState,
  ITPage,
  ITText,
} from "@axzydev/axzy_ui_system";
import {
  LuArrowRight,
  LuBoxes,
  LuCircleAlert,
  LuLayoutDashboard,
  LuPlus,
  LuReceipt,
  LuRefreshCw,
  LuShieldAlert,
  LuTriangleAlert,
  LuUserCheck,
  LuUserX,
  LuWallet,
  LuZap,
} from "react-icons/lu";
import {
  api,
  dateText,
  money,
  runBilling,
  type ClientSummary,
  type Product,
} from "../api";
import { CountUp, CountUpMoney, SectionTitle, errorOf } from "../shared";
import { useNotify } from "../toast";

const TONES = ["mint", "lavender", "sun", "plain"] as const;

/** Entrada del hilo de actividad (forma que espera `ITBentoFeed`). */
type FeedItem = {
  id: string;
  icon?: React.ReactNode;
  title: string;
  meta?: string;
  tone?: "success" | "violet" | "neutral";
  href?: string;
};

export default function Home() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [runs, setRuns] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);

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
    const withPlan = active.filter((c) => c.plan);
    const recurring = withPlan.filter((c) => c.plan?.billingType === "RECURRING");
    const oneTimeActive = withPlan.filter((c) => c.plan?.billingType === "ONE_TIME").length;
    return {
      rows,
      active,
      suspended: rows.length - active.length,
      overdue: rows.filter((c) => c.overdue),
      mrr: recurring.reduce((sum, c) => sum + Number(c.plan?.price ?? 0), 0),
      recurringClients: recurring.length,
      oneTimeActive,
      planned: withPlan.length,
    };
  }, [clients]);

  const attention = useMemo(
    () => stats.rows.filter((c) => c.overdue || c.status === "SUSPENDED" || c.devices.active === 0),
    [stats.rows]
  );

  const feedGroups = useMemo(() => {
    const groups: { key: string; label: string; items: FeedItem[] }[] = [];
    const push = (key: string, label: string, items: ClientSummary[], tone: FeedItem["tone"], icon: React.ReactNode) => {
      if (items.length === 0) return;
      groups.push({
        key,
        label,
        items: items.map((c) => ({
          id: c.id,
          icon,
          title: c.name,
          meta: `${c.product.name} · ${c.plan?.name ?? "sin plan"}`,
          tone,
          href: `/clientes/${c.id}`,
        })),
      });
    };
    push("overdue", "Pagos vencidos", stats.overdue, "neutral", <LuCircleAlert size={13} />);
    push(
      "licenses",
      "Licencias sin activar",
      stats.rows.filter((c) => c.status === "ACTIVE" && c.devices.active === 0 && !c.overdue),
      "violet",
      <LuShieldAlert size={13} />
    );
    push(
      "suspended",
      "Cuentas suspendidas",
      stats.rows.filter((c) => c.status === "SUSPENDED" && !c.overdue),
      "neutral",
      <LuUserX size={13} />
    );
    return groups;
  }, [stats]);

  const activeProducts = products.filter((p) => p.active);
  const productCols = activeProducts.length <= 1 ? 12 : activeProducts.length === 2 ? 6 : 4;

  const nextDue = useMemo(() => {
    const withDue = stats.rows
      .filter((c) => c.nextDueDate)
      .sort((a, b) => (a.nextDueDate ?? "").localeCompare(b.nextDueDate ?? ""));
    return withDue[0] ?? null;
  }, [stats.rows]);

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

  const stripItems = [
    {
      id: "active",
      label: "Clientes activos",
      value: <CountUp value={stats.active.length} />,
      caption: `de ${stats.rows.length}`,
      color: "var(--color-success)",
      tone: "mint" as const,
    },
    {
      id: "suspended",
      label: "Suspendidos",
      value: <CountUp value={stats.suspended} />,
      caption: "apps bloqueadas",
      color: "var(--color-danger)",
      tone: "lavender" as const,
    },
    {
      id: "overdue",
      label: "Con pago vencido",
      value: <CountUp value={stats.overdue.length} />,
      caption: "por cobrar",
      color: "var(--color-warning)",
      tone: "sun" as const,
    },
    {
      id: "mrr",
      label: "Ingreso mensual",
      value: <CountUpMoney value={stats.mrr} />,
      caption: "MRR",
      color: "var(--color-primary)",
      tone: "sea" as const,
    },
  ];

  return (
    <ITPage
      title="Inicio"
      description="Cómo van tus clientes, tus cobros y tus licencias."
      icon={<LuLayoutDashboard size={20} />}
      loading={clients === null && !error}
      error={error || undefined}
      onRetry={load}
      actions={
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <ITButton
            variant="outlined"
            icon={runs ? <LuRefreshCw size={14} className="animate-spin" /> : <LuReceipt size={14} />}
            onClick={() => setConfirmRun(true)}
            disabled={runs || !clients?.length}
          >
            {runs ? "Generando…" : "Generar cobros del mes"}
          </ITButton>
          <ITButton icon={<LuPlus size={14} />} onClick={() => navigate("/clientes?nuevo=1")}>
            Nuevo cliente
          </ITButton>
        </div>
      }
    >
      {clients && clients.length === 0 ? (
        <ITEmptyState
          title="Todavía no tienes clientes"
          description="Da de alta el primero y asígnale un producto y un plan."
          action={<ITButton onClick={() => navigate("/clientes?nuevo=1")}>Dar de alta un cliente</ITButton>}
        />
      ) : (
        <div className="flex flex-col gap-7">
          <ITBentoStatStrip
            items={stripItems}
            onSelect={(id) => {
              if (id === "mrr") navigate("/planes");
              else if (id === "overdue") navigate("/cobros");
              else navigate("/clientes");
            }}
          />

          <section aria-labelledby="por-producto">
            <SectionTitle
              id="por-producto"
              eyebrow="01 — Por producto"
              title="Productos"
              description="Clientes activos y monto mensual de cada producto."
              action={
                activeProducts.length > 0 && (
                  <ITButton size="sm" variant="text" color="gray" onClick={() => navigate("/productos")}>
                    <span className="inline-flex items-center gap-1">
                      Ver productos <LuArrowRight size={13} />
                    </span>
                  </ITButton>
                )
              }
            />
            {activeProducts.length === 0 ? (
              <ITEmptyState
                icon={<LuBoxes size={28} />}
                title="Sin productos activos"
                description="Da de alta un producto para poder venderlo."
                action={<ITButton onClick={() => navigate("/productos")}>Ir a productos</ITButton>}
              />
            ) : (
              <ITBentoGrid className="axc-stagger">
                {activeProducts.map((p, i) => {
                  const rows = stats.rows.filter((c) => c.product.id === p.id);
                  const active = rows.filter((c) => c.status === "ACTIVE");
                  const monthly = active.reduce(
                    (sum, c) => sum + (c.plan?.billingType === "RECURRING" ? Number(c.plan.price) : 0),
                    0
                  );
                  const tileTone = TONES[i % TONES.length];
                  return (
                    <ITBentoTile
                      key={p.id}
                      cols={productCols}
                      rows={2}
                      tone={tileTone}
                      icon={<LuBoxes size={15} />}
                      label={p.name}
                      value={<CountUp value={active.length} />}
                      caption={`de ${rows.length} · ${money(monthly)}/mes`}
                      onClick={() => navigate(`/clientes?producto=${p.id}`)}
                    >
                      <ITBentoPillRow className="mt-2">
                        <ITBentoPill>{p.key}</ITBentoPill>
                        <ITBentoPill dot="var(--color-success)">
                          {rows.length - active.length} suspendido{rows.length - active.length === 1 ? "" : "s"}
                        </ITBentoPill>
                      </ITBentoPillRow>
                    </ITBentoTile>
                  );
                })}
              </ITBentoGrid>
            )}
          </section>

          <section aria-labelledby="requieren-atencion">
            <SectionTitle
              id="requieren-atencion"
              eyebrow="02 — Pendientes"
              title="Requieren atención"
              description="Pagos vencidos, licencias sin activar y cuentas suspendidas."
            />
            <ITBentoGrid className="axc-stagger">
              <ITBentoTile
                cols={8}
                rows={3}
                icon={<LuTriangleAlert size={15} />}
                label="Clientes con algo pendiente"
                value={<CountUp value={attention.length} />}
                caption={attention.length === 0 ? "todo en orden" : "por revisar"}
              >
                <div className="mt-2 min-h-0 flex-1">
                  {feedGroups.length === 0 ? (
                    <div className="flex h-full min-h-24 flex-col items-center justify-center gap-1 rounded-2xl bg-[color-mix(in_srgb,currentColor_5%,transparent)] p-4 text-center">
                      <LuUserCheck size={22} className="text-[color:var(--color-success)]" aria-hidden />
                      <p className="text-sm font-semibold">Todo en orden</p>
                      <p className="text-xs" style={{ color: "var(--it-bento-muted)" }}>
                        Sin pagos vencidos ni licencias sin activar.
                      </p>
                    </div>
                  ) : (
                    <ITBentoFeed
                      groups={feedGroups}
                      maxHeight={224}
                      onItemClick={(item) => navigate(item.href ?? `/clientes/${item.id}`)}
                    />
                  )}
                </div>
              </ITBentoTile>

              <ITBentoTile cols={4} rows={3} icon={<LuZap size={15} />} label="Acciones rápidas">
                <div className="mt-3 flex flex-1 flex-col gap-2">
                  <ITButton
                    variant="outlined"
                    icon={<LuPlus size={14} />}
                    onClick={() => navigate("/clientes?nuevo=1")}
                    className="w-full justify-start"
                  >
                    Nuevo cliente
                  </ITButton>
                  <ITButton
                    variant="outlined"
                    icon={runs ? <LuRefreshCw size={14} className="animate-spin" /> : <LuReceipt size={14} />}
                    onClick={() => setConfirmRun(true)}
                    disabled={runs}
                    className="w-full justify-start"
                  >
                    {runs ? "Generando cobros…" : "Generar cobros del mes"}
                  </ITButton>
                  <ITButton
                    variant="outlined"
                    color="gray"
                    icon={<LuWallet size={14} />}
                    onClick={() => navigate("/cobros")}
                    className="w-full justify-start"
                  >
                    Revisar cobros
                  </ITButton>
                  <ITText muted className="mt-auto text-xs">
                    {stats.oneTimeActive > 0
                      ? `${stats.oneTimeActive} cliente(s) con plan de pago único: ya tienen su cargo inicial.`
                      : "Los cobros del mes se generan solo para planes recurrentes sin pago pendiente."}
                  </ITText>
                </div>
              </ITBentoTile>
            </ITBentoGrid>
          </section>

          <section aria-label="Resumen de cartera">
            <ITBentoGrid className="axc-stagger">
              <ITBentoTile
                cols={4}
                rows={2}
                tone="plain"
                icon={<LuUserCheck size={15} />}
                label="Clientes con plan"
                value={<CountUp value={stats.planned} />}
                caption={stats.active.length > 0 ? `${Math.round((stats.planned / stats.active.length) * 100)}% de los activos` : "sin activos"}
              />
              <ITBentoTile
                cols={4}
                rows={2}
                icon={<LuReceipt size={15} />}
                label="Planes recurrentes"
                value={<CountUp value={stats.recurringClients} />}
                caption={`${money(stats.mrr)} al mes`}
                onClick={() => navigate("/planes")}
              />
              <ITBentoTile
                cols={4}
                rows={2}
                icon={<LuCircleAlert size={15} />}
                label="Próximo vencimiento"
                value={<span className="text-[22px]">{nextDue ? dateText(nextDue.nextDueDate) : "—"}</span>}
                caption={nextDue ? nextDue.name : "Sin cobros pendientes"}
                onClick={() => navigate("/cobros")}
              />
            </ITBentoGrid>
          </section>
        </div>
      )}

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
    </ITPage>
  );
}
