import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ITBentoStatStrip,
  ITButton,
  ITConfirmDialog,
  ITEmptyState,
  ITInput,
  ITPage,
  ITSegmentedControl,
  ITTable,
  ITText,
  type Column,
} from "@axzydev/axzy_ui_system";
import { LuReceipt, LuRefreshCw, LuSearch } from "react-icons/lu";
import {
  dateText,
  listPayments,
  money,
  periodText,
  paymentConcept,
  runBilling,
  today,
  updatePayment,
  type PaymentKind,
  type PaymentRow,
  type PaymentStatus,
} from "../api";
import { CountUpMoney, KindBadge, PaymentBadge, SectionTitle, errorOf, paymentError } from "../shared";
import { useNotify } from "../toast";

type StatusTab = "" | PaymentStatus;
type KindTab = "" | PaymentKind;

/** `1 cobro` / `4 cobros`: la bajada de la tira bento se recorta si es larga. */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function Cobros() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StatusTab>("");
  const [kind, setKind] = useState<KindTab>("");
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);

  const load = useCallback(() => {
    setError("");
    listPayments()
      .then(setRows)
      .catch((e) => setError(errorOf(e)));
  }, []);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (rows ?? []).filter((p) => {
      if (status && p.status !== status) return false;
      if (kind && p.kind !== kind) return false;
      if (!text) return true;
      return [p.clientName, p.productName, p.planName, p.concept, p.period]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text));
    });
  }, [rows, status, kind, search]);

  const summary = useMemo(() => {
    const all = rows ?? [];
    const pending = all.filter((p) => p.status === "PENDING");
    const overdue = pending.filter((p) => p.dueDate < today());
    const paid = all.filter((p) => p.status === "PAID");
    const month = today().slice(0, 7);
    const thisMonth = all.filter((p) => p.dueDate.slice(0, 7) === month);
    const sum = (list: PaymentRow[]) => list.reduce((total, p) => total + Number(p.amount), 0);
    return {
      pendingAmount: sum(pending),
      pendingCount: pending.length,
      overdueAmount: sum(overdue),
      overdueCount: overdue.length,
      paidAmount: sum(paid),
      paidCount: paid.length,
      monthAmount: sum(thisMonth),
      monthCount: thisMonth.length,
    };
  }, [rows]);

  const generate = async () => {
    setConfirmRun(false);
    setRunning(true);
    try {
      const result = await runBilling();
      notify(
        result.created > 0 ? `Cobros generados: ${result.created}. Omitidos: ${result.skipped}.` : `Sin cobros nuevos: ${result.skipped} omitido(s).`,
        result.created > 0 ? "success" : "error"
      );
      load();
    } catch (e) {
      notify(errorOf(e), "error");
    } finally {
      setRunning(false);
    }
  };

  const mark = async (row: PaymentRow, next: PaymentStatus, method?: string) => {
    try {
      await updatePayment(row.clientId, row.id, { status: next, ...(method ? { method } : {}) });
      notify(next === "PAID" ? `Cobro de ${row.clientName} marcado como pagado` : "Cobro actualizado");
      load();
    } catch (e) {
      notify(paymentError(e), "error");
    }
  };

  const columns: Column<PaymentRow>[] = [
    {
      key: "clientName",
      label: "Cliente",
      type: "string",
      width: 210,
      render: (p) => (
        <span className="block">
          <span className="block font-semibold">{p.clientName}</span>
          <span className="block text-xs text-axzy-slate dark:text-axzy-mist">
            {p.productName}
            {p.planName ? ` · ${p.planName}` : ""}
          </span>
        </span>
      ),
    },
    { key: "kind", label: "Tipo", type: "string", width: 108, render: (p) => <KindBadge kind={p.kind} /> },
    {
      key: "concept",
      label: "Concepto / periodo",
      type: "string",
      width: 210,
      render: (p) => (
        <span className="block">
          <span className="block font-medium">{paymentConcept(p)}</span>
          <span className="block text-xs text-axzy-slate dark:text-axzy-mist">
            {p.kind === "RECURRING" ? `Periodo ${periodText(p.period)}` : "Sin periodo"}
          </span>
        </span>
      ),
    },
    {
      key: "amount",
      label: "Importe",
      type: "string",
      width: 96,
      align: "right",
      render: (p) => <span className="font-semibold tabular-nums">{money(p.amount)}</span>,
    },
    {
      key: "dueDate",
      label: "Vence",
      type: "string",
      width: 96,
      render: (p) => {
        const late = p.status === "PENDING" && p.dueDate < today();
        return (
          <span className={late ? "font-semibold text-red-700 dark:text-red-400" : ""}>
            {dateText(p.dueDate)}
            {late && <span className="block text-xs">vencido</span>}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Estado",
      type: "string",
      width: 118,
      render: (p) => (
        <span className="block">
          <PaymentBadge status={p.status} dueDate={p.dueDate} />
          {p.paidAt && (
            <span className="mt-0.5 block text-xs text-axzy-slate dark:text-axzy-mist">
              {dateText(p.paidAt)}
              {p.method ? ` · ${p.method}` : ""}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Acciones",
      type: "actions",
      width: 222,
      align: "right",
      actions: (p) =>
        p.status === "PENDING" ? (
          <span className="inline-flex flex-wrap justify-end gap-1">
            <ITButton size="sm" variant="outlined" onClick={() => void mark(p, "PAID", "Efectivo")}>
              Efectivo
            </ITButton>
            <ITButton size="sm" variant="outlined" onClick={() => void mark(p, "PAID", "Transferencia")}>
              Transferencia
            </ITButton>
            <ITButton size="sm" variant="text" color="gray" onClick={() => void mark(p, "CANCELLED")}>
              Cancelar
            </ITButton>
          </span>
        ) : (
          <ITButton size="sm" variant="text" color="gray" onClick={() => void mark(p, "PENDING")}>
            Reabrir
          </ITButton>
        ),
    },
  ];

  return (
    <ITPage
      title="Cobros"
      description="Todos los cobros de todos los clientes, en un solo lugar."
      icon={<LuReceipt size={20} />}
      loading={rows === null && !error}
      error={error || undefined}
      onRetry={load}
      actions={
        <ITButton
          className="hidden sm:inline-flex"
          variant="outlined"
          icon={running ? <LuRefreshCw size={14} className="animate-spin" /> : <LuReceipt size={14} />}
          onClick={() => setConfirmRun(true)}
          disabled={running}
        >
          {running ? "Generando…" : "Generar cobros del mes"}
        </ITButton>
      }
    >
      {rows && rows.length === 0 ? (
        <ITEmptyState
          icon={<LuReceipt size={32} />}
          title="Todavía no hay cobros"
          description="Los cobros se registran desde el detalle de cada cliente o generándolos desde aquí con el plan recurrente."
          action={<ITButton onClick={() => setConfirmRun(true)}>Generar cobros del mes</ITButton>}
        />
      ) : (
        rows && (
          <div className="flex flex-col gap-5">
            <ITBentoStatStrip
              items={[
                {
                  id: "pending",
                  label: "Pendiente",
                  value: <CountUpMoney value={summary.pendingAmount} />,
                  caption: count(summary.pendingCount, "cobro", "cobros"),
                  color: "var(--color-warning)",
                  tone: "sun",
                },
                {
                  id: "overdue",
                  label: "Vencido",
                  value: <CountUpMoney value={summary.overdueAmount} />,
                  caption: count(summary.overdueCount, "cobro", "cobros"),
                  color: "var(--color-danger)",
                  tone: "lavender",
                },
                {
                  id: "paid",
                  label: "Cobrado",
                  value: <CountUpMoney value={summary.paidAmount} />,
                  caption: count(summary.paidCount, "pago", "pagos"),
                  color: "var(--color-success)",
                  tone: "mint",
                },
                {
                  id: "month",
                  label: "De este mes",
                  value: <CountUpMoney value={summary.monthAmount} />,
                  caption: count(summary.monthCount, "cobro", "cobros"),
                  color: "var(--color-primary)",
                  tone: "sea",
                },
              ]}
            />

            <div className="sm:hidden">
              <ITButton
                variant="outlined"
                className="w-full"
                icon={running ? <LuRefreshCw size={14} className="animate-spin" /> : <LuReceipt size={14} />}
                onClick={() => setConfirmRun(true)}
                disabled={running}
              >
                {running ? "Generando…" : "Generar cobros del mes"}
              </ITButton>
            </div>

            <section aria-labelledby="tabla-cobros">
              <SectionTitle
                id="tabla-cobros"
                eyebrow="Cartera"
                title="Cobros registrados"
                description={filtered.length === (rows ?? []).length ? `${filtered.length} cobro(s)` : `${filtered.length} de ${rows.length} cobro(s)`}
              />

              <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                  <div>
                    <p className="axc-eyebrow mb-1 text-axzy-slate dark:text-axzy-mist">Estado</p>
                    <ITSegmentedControl
                      size="sm"
                      options={[
                        { value: "", label: "Todos" },
                        { value: "PENDING", label: "Pendientes" },
                        { value: "PAID", label: "Pagados" },
                        { value: "CANCELLED", label: "Cancelados" },
                      ]}
                      value={status}
                      onChange={(value) => setStatus(value as StatusTab)}
                    />
                  </div>
                  <div>
                    <p className="axc-eyebrow mb-1 text-axzy-slate dark:text-axzy-mist">Tipo</p>
                    <ITSegmentedControl
                      size="sm"
                      options={[
                        { value: "", label: "Todos" },
                        { value: "RECURRING", label: "Recurrentes" },
                        { value: "ONE_TIME", label: "Únicos" },
                      ]}
                      value={kind}
                      onChange={(value) => setKind(value as KindTab)}
                    />
                  </div>
                </div>
                <div className="w-full xl:w-72">
                  <ITInput
                    name="buscar"
                    size="sm"
                    placeholder="Buscar cliente, producto o concepto"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    iconLeft={<LuSearch size={14} />}
                  />
                </div>
              </div>

              {filtered.length === 0 ? (
                <ITEmptyState
                  icon={<LuSearch size={28} />}
                  title="Sin cobros con esos filtros"
                  description="Cambia el estado o el tipo de cobro, o limpia la búsqueda."
                  action={
                    <ITButton
                      variant="outlined"
                      onClick={() => {
                        setStatus("");
                        setKind("");
                        setSearch("");
                      }}
                    >
                      Limpiar filtros
                    </ITButton>
                  }
                />
              ) : (
                <>
                  <ITTable
                    columns={columns as unknown as Column<Record<string, unknown>>[]}
                    data={filtered as unknown as Record<string, unknown>[]}
                    onRowClick={(row) => navigate(`/clientes/${(row as unknown as PaymentRow).clientId}`)}
                    size="sm"
                    density="compact"
                    layout="fixed"
                    defaultItemsPerPage={25}
                    itemsPerPageOptions={[25, 50, 100]}
                    autoCardBreakpoint={760}
                    renderCard={(row) => {
                      const p = row as unknown as PaymentRow;
                      return (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{p.clientName}</p>
                              <p className="text-xs text-axzy-slate dark:text-axzy-mist">
                                {p.productName}
                                {p.planName ? ` · ${p.planName}` : ""}
                              </p>
                            </div>
                            <PaymentBadge status={p.status} dueDate={p.dueDate} />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <KindBadge kind={p.kind} />
                            <span>{paymentConcept(p)}</span>
                            <span className="font-semibold tabular-nums">{money(p.amount)}</span>
                            <span>vence {dateText(p.dueDate)}</span>
                          </div>
                          {p.status === "PENDING" && (
                            <div className="flex flex-wrap gap-2">
                              <ITButton size="sm" variant="outlined" onClick={() => void mark(p, "PAID", "Efectivo")}>
                                Pagó efectivo
                              </ITButton>
                              <ITButton size="sm" variant="outlined" onClick={() => void mark(p, "PAID", "Transferencia")}>
                                Pagó transferencia
                              </ITButton>
                              <ITButton size="sm" variant="text" color="gray" onClick={() => void mark(p, "CANCELLED")}>
                                Cancelar
                              </ITButton>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <ITText muted className="mt-3 block text-xs">
                    {summary.pendingCount} cobro(s) pendientes por {money(summary.pendingAmount)} · {summary.overdueCount} vencidos por{" "}
                    {money(summary.overdueAmount)}.
                  </ITText>
                </>
              )}
            </section>
          </div>
        )
      )}

      <ITConfirmDialog
        isOpen={confirmRun}
        onClose={() => setConfirmRun(false)}
        onConfirm={() => void generate()}
        title="¿Generar cobros del mes?"
        message="Se crea el siguiente cobro pendiente de cada cliente activo con plan recurrente. Se omiten los que ya tienen un pago pendiente y los planes de pago único."
        confirmLabel="Generar cobros"
        cancelLabel="Cancelar"
        variant="primary"
      />
    </ITPage>
  );
}
