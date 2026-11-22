import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ITButton, ITConfirmDialog, ITInput, ITSegmentedControl } from "@axzydev/axzy_ui_system";
import {
  LuAlarmClock,
  LuBanknote,
  LuCalendarClock,
  LuCircleCheck,
  LuClock,
  LuCreditCard,
  LuReceipt,
  LuRefreshCw,
  LuSearch,
  LuX,
} from "react-icons/lu";
import {
  dateText,
  listPayments,
  money,
  paymentConcept,
  periodText,
  runBilling,
  today,
  updatePayment,
  type PaymentKind,
  type PaymentRow,
  type PaymentStatus,
} from "../api";
import { CountUpMoney, KindBadge, PaymentBadge, errorOf, paymentError } from "../shared";
import { useNotify } from "../toast";
import { Card, Empty, Initials, Page, StatCard, TableWrap, Td, Th } from "../ui";

type StatusTab = "" | PaymentStatus;
type KindTab = "" | PaymentKind;
type PillTone = "success" | "primary" | "danger" | "default";

const PILL_CLASSES: Record<PillTone, string> = {
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950",
  primary:
    "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950",
  danger:
    "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950",
  default:
    "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
};

/** Acción compacta de la fila: conciliar un cobro sin salir de la tabla. */
function Pill({
  children,
  onClick,
  tone = "default",
  icon,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: PillTone;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${PILL_CLASSES[tone]}`}
    >
      {icon}
      {children}
    </button>
  );
}

/** `1 cobro` / `4 cobros`: bajada corta para KPIs y resúmenes. */
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
  const [busyId, setBusyId] = useState<string | null>(null);

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

  /** Totales de lo que se está viendo, no de todo el histórico. */
  const filteredSummary = useMemo(() => {
    const pending = filtered.filter((p) => p.status === "PENDING");
    const overdue = pending.filter((p) => p.dueDate < today());
    const sum = (list: PaymentRow[]) => list.reduce((total, p) => total + Number(p.amount), 0);
    return {
      pendingAmount: sum(pending),
      pendingCount: pending.length,
      overdueAmount: sum(overdue),
      overdueCount: overdue.length,
    };
  }, [filtered]);

  const filtersActive = Boolean(search.trim()) || status !== "" || kind !== "";

  const clearFilters = () => {
    setStatus("");
    setKind("");
    setSearch("");
  };

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
    setBusyId(row.id);
    try {
      await updatePayment(row.clientId, row.id, { status: next, ...(method ? { method } : {}) });
      notify(
        next === "PAID"
          ? `Cobro de ${money(row.amount)} de ${row.clientName} marcado como pagado${method ? ` (${method})` : ""}`
          : next === "CANCELLED"
            ? `Cobro de ${row.clientName} cancelado`
            : `Cobro de ${row.clientName} reabierto`
      );
      load();
    } catch (e) {
      notify(paymentError(e), "error");
    } finally {
      setBusyId(null);
    }
  };

  const openDetail = (row: PaymentRow) => navigate(`/clientes/${row.clientId}`);

  const late = (p: PaymentRow) => p.status === "PENDING" && p.dueDate < today();

  const dueCell = (p: PaymentRow) => (
    <span className={late(p) ? "font-semibold text-rose-700 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"}>
      {dateText(p.dueDate)}
      {late(p) && <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">Vencido</span>}
    </span>
  );

  const paidNote = (p: PaymentRow) =>
    p.paidAt ? (
      <span className="mt-0.5 block text-[11.5px] text-slate-500 dark:text-slate-400">
        {dateText(p.paidAt)}
        {p.method ? ` · ${p.method}` : ""}
      </span>
    ) : null;

  const rowActions = (p: PaymentRow) => (
    <div className="flex flex-nowrap items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      {p.status === "PENDING" ? (
        <>
          <Pill
            tone="success"
            icon={<LuBanknote size={12} />}
            title={`Cobrar ${money(p.amount)} en efectivo`}
            disabled={busyId === p.id}
            onClick={() => void mark(p, "PAID", "Efectivo")}
          >
            Efectivo
          </Pill>
          <Pill
            tone="primary"
            icon={<LuCreditCard size={12} />}
            title={`Cobrar ${money(p.amount)} por transferencia`}
            disabled={busyId === p.id}
            onClick={() => void mark(p, "PAID", "Transferencia")}
          >
            Transferencia
          </Pill>
          <Pill
            tone="danger"
            icon={<LuX size={12} />}
            title={`Cancelar el cobro de ${p.clientName}`}
            disabled={busyId === p.id}
            onClick={() => void mark(p, "CANCELLED")}
          >
            Cancelar
          </Pill>
        </>
      ) : (
        <Pill
          tone="default"
          icon={<LuRefreshCw size={12} />}
          title={`Reabrir el cobro de ${p.clientName}`}
          disabled={busyId === p.id}
          onClick={() => void mark(p, "PENDING")}
        >
          Reabrir
        </Pill>
      )}
    </div>
  );

  return (
    <Page
      eyebrow="Cobranza"
      title="Cobros"
      description="Todos los cobros de todos los clientes en una sola tabla: concilia efectivo o transferencia, cancela y revisa lo vencido sin salir de la fila."
      actions={
        <ITButton
          icon={running ? <LuRefreshCw size={14} className="animate-spin" /> : <LuReceipt size={14} />}
          onClick={() => setConfirmRun(true)}
          disabled={running}
        >
          {running ? "Generando…" : "Generar cobros del mes"}
        </ITButton>
      }
      loading={rows === null && !error}
      error={error || null}
      onRetry={load}
    >
      {rows !== null &&
        (rows.length === 0 ? (
          <Empty
            title="Todavía no hay cobros"
            description="Los cobros se registran desde el detalle de cada cliente o generándolos aquí con el plan recurrente."
            action={
              <ITButton icon={<LuReceipt size={14} />} onClick={() => setConfirmRun(true)}>
                Generar cobros del mes
              </ITButton>
            }
          />
        ) : (
          <div className="flex flex-col gap-4 lg:gap-5">
            <div className="axc-stagger grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatCard
                label="Pendiente"
                value={<CountUpMoney value={summary.pendingAmount} />}
                hint={`${count(summary.pendingCount, "cobro", "cobros")} por cobrar`}
                icon={<LuClock size={16} />}
                tone="amber"
              />
              <StatCard
                label="Vencido"
                value={<CountUpMoney value={summary.overdueAmount} />}
                hint={`${count(summary.overdueCount, "cobro", "cobros")} fuera de fecha`}
                icon={<LuAlarmClock size={16} />}
                tone="red"
              />
              <StatCard
                label="Cobrado"
                value={<CountUpMoney value={summary.paidAmount} />}
                hint={`${count(summary.paidCount, "pago", "pagos")} registrados`}
                icon={<LuCircleCheck size={16} />}
                tone="green"
              />
              <StatCard
                label="De este mes"
                value={<CountUpMoney value={summary.monthAmount} />}
                hint={`${count(summary.monthCount, "cobro", "cobros")} con vencimiento este mes`}
                icon={<LuCalendarClock size={16} />}
                tone="teal"
              />
            </div>

            <Card
              title="Cobros registrados"
              subtitle={
                filtered.length === (rows ?? []).length
                  ? `${filtered.length} cobro${filtered.length === 1 ? "" : "s"}`
                  : `${filtered.length} de ${rows.length} cobro${rows.length === 1 ? "" : "s"}`
              }
              actions={
                filtersActive && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  >
                    Limpiar filtros
                  </button>
                )
              }
              bodyClassName="p-0"
              className="axc-rise"
            >
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between xl:px-5">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                  <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
                    <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                      Estado
                    </span>
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
                  <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
                    <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                      Tipo
                    </span>
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
                <div className="w-full xl:w-80">
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
                <Empty
                  title="Sin cobros con esos filtros"
                  description="Cambia el estado o el tipo de cobro, o limpia la búsqueda."
                  action={
                    <ITButton variant="outlined" onClick={clearFilters}>
                      Limpiar filtros
                    </ITButton>
                  }
                />
              ) : (
                <>
                  {/* Tabla full-width (escritorio) */}
                  <div className="hidden lg:block">
                    <TableWrap className="min-w-[1010px]">
                      <thead className="bg-slate-50/80 dark:bg-slate-800/40">
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                          <Th className="pl-4 sm:pl-5">Cliente</Th>
                          <Th>Tipo</Th>
                          <Th>Concepto / periodo</Th>
                          <Th className="text-right">Importe</Th>
                          <Th>Vence</Th>
                          <Th>Estado</Th>
                          <Th className="pr-4 text-right sm:pr-5">Acciones</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((p) => (
                          <tr
                            key={p.id}
                            onClick={() => openDetail(p)}
                            className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/40"
                          >
                            <Td className="pl-4 sm:pl-5">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <Initials name={p.clientName} size="sm" />
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDetail(p);
                                    }}
                                    className="block max-w-[190px] truncate text-left text-[13.5px] font-semibold text-slate-900 transition hover:underline dark:text-white"
                                  >
                                    {p.clientName}
                                  </button>
                                  <p className="max-w-[190px] truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                                    {p.productName}
                                    {p.planName ? ` · ${p.planName}` : ""}
                                  </p>
                                </div>
                              </div>
                            </Td>
                            <Td>
                              <KindBadge kind={p.kind} />
                            </Td>
                            <Td>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-800 dark:text-slate-100">{paymentConcept(p)}</p>
                                <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                                  {p.kind === "RECURRING" ? `Periodo ${periodText(p.period)}` : "Sin periodo"}
                                </p>
                              </div>
                            </Td>
                            <Td className="text-right">
                              <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{money(p.amount)}</span>
                            </Td>
                            <Td>{dueCell(p)}</Td>
                            <Td>
                              <span className="block">
                                <PaymentBadge status={p.status} dueDate={p.dueDate} />
                                {paidNote(p)}
                              </span>
                            </Td>
                            <Td className="pr-4 sm:pr-5">
                              {rowActions(p)}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </TableWrap>
                  </div>

                  {/* Tarjetas (móvil) */}
                  <div className="divide-y divide-slate-100 lg:hidden dark:divide-slate-800">
                    {filtered.map((p) => (
                      <article key={p.id} className="flex flex-col gap-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Initials name={p.clientName} size="sm" />
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => openDetail(p)}
                                className="truncate text-left text-[14px] font-semibold text-slate-900 hover:underline dark:text-white"
                              >
                                {p.clientName}
                              </button>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {p.productName}
                                {p.planName ? ` · ${p.planName}` : ""}
                              </p>
                            </div>
                          </div>
                          <PaymentBadge status={p.status} dueDate={p.dueDate} />
                        </div>

                        <div className="flex flex-wrap items-end justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-slate-800 dark:text-slate-100">
                              <KindBadge kind={p.kind} />
                              {paymentConcept(p)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {p.kind === "RECURRING" ? `Periodo ${periodText(p.period)}` : "Sin periodo"}
                              {paidNote(p)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[20px] font-bold leading-none tabular-nums text-slate-900 dark:text-white">{money(p.amount)}</p>
                            <p className="mt-1 text-xs">{dueCell(p)}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                          {p.status === "PENDING" ? (
                            <>
                              <ITButton
                                size="sm"
                                variant="outlined"
                                color="success"
                                icon={<LuBanknote size={13} />}
                                disabled={busyId === p.id}
                                onClick={() => void mark(p, "PAID", "Efectivo")}
                              >
                                Efectivo
                              </ITButton>
                              <ITButton
                                size="sm"
                                variant="outlined"
                                icon={<LuCreditCard size={13} />}
                                disabled={busyId === p.id}
                                onClick={() => void mark(p, "PAID", "Transferencia")}
                              >
                                Transferencia
                              </ITButton>
                              <ITButton
                                size="sm"
                                variant="text"
                                color="danger"
                                icon={<LuX size={13} />}
                                disabled={busyId === p.id}
                                onClick={() => void mark(p, "CANCELLED")}
                              >
                                Cancelar
                              </ITButton>
                            </>
                          ) : (
                            <ITButton
                              size="sm"
                              variant="outlined"
                              color="gray"
                              icon={<LuRefreshCw size={13} />}
                              disabled={busyId === p.id}
                              onClick={() => void mark(p, "PENDING")}
                            >
                              Reabrir
                            </ITButton>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                      {filtered.length} de {rows.length} cobro{rows.length === 1 ? "" : "s"} en la vista
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11.5px] font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                        <LuClock size={12} />
                        Pendiente {money(filteredSummary.pendingAmount)} · {filteredSummary.pendingCount}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11.5px] font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                        <LuAlarmClock size={12} />
                        Vencido {money(filteredSummary.overdueAmount)} · {filteredSummary.overdueCount}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </Card>
          </div>
        ))}

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
    </Page>
  );
}
