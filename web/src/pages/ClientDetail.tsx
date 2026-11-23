import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ITBadget,
  ITButton,
  ITConfirmDialog,
  ITDatePicker,
  ITDialog,
  ITInput,
  ITSelect,
  ITSegmentedControl,
} from "@axzydev/axzy_ui_system";
import {
  LuBanknote,
  LuCreditCard,
  LuMessageCircle,
  LuPause,
  LuPencil,
  LuPlay,
  LuPlus,
  LuQrCode,
  LuRefreshCw,
  LuRotateCcw,
  LuShieldOff,
  LuUtensils,
  LuWallet,
  LuX,
} from "react-icons/lu";
import {
  agoText,
  api,
  createPayment,
  dateText,
  generatePayment,
  money,
  paymentConcept,
  periodText,
  planLimits,
  planPrice,
  setDeviceActive,
  today,
  updatePayment,
  type ClientDetail as Detail,
  type Device,
  type PaymentKind,
  type PaymentStatus,
  type Plan,
} from "../api";
import { useNotify } from "../toast";
import {
  BillingTypeBadge,
  CountUpMoney,
  KindBadge,
  PaymentBadge,
  StatusBadge,
  errorOf,
  isoDate,
  paymentError,
} from "../shared";
import { Card, Empty, IconAction, Initials, Page, TableWrap, Td, Th } from "../ui";
import ClientUsersCard from "../components/ClientUsersCard";
import AppErrorsCard from "../components/AppErrorsCard";
import QrActivationDialog from "../components/QrActivationDialog";
import QuickPayDialog from "../components/QuickPayDialog";

type Run = (fn: () => Promise<unknown>, ok?: string, mapErr?: (e: unknown) => string) => Promise<boolean>;

/**
 * Detalle del cliente con el lenguaje de la consola: acciones en el header,
 * cobros y licencias en la columna principal y un panel sticky de resumen,
 * ficha editable y atajos.
 */
export default function ClientDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const [client, setClient] = useState<Detail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDevice, setQrDevice] = useState<Device | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const detail = await api<Detail>("GET", `/clients/${id}`);
      setClient(detail);
      try {
        setPlans(await api<Plan[]>("GET", `/plans?productId=${detail.product.id}`));
      } catch {
        // La ficha sigue usable sin el catálogo de planes; el alta manual no depende de él.
        setPlans([]);
      }
    } catch (e) {
      setError(errorOf(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Corre una acción; si devuelve el cliente actualizado lo pinta, si no, recarga. */
  const run: Run = async (fn, ok, mapErr = errorOf) => {
    try {
      const next = await fn();
      if (next && typeof next === "object" && "payments" in next) setClient(next as Detail);
      else await load();
      if (ok) notify(ok);
      return true;
    } catch (e) {
      notify(mapErr(e), "error");
      return false;
    }
  };

  const suspended = client?.status === "SUSPENDED";
  const pending = (client?.payments ?? []).filter((p) => p.status === "PENDING");
  const pendingAmount = pending.reduce((sum, p) => sum + Number(p.amount), 0);

  const generateNext = async () => {
    if (!client) return;
    setGenerating(true);
    await run(() => generatePayment(client.id), "Siguiente cobro generado", paymentError);
    setGenerating(false);
  };

  const openNewQr = () => {
    setQrDevice(null);
    setQrOpen(true);
  };
  const openDeviceQr = (device: Device) => {
    setQrDevice(device);
    setQrOpen(true);
  };

  const copyWhatsapp = async () => {
    if (!client?.phone) return;
    const digits = client.phone.replace(/\D/g, "");
    if (!digits) {
      notify("El teléfono del cliente no es válido", "error");
      return;
    }
    const phone = digits.length === 10 ? `52${digits}` : digits;
    const planText = client.plan ? ` ${client.plan.name}` : "";
    const balance =
      pendingAmount > 0
        ? `Te recuerdo que tienes un saldo pendiente de ${money(pendingAmount)}.`
        : "Estás al corriente.";
    const text = `Hola ${client.name}, te escribo de Axzy sobre tu servicio${planText}. ${balance}`;
    try {
      await navigator.clipboard.writeText(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`);
      notify("Enlace de WhatsApp copiado");
    } catch {
      notify("No se pudo copiar el enlace de WhatsApp", "error");
    }
  };

  return (
    <Page
      eyebrow="Cliente"
      title={
        client ? (
          <span className="inline-flex min-w-0 items-center gap-3">
            <Initials name={client.name} />
            <span className="truncate">{client.name}</span>
          </span>
        ) : (
          "Cliente"
        )
      }
      description={client ? `${client.product.name} · ${client.plan?.name ?? "sin plan"}` : undefined}
      back={{ label: "Clientes", onClick: () => navigate("/clientes") }}
      loading={!client && !error}
      error={error || null}
      onRetry={load}
      actions={
        client && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={client.status} />
            <ITButton icon={<LuWallet size={15} />} onClick={() => setQuickOpen(true)}>
              Cobrar
            </ITButton>
            <ITButton
              variant="outlined"
              icon={<LuRefreshCw size={15} />}
              onClick={() => void generateNext()}
              disabled={generating || !client.plan}
              title={!client.plan ? "Asigna un plan al cliente para generar cobros" : undefined}
            >
              {generating ? "Generando…" : "Generar cobro"}
            </ITButton>
            <ITButton variant="outlined" icon={<LuQrCode size={15} />} onClick={openNewQr}>
              Generar QR
            </ITButton>
            <ITButton variant="outlined" icon={<LuUtensils size={15} />} onClick={() => navigate(`/clientes/${client.id}/menu`)}>
              Menú
            </ITButton>
            <ITButton variant="outlined" icon={<LuPencil size={15} />} onClick={() => setEditOpen(true)}>
              Editar
            </ITButton>
            <ITButton
              color={suspended ? "primary" : "danger"}
              variant={suspended ? "filled" : "outlined"}
              icon={suspended ? <LuPlay size={15} /> : <LuPause size={15} />}
              onClick={() => setConfirmStatus(true)}
            >
              {suspended ? "Reactivar" : "Suspender"}
            </ITButton>
          </div>
        )
      }
    >
      {client && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="flex min-w-0 flex-col gap-5">
            <PaymentsCard
              client={client}
              run={run}
              generating={generating}
              onGenerate={() => void generateNext()}
              onAdd={() => setAddOpen(true)}
            />
            <DevicesCard client={client} run={run} onNewQr={openNewQr} onRotateQr={openDeviceQr} />
            <AppErrorsCard clientId={client.id} />
            <ClientUsersCard client={client} />
          </div>

          <aside className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-6">
            <SummaryCard client={client} onEdit={() => setEditOpen(true)} onWhatsapp={() => void copyWhatsapp()} />
          </aside>
        </div>
      )}

      <QuickPayDialog
        isOpen={quickOpen}
        clientId={client?.id ?? null}
        clientName={client?.name}
        onClose={() => setQuickOpen(false)}
        onChanged={() => void load()}
      />

      {client && (
        <QrActivationDialog
          isOpen={qrOpen}
          onClose={() => setQrOpen(false)}
          client={client}
          device={qrDevice}
          onIssued={async () => {
            await run(() => api("GET", `/clients/${client.id}`));
          }}
        />
      )}

      {client && addOpen && <NewPaymentDialog client={client} run={run} onClose={() => setAddOpen(false)} />}

      {client && (
        <EditClientDialog client={client} plans={plans} run={run} isOpen={editOpen} onClose={() => setEditOpen(false)} />
      )}

      {client && (
        <ITConfirmDialog
          isOpen={confirmStatus}
          onClose={() => setConfirmStatus(false)}
          onConfirm={async () => {
            setConfirmStatus(false);
            await run(
              () => api("PATCH", `/clients/${client.id}`, { status: suspended ? "ACTIVE" : "SUSPENDED" }),
              suspended ? `${client.name} reactivado` : `${client.name} suspendido`
            );
          }}
          title={suspended ? `¿Reactivar ${client.name}?` : `¿Suspender ${client.name}?`}
          message={
            suspended
              ? "Sus apps se desbloquean en cuanto se conecten a internet."
              : "Sus apps se bloquean en cuanto se conecten a internet. Sus datos no se borran."
          }
          confirmLabel={suspended ? "Reactivar" : "Suspender"}
          cancelLabel="Cancelar"
          variant={suspended ? "primary" : "danger"}
        />
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Resumen                                                             */
/* ------------------------------------------------------------------ */

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="shrink-0 text-[12.5px] text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] font-medium text-slate-800 dark:text-slate-100">{children}</dd>
    </div>
  );
}

function SummaryCard({ client, onEdit, onWhatsapp }: { client: Detail; onEdit: () => void; onWhatsapp: () => void }) {
  const pending = client.payments.filter((p) => p.status === "PENDING");
  const pendingAmount = pending.reduce((sum, p) => sum + Number(p.amount), 0);
  const activeDevices = client.devices.filter((d) => d.active).length;
  const tone = client.overdue ? "danger" : pending.length > 0 ? "warning" : "success";
  const label = client.overdue ? "Vencido" : pending.length > 0 ? "Pendiente" : "Al corriente";

  return (
    <Card
      title="Resumen"
      subtitle="Estado, plan y cobro"
      actions={
        <div className="flex items-center gap-1">
          <IconAction label="Copiar enlace de WhatsApp" onClick={onWhatsapp} disabled={!client.phone}>
            <LuMessageCircle size={14} />
          </IconAction>
          <IconAction label="Editar datos del cliente" onClick={onEdit}>
            <LuPencil size={14} />
          </IconAction>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="axc-eyebrow text-slate-400 dark:text-slate-500">Saldo pendiente</p>
          <p className="mt-1 text-[30px] font-bold leading-none tracking-tight text-slate-900 tabular-nums dark:text-white">
            <CountUpMoney value={pendingAmount} />
          </p>
        </div>
        <ITBadget color={tone} label={label} size="sm" />
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {pending.length > 0 ? `${pending.length} cobro(s) por cobrar` : "Sin cobros pendientes"}
      </p>

      <dl className="mt-4 flex flex-col divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
        <SummaryRow label="Estado">
          <StatusBadge status={client.status} />
        </SummaryRow>
        <SummaryRow label="Plan">
          {client.plan ? (
            <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
              <span>{client.plan.name}</span>
              <BillingTypeBadge type={client.plan.billingType} />
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">Sin plan</span>
          )}
        </SummaryRow>
        <SummaryRow label="Precio">{client.plan ? planPrice(client.plan) : "—"}</SummaryRow>
        <SummaryRow label="Próximo pago">
          <span className={client.overdue ? "font-semibold text-rose-600 dark:text-rose-400" : ""}>
            {client.nextDueDate ? dateText(client.nextDueDate) : "Al corriente"}
          </span>
        </SummaryRow>
        <SummaryRow label="Licencias activas">
          {activeDevices} de {client.devices.length}
        </SummaryRow>
        <SummaryRow label="Contacto">{client.contactName || "—"}</SummaryRow>
        <SummaryRow label="Teléfono">{client.phone || "—"}</SummaryRow>
        <SummaryRow label="Correo">{client.email || "—"}</SummaryRow>
        <SummaryRow label="Última conexión">{agoText(client.lastSeenAt)}</SummaryRow>
      </dl>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Cobros                                                              */
/* ------------------------------------------------------------------ */

function PaymentsCard({
  client,
  run,
  generating,
  onGenerate,
  onAdd,
}: {
  client: Detail;
  run: Run;
  generating: boolean;
  onGenerate: () => void;
  onAdd: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = client.payments.filter((p) => p.status === "PENDING");
  const paid = client.payments.filter((p) => p.status === "PAID");
  const pendingTotal = pending.reduce((sum, p) => sum + Number(p.amount), 0);
  const paidTotal = paid.reduce((sum, p) => sum + Number(p.amount), 0);

  const changeStatus = async (paymentId: string, status: PaymentStatus, method?: string) => {
    setBusyId(paymentId);
    await run(
      () => updatePayment(client.id, paymentId, { status, ...(method ? { method } : {}) }),
      "Cobro actualizado",
      paymentError
    );
    setBusyId(null);
  };

  const paymentActions = (paymentId: string, status: PaymentStatus) =>
    status === "PENDING" ? (
      <>
        <IconAction label="Pagó en efectivo" tone="success" disabled={busyId !== null} onClick={() => void changeStatus(paymentId, "PAID", "Efectivo")}>
          <LuBanknote size={15} />
        </IconAction>
        <IconAction
          label="Pagó por transferencia"
          tone="primary"
          disabled={busyId !== null}
          onClick={() => void changeStatus(paymentId, "PAID", "Transferencia")}
        >
          <LuCreditCard size={15} />
        </IconAction>
        <IconAction label="Cancelar cobro" tone="danger" disabled={busyId !== null} onClick={() => void changeStatus(paymentId, "CANCELLED")}>
          <LuX size={15} />
        </IconAction>
      </>
    ) : (
      <IconAction label="Reabrir cobro" disabled={busyId !== null} onClick={() => void changeStatus(paymentId, "PENDING")}>
        <LuRotateCcw size={15} />
      </IconAction>
    );

  return (
    <Card
      title="Cobros"
      subtitle="Registro de cobros del cliente"
      actions={
        <>
          <ITButton
            size="sm"
            variant="outlined"
            icon={<LuRefreshCw size={13} />}
            onClick={onGenerate}
            disabled={generating || !client.plan}
            title={!client.plan ? "Asigna un plan al cliente para generar cobros" : undefined}
          >
            {generating ? "Generando…" : "Generar siguiente"}
          </ITButton>
          <ITButton size="sm" icon={<LuPlus size={13} />} onClick={onAdd}>
            Agregar cobro
          </ITButton>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span className="text-slate-500 dark:text-slate-400">Pendiente</span>
          <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{money(pendingTotal)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-slate-500 dark:text-slate-400">Cobrado</span>
          <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{money(paidTotal)}</span>
        </span>
        <span className={client.overdue ? "font-medium text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}>
          {client.overdue ? "Hay cobros vencidos" : "Sin vencidos"}
        </span>
        {!client.plan && <span className="text-slate-400 dark:text-slate-500">Sin plan: los cobros manuales siguen disponibles.</span>}
      </div>

      {client.payments.length === 0 ? (
        <Empty
          title="Sin cobros registrados"
          description="Genera el siguiente cobro según el plan del cliente o agrega uno manual."
          action={
            <ITButton size="sm" icon={<LuPlus size={13} />} onClick={onAdd}>
              Agregar cobro
            </ITButton>
          }
        />
      ) : (
        <>
          {/* Escritorio: tabla full-width con acciones en la fila. */}
          <div className="hidden lg:block">
            <TableWrap className="min-w-[680px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <Th>Concepto / periodo</Th>
                  <Th>
                    <span className="block text-right">Importe</span>
                  </Th>
                  <Th>Vence</Th>
                  <Th>Estado</Th>
                  <Th>
                    <span className="block text-right">Acciones</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {client.payments.map((p) => {
                  const late = p.status === "PENDING" && p.dueDate < today();
                  return (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <Td>
                        <span className="block font-medium text-slate-900 dark:text-white">{p.concept ?? paymentConcept(p)}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <KindBadge kind={p.kind} />
                          {p.concept && <span>{p.kind === "RECURRING" ? `Periodo ${periodText(p.period)}` : "Pago único"}</span>}
                        </span>
                      </Td>
                      <Td>
                        <span className="block text-right font-semibold text-slate-900 tabular-nums dark:text-white">{money(p.amount)}</span>
                      </Td>
                      <Td>
                        <span className={late ? "font-semibold text-rose-600 dark:text-rose-400" : ""}>{dateText(p.dueDate)}</span>
                      </Td>
                      <Td>
                        <PaymentBadge status={p.status} dueDate={p.dueDate} />
                        {p.status === "PAID" && (
                          <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                            {dateText(p.paidAt)}
                            {p.method ? ` · ${p.method}` : ""}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span className="inline-flex w-full justify-end gap-1">{paymentActions(p.id, p.status)}</span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          </div>

          {/* Móvil: mismas acciones en tarjetas. */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {client.payments.map((p) => {
              const late = p.status === "PENDING" && p.dueDate < today();
              return (
                <li key={p.id} className="rounded-xl border border-slate-200/80 p-3.5 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{p.concept ?? paymentConcept(p)}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <KindBadge kind={p.kind} />
                        {p.concept && <span>{p.kind === "RECURRING" ? periodText(p.period) : "Pago único"}</span>}
                      </p>
                    </div>
                    <PaymentBadge status={p.status} dueDate={p.dueDate} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-base font-bold text-slate-900 tabular-nums dark:text-white">{money(p.amount)}</span>
                    <span className={`text-xs ${late ? "font-semibold text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>
                      Vence {dateText(p.dueDate)}
                    </span>
                  </div>
                  {p.status === "PAID" && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {p.paidAt ? `Pagado ${dateText(p.paidAt)}` : "Pagado"}
                      {p.method ? ` · ${p.method}` : ""}
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {p.status === "PENDING" ? (
                      <>
                        <ITButton
                          size="sm"
                          variant="outlined"
                          color="success"
                          icon={<LuBanknote size={13} />}
                          disabled={busyId !== null}
                          onClick={() => void changeStatus(p.id, "PAID", "Efectivo")}
                        >
                          Efectivo
                        </ITButton>
                        <ITButton
                          size="sm"
                          variant="outlined"
                          icon={<LuCreditCard size={13} />}
                          disabled={busyId !== null}
                          onClick={() => void changeStatus(p.id, "PAID", "Transferencia")}
                        >
                          Transferencia
                        </ITButton>
                        <ITButton
                          size="sm"
                          variant="text"
                          color="gray"
                          disabled={busyId !== null}
                          onClick={() => void changeStatus(p.id, "CANCELLED")}
                        >
                          Cancelar
                        </ITButton>
                      </>
                    ) : (
                      <ITButton size="sm" variant="text" color="gray" disabled={busyId !== null} onClick={() => void changeStatus(p.id, "PENDING")}>
                        Reabrir
                      </ITButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

function NewPaymentDialog({ client, run, onClose }: { client: Detail; run: Run; onClose: () => void }) {
  const [kind, setKind] = useState<PaymentKind>("RECURRING");
  const [amount, setAmount] = useState(client.plan ? String(Number(client.plan.price)) : "");
  const [concept, setConcept] = useState(client.plan?.name ?? "");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState<Date>(new Date());
  const [busy, setBusy] = useState(false);
  const dueIso = isoDate(due);
  const period = dueIso.slice(0, 7);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body =
      kind === "RECURRING"
        ? {
            kind,
            period,
            amount: Number(amount),
            dueDate: dueIso,
            concept: concept.trim() || null,
            notes: notes.trim() || null,
          }
        : {
            kind,
            amount: Number(amount),
            dueDate: dueIso,
            concept: concept.trim() || "Pago único",
            notes: notes.trim() || null,
          };
    const ok = await run(() => createPayment(client.id, body), "Cobro agregado", paymentError);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <ITDialog isOpen onClose={onClose} title="Agregar cobro" className="w-[min(94vw,560px)] max-h-[92dvh] overflow-y-auto">
      <form onSubmit={create} className="flex flex-col gap-4" noValidate>
        <div>
          <p className="axc-eyebrow mb-2 text-slate-400 dark:text-slate-500">Tipo de cobro</p>
          <ITSegmentedControl
            size="sm"
            options={[
              { value: "RECURRING", label: "Recurrente (mensual)" },
              { value: "ONE_TIME", label: "Único" },
            ]}
            value={kind}
            onChange={(value) => setKind(value as PaymentKind)}
          />
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {kind === "RECURRING"
              ? `Se registrará el periodo ${period} (uno por mes y cliente).`
              : "Cargo único sin periodo; por ejemplo, instalación y capacitación."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ITDatePicker
            name="dueDate"
            label="Vence"
            value={due}
            onChange={(e) => {
              const value = e.target.value;
              if (value instanceof Date) setDue(value);
            }}
          />
          <ITInput
            name="amount"
            type="number"
            label="Importe (MXN)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <div className="sm:col-span-2">
            <ITInput
              name="concept"
              label={kind === "RECURRING" ? "Concepto (opcional)" : "Concepto"}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder={kind === "RECURRING" ? "Mensualidad" : "Instalación y capacitación"}
            />
          </div>
          <div className="sm:col-span-2">
            <ITInput name="notes" label="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <ITButton type="button" variant="text" color="gray" onClick={onClose}>
            Cancelar
          </ITButton>
          <ITButton type="submit" disabled={busy || !(Number(amount) > 0)}>
            {busy ? "Guardando…" : "Agregar cobro"}
          </ITButton>
        </div>
      </form>
    </ITDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Licencias                                                           */
/* ------------------------------------------------------------------ */

function DeviceStatus({ device }: { device: Device }) {
  if (!device.active) return <ITBadget color="gray" label="Revocada" size="sm" />;
  if (device.activatedAt) return <ITBadget color="success" label="Activada" size="sm" />;
  return <ITBadget color="warning" label="Sin activar" size="sm" />;
}

function DevicesCard({
  client,
  run,
  onNewQr,
  onRotateQr,
}: {
  client: Detail;
  run: Run;
  onNewQr: () => void;
  onRotateQr: (device: Device) => void;
}) {
  const [revoking, setRevoking] = useState<Device | null>(null);

  return (
    <Card
      title="Licencias"
      subtitle={
        client.plan
          ? `${client.devices.filter((d) => d.active).length}${client.plan.maxKitchens != null ? ` de ${client.plan.maxKitchens}` : ""} activas · el plan incluye ${planLimits(client.plan)}`
          : "Cada tablet se activa una vez escaneando un QR."
      }
      actions={
        <ITButton size="sm" variant="outlined" icon={<LuQrCode size={14} />} onClick={onNewQr}>
          Nuevo QR
        </ITButton>
      }
    >
      {client.devices.length === 0 ? (
        <Empty
          title="Todavía no hay licencias"
          description="Genera el primer QR y escanéalo desde la tablet de cocina."
          action={
            <ITButton size="sm" icon={<LuQrCode size={14} />} onClick={onNewQr}>
              Generar primer QR
            </ITButton>
          }
        />
      ) : (
        <>
          <div className="hidden lg:block">
            <TableWrap className="min-w-[620px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <Th>Dispositivo</Th>
                  <Th>Activación</Th>
                  <Th>Última conexión</Th>
                  <Th>Estado</Th>
                  <Th>
                    <span className="block text-right">Acciones</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {client.devices.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <Td>
                      <span className="block font-medium text-slate-900 dark:text-white">{d.name}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">Modelo: {d.model ?? "sin registrar"}</span>
                    </Td>
                    <Td>
                      {d.activatedAt ? (
                        dateText(d.activatedAt)
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">Sin activar</span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-slate-500 dark:text-slate-400">
                        {agoText(d.lastSeenAt)}
                        {d.appVersion ? ` · v${d.appVersion}` : ""}
                      </span>
                    </Td>
                    <Td>
                      <DeviceStatus device={d} />
                    </Td>
                    <Td>
                      <span className="inline-flex w-full justify-end gap-1">
                        <IconAction label={`Nuevo QR para ${d.name}`} onClick={() => onRotateQr(d)}>
                          <LuQrCode size={15} />
                        </IconAction>
                        {d.active ? (
                          <IconAction label={`Revocar ${d.name}`} tone="danger" onClick={() => setRevoking(d)}>
                            <LuShieldOff size={15} />
                          </IconAction>
                        ) : (
                          <IconAction
                            label={`Reactivar ${d.name}`}
                            tone="success"
                            onClick={() => void run(() => setDeviceActive(client.id, d.id, true), "Licencia reactivada")}
                          >
                            <LuRefreshCw size={15} />
                          </IconAction>
                        )}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>

          <ul className="flex flex-col gap-2 lg:hidden">
            {client.devices.map((d) => (
              <li key={d.id} className="rounded-xl border border-slate-200/80 p-3.5 dark:border-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{d.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Modelo: {d.model ?? "sin registrar"}</p>
                  </div>
                  <DeviceStatus device={d} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>{d.activatedAt ? `Activada el ${dateText(d.activatedAt)}` : "Aún sin primera activación"}</span>
                  <span>Última conexión: {agoText(d.lastSeenAt)}</span>
                  {d.appVersion && <span>App v{d.appVersion}</span>}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <ITButton size="sm" variant="outlined" icon={<LuQrCode size={13} />} onClick={() => onRotateQr(d)}>
                    Nuevo QR
                  </ITButton>
                  {d.active ? (
                    <ITButton size="sm" variant="text" color="danger" icon={<LuShieldOff size={13} />} onClick={() => setRevoking(d)}>
                      Revocar
                    </ITButton>
                  ) : (
                    <ITButton
                      size="sm"
                      variant="text"
                      icon={<LuRefreshCw size={13} />}
                      onClick={() => void run(() => setDeviceActive(client.id, d.id, true), "Licencia reactivada")}
                    >
                      Reactivar
                    </ITButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <ITConfirmDialog
        isOpen={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          const device = revoking;
          setRevoking(null);
          if (device) await run(() => setDeviceActive(client.id, device.id, false), "Licencia revocada");
        }}
        title={`¿Revocar ${revoking?.name ?? ""}?`}
        message="Esa app se bloquea en cuanto se conecte a internet. Puedes reactivarla o generarle un QR nuevo después."
        confirmLabel="Revocar"
        cancelLabel="Cancelar"
        variant="danger"
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Datos y plan                                                        */
/* ------------------------------------------------------------------ */

function EditClientDialog({
  client,
  plans,
  run,
  isOpen,
  onClose,
}: {
  client: Detail;
  plans: Plan[];
  run: Run;
  isOpen: boolean;
  onClose: () => void;
}) {
  const initial = {
    name: client.name,
    contactName: client.contactName ?? "",
    phone: client.phone ?? "",
    email: client.email ?? "",
    notes: client.notes ?? "",
    planId: client.plan?.id ?? "",
  };
  const [form, setForm] = useState(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const options = plans.filter((p) => p.active || p.id === client.plan?.id);
  const selected = options.find((p) => p.id === form.planId) ?? null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api("PATCH", `/clients/${client.id}`, { ...form, planId: form.planId || null }), "Cambios guardados");
    if (ok) onClose();
  };

  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title="Datos y plan" className="w-[min(94vw,660px)]">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <ITInput name="name" label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
        </div>
        <ITInput name="contactName" label="Contacto" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
        <ITInput name="phone" label="Teléfono (WhatsApp)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <div className="sm:col-span-2">
          <ITInput name="email" type="email" label="Correo" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <ITSelect
            name="planId"
            label={`Plan de ${client.product.name}`}
            placeholder="Sin plan"
            value={form.planId}
            options={[
              { value: "", label: "Sin plan" },
              ...options.map((p) => ({
                value: p.id,
                label: `${p.name} · ${planPrice(p)}${p.active ? "" : " (dado de baja)"}`,
              })),
            ]}
            onChange={(e) => setForm({ ...form, planId: e.target.value })}
          />
          {selected && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <BillingTypeBadge type={selected.billingType} />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {selected.billingType === "RECURRING"
                  ? "Se cobra cada mes; la Central genera el siguiente cobro."
                  : "Se cobra una sola vez como cargo inicial del producto."}
              </span>
            </div>
          )}
        </div>
        <div className="sm:col-span-2">
          <ITInput
            name="notes"
            type="textarea"
            rows={2}
            label="Notas"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3 sm:col-span-2 dark:border-slate-800">
          <span className="text-xs text-slate-400 dark:text-slate-500">{dirty ? "Cambios sin guardar" : "Todo guardado"}</span>
          <div className="flex gap-2">
            <ITButton type="button" variant="outlined" color="gray" onClick={onClose}>
              Cancelar
            </ITButton>
            <ITButton type="submit" disabled={!dirty || form.name.trim().length < 2}>
              Guardar cambios
            </ITButton>
          </div>
        </div>
      </form>
    </ITDialog>
  );
}
