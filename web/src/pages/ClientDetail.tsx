import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ITAlert,
  ITBadget,
  ITBentoPill,
  ITBentoPillRow,
  ITBentoStatStrip,
  ITButton,
  ITCard,
  ITConfirmDialog,
  ITDatePicker,
  ITInput,
  ITPage,
  ITSelect,
  ITSegmentedControl,
  ITTable,
  ITText,
  type Column,
} from "@axzydev/axzy_ui_system";
import {
  LuKeyRound,
  LuPause,
  LuPlay,
  LuPlus,
  LuQrCode,
  LuRefreshCw,
  LuShieldOff,
  LuUser,
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
  planPrice,
  setDeviceActive,
  today,
  updatePayment,
  type ClientDetail as Detail,
  type Device,
  type Payment,
  type PaymentKind,
  type Plan,
} from "../api";
import { useNotify } from "../toast";
import {
  BillingTypeBadge,
  CountUp,
  KindBadge,
  PaymentBadge,
  SectionTitle,
  StatusBadge,
  errorOf,
  isoDate,
  paymentError,
} from "../shared";
import QrActivationDialog from "../components/QrActivationDialog";

type Run = (fn: () => Promise<unknown>, ok?: string, mapErr?: (e: unknown) => string) => Promise<boolean>;

export default function ClientDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const [client, setClient] = useState<Detail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [confirmStatus, setConfirmStatus] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await api<Detail>("GET", `/clients/${id}`);
      setClient(detail);
      setPlans(await api<Plan[]>("GET", `/plans?productId=${detail.product.id}`));
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
  const activeDevices = (client?.devices ?? []).filter((d) => d.active);

  return (
    <ITPage
      title={client?.name ?? "Cliente"}
      description={client ? `${client.product.name} · ${client.plan?.name ?? "sin plan"}` : undefined}
      icon={<LuUser size={20} />}
      backAction={() => navigate("/clientes")}
      loading={!client && !error}
      error={error || undefined}
      onRetry={load}
      actions={
        client && (
          <div className="flex items-center gap-3">
            <StatusBadge status={client.status} />
            <ITButton
              color={suspended ? "primary" : "danger"}
              variant={suspended ? "filled" : "outlined"}
              icon={suspended ? <LuPlay size={14} /> : <LuPause size={14} />}
              onClick={() => setConfirmStatus(true)}
            >
              {suspended ? "Reactivar" : "Suspender"}
            </ITButton>
          </div>
        )
      }
    >
      {client && (
        <div className="flex flex-col gap-7">
          <ITBentoStatStrip
            items={[
              {
                id: "plan",
                label: "Plan actual",
                value: client.plan?.name ?? "Sin plan",
                caption: client.plan ? planPrice(client.plan) : "asígnale uno abajo",
                color: "var(--color-primary)",
                tone: "plain",
              },
              {
                id: "licenses",
                label: "Licencias",
                value: (
                  <span className="whitespace-nowrap">
                    <CountUp value={activeDevices.length} />/{client.devices.length}
                  </span>
                ),
                caption: activeDevices.length === 0 ? "sin activar" : `última: ${agoText(client.lastSeenAt)}`,
                color: "var(--color-success)",
                tone: activeDevices.length === 0 ? "sun" : "mint",
              },
              {
                id: "next",
                label: "Próximo pago",
                value: (
                  <span className="whitespace-nowrap text-[22px]">
                    {client.nextDueDate ? dateText(client.nextDueDate) : "Al corriente"}
                  </span>
                ),
                caption: client.overdue ? "vencido" : pending.length > 0 ? `${pending.length} pendiente(s)` : "sin pendientes",
                color: client.overdue ? "var(--color-danger)" : "var(--color-warning)",
                tone: client.overdue ? "sun" : "lavender",
              },
              {
                id: "pending",
                label: "Por cobrar",
                value: money(pendingAmount),
                caption: `${pending.length} pendiente(s)`,
                color: "var(--color-info)",
                tone: "sea",
              },
            ]}
          />

          <div className="grid gap-5 xl:grid-cols-2">
            <InfoCard key={client.plan?.id ?? "none"} client={client} plans={plans} run={run} />
            <DevicesCard client={client} run={run} />
          </div>

          <PaymentsCard client={client} run={run} />
        </div>
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
    </ITPage>
  );
}

function InfoCard({ client, plans, run }: { client: Detail; plans: Plan[]; run: Run }) {
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
    await run(() => api("PATCH", `/clients/${client.id}`, { ...form, planId: form.planId || null }), "Cambios guardados");
  };

  return (
    <ITCard title="Datos y plan" tone="ternary">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <ITInput name="name" label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
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
              <ITText muted className="text-xs">
                {selected.billingType === "RECURRING"
                  ? "Se cobra cada mes; la Central genera el siguiente cobro."
                  : "Se cobra una sola vez como cargo inicial del producto."}
              </ITText>
            </div>
          )}
        </div>
        <div className="sm:col-span-2">
          <ITInput name="notes" type="textarea" rows={2} label="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex justify-end sm:col-span-2">
          <ITButton type="submit" disabled={!dirty || form.name.trim().length < 2}>
            Guardar cambios
          </ITButton>
        </div>
      </form>
    </ITCard>
  );
}

function DevicesCard({ client, run }: { client: Detail; run: Run }) {
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDevice, setQrDevice] = useState<Device | null>(null);
  const [revoking, setRevoking] = useState<Device | null>(null);

  const openNew = () => {
    setQrDevice(null);
    setQrOpen(true);
  };
  const openRotate = (device: Device) => {
    setQrDevice(device);
    setQrOpen(true);
  };

  return (
    <ITCard
      title="Licencias"
      headerActions={
        <ITButton size="sm" icon={<LuQrCode size={14} />} onClick={openNew}>
          Generar QR de activación
        </ITButton>
      }
    >
      <ITText muted className="mb-4 block text-sm">
        Cada tablet se activa una sola vez escaneando un QR con la app de Cocina. Después, la app pregunta si la cuenta
        sigue activa al conectarse.
      </ITText>

      {client.devices.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-[var(--it-bento-control-bg,#f1f5f9)] p-4">
          <ITText muted className="text-sm">
            Todavía no hay licencias. Genera el primer QR y escanéalo desde la tablet de cocina.
          </ITText>
          <ITButton size="sm" variant="outlined" icon={<LuQrCode size={14} />} onClick={openNew}>
            Generar primer QR
          </ITButton>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {client.devices.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <LuKeyRound aria-hidden className="text-axzy-deep dark:text-axzy-teal" />
                <p className="min-w-32 flex-1 font-semibold">
                  {d.name} {!d.active && <ITBadget color="gray" label="Revocada" size="sm" />}
                  {d.active && d.activatedAt && <ITBadget color="success" label="Activada" size="sm" />}
                </p>
                <ITButton size="sm" variant="outlined" icon={<LuQrCode size={13} />} onClick={() => openRotate(d)}>
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
              <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6 text-xs text-axzy-slate dark:text-axzy-mist">
                <span>Modelo: {d.model ?? "sin registrar"}</span>
                <span>{d.activatedAt ? `Activada el ${dateText(d.activatedAt)}` : "Aún sin primera activación"}</span>
                <span>Última conexión: {agoText(d.lastSeenAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <QrActivationDialog
        isOpen={qrOpen}
        onClose={() => setQrOpen(false)}
        client={client}
        device={qrDevice}
        onIssued={() => {
          void run(() => api("GET", `/clients/${client.id}`));
        }}
      />

      <ITConfirmDialog
        isOpen={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          const d = revoking;
          setRevoking(null);
          if (d) await run(() => setDeviceActive(client.id, d.id, false), "Licencia revocada");
        }}
        title={`¿Revocar ${revoking?.name ?? ""}?`}
        message="Esa app se bloquea en cuanto se conecte a internet. Puedes reactivarla o generarle un QR nuevo después."
        confirmLabel="Revocar"
        cancelLabel="Cancelar"
        variant="danger"
      />
    </ITCard>
  );
}

const PAYMENT_LABEL = { PENDING: "Pendiente", PAID: "Pagado", CANCELLED: "Cancelado" } as const;

function PaymentsCard({ client, run }: { client: Detail; run: Run }) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<PaymentKind>("RECURRING");
  const [amount, setAmount] = useState(client.plan ? String(Number(client.plan.price)) : "");
  const [concept, setConcept] = useState(client.plan?.name ?? "");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState<Date>(new Date());
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const dueIso = isoDate(due);
  const period = dueIso.slice(0, 7);

  // Si cambia el plan (o el cliente), el importe sugerido sigue al plan nuevo.
  useEffect(() => {
    setAmount(client.plan ? String(Number(client.plan.price)) : "");
    setConcept(client.plan?.name ?? "");
  }, [client.plan?.id, client.plan?.price, client.plan?.name]);

  const resetForm = () => {
    setAdding(false);
    setKind("RECURRING");
    setNotes("");
    setDue(new Date());
    setAmount(client.plan ? String(Number(client.plan.price)) : "");
    setConcept(client.plan?.name ?? "");
  };

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
    if (ok) resetForm();
  };

  const generateNext = async () => {
    setGenerating(true);
    const ok = await run(() => generatePayment(client.id), "Siguiente cobro generado", paymentError);
    setGenerating(false);
    if (ok) setAdding(false);
  };

  const changeStatus = (paymentId: string, status: "PENDING" | "PAID" | "CANCELLED", method?: string) =>
    void run(() => updatePayment(client.id, paymentId, { status, ...(method ? { method } : {}) }), "Cobro actualizado", paymentError);

  const pending = client.payments.filter((p) => p.status === "PENDING");
  const paid = client.payments.filter((p) => p.status === "PAID");
  const pendingTotal = pending.reduce((s, p) => s + Number(p.amount), 0);
  const paidTotal = paid.reduce((s, p) => s + Number(p.amount), 0);

  const columns: Column<Payment>[] = [
    { key: "kind", label: "Tipo", type: "string", width: 104, render: (p) => <KindBadge kind={p.kind} /> },
    {
      key: "concept",
      label: "Concepto / periodo",
      type: "string",
      width: 220,
      render: (p) => (
        <span className="block">
          <span className="block font-medium">{paymentConcept(p)}</span>
          <span className="block text-xs text-axzy-slate dark:text-axzy-mist">
            {p.kind === "RECURRING" ? `Periodo ${periodText(p.period)}` : "Sin periodo"}
          </span>
        </span>
      ),
    },
    { key: "amount", label: "Importe", type: "string", width: 100, render: (p) => <span className="tabular-nums">{money(p.amount)}</span>, align: "right" },
    {
      key: "dueDate",
      label: "Vence",
      type: "string",
      width: 100,
      render: (p) => {
        const late = p.status === "PENDING" && p.dueDate < today();
        return <span className={late ? "font-semibold text-red-700 dark:text-red-400" : ""}>{dateText(p.dueDate)}</span>;
      },
    },
    {
      key: "status",
      label: "Estado",
      type: "string",
      width: 124,
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
      width: 252,
      align: "right",
      actions: (p) =>
        p.status === "PENDING" ? (
          <span className="inline-flex flex-wrap justify-end gap-1">
            <ITButton size="sm" variant="outlined" onClick={() => changeStatus(p.id, "PAID", "Efectivo")}>
              Efectivo
            </ITButton>
            <ITButton size="sm" variant="outlined" onClick={() => changeStatus(p.id, "PAID", "Transferencia")}>
              Transferencia
            </ITButton>
            <ITButton size="sm" variant="text" color="gray" onClick={() => changeStatus(p.id, "CANCELLED")}>
              Cancelar
            </ITButton>
          </span>
        ) : (
          <ITButton size="sm" variant="text" color="gray" onClick={() => changeStatus(p.id, "PENDING")}>
            Reabrir
          </ITButton>
        ),
    },
  ];

  return (
    <section aria-labelledby="cobros" className="flex flex-col gap-3">
      <SectionTitle
        id="cobros"
        eyebrow="Cobros"
        title="Historial de cobros"
        description="Registra cobros mensuales o cargos únicos; la Central no cobra con pasarela, solo lleva el registro."
        action={
          <>
            <ITButton variant="outlined" size="sm" icon={<LuRefreshCw size={14} />} onClick={() => void generateNext()} disabled={generating || !client.plan}>
              {generating ? "Generando…" : "Generar siguiente cobro"}
            </ITButton>
            <ITButton size="sm" icon={<LuPlus size={14} />} onClick={() => (adding ? resetForm() : setAdding(true))}>
              {adding ? "Cerrar alta" : "Agregar cobro"}
            </ITButton>
          </>
        }
      />

      <ITCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <ITBentoPillRow>
            <ITBentoPill dot="var(--color-warning)">Pendiente {money(pendingTotal)}</ITBentoPill>
            <ITBentoPill dot="var(--color-success)">Cobrado {money(paidTotal)}</ITBentoPill>
            <ITBentoPill dot="var(--color-danger)">{client.overdue ? "Vencido" : "Sin vencidos"}</ITBentoPill>
          </ITBentoPillRow>
          {!client.plan && <ITText muted className="text-xs">Sin plan: los cobros manuales siguen disponibles.</ITText>}
        </div>

        {adding && (
          <form
            onSubmit={create}
            className="mb-5 grid gap-4 rounded-2xl bg-[var(--it-card-bg)] p-4 shadow-sm ring-1 ring-black/5 sm:grid-cols-2 dark:ring-white/10"
            noValidate
          >
            <div className="sm:col-span-2">
              <p className="axc-eyebrow mb-2 text-axzy-slate dark:text-axzy-mist">Tipo de cobro</p>
              <ITSegmentedControl
                size="sm"
                options={[
                  { value: "RECURRING", label: "Recurrente (mensual)" },
                  { value: "ONE_TIME", label: "Único" },
                ]}
                value={kind}
                onChange={(value) => setKind(value as PaymentKind)}
              />
              <ITText muted className="mt-2 block text-xs">
                {kind === "RECURRING"
                  ? `Se registrará el periodo ${period} (uno por mes y cliente).`
                  : "Cargo único sin periodo; por ejemplo, instalación y capacitación."}
              </ITText>
            </div>
            <ITDatePicker
              name="dueDate"
              label="Vence"
              value={due}
              onChange={(e) => {
                const value = e.target.value;
                if (value instanceof Date) setDue(value);
              }}
            />
            <ITInput name="amount" type="number" label="Importe (MXN)" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <ITInput
              name="concept"
              label={kind === "RECURRING" ? "Concepto (opcional)" : "Concepto"}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder={kind === "RECURRING" ? "Mensualidad" : "Instalación y capacitación"}
            />
            <ITInput name="notes" label="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
              <ITButton type="button" variant="text" color="gray" onClick={resetForm}>
                Cancelar
              </ITButton>
              <ITButton type="submit" disabled={busy || !(Number(amount) > 0)}>
                {busy ? "Guardando…" : "Agregar cobro"}
              </ITButton>
            </div>
          </form>
        )}

        {client.payments.length === 0 ? (
          <ITText muted className="text-sm">
            Sin cobros registrados. Genera el siguiente según el plan o agrega uno manual.
          </ITText>
        ) : (
          <ITTable
            columns={columns as unknown as Column<Record<string, unknown>>[]}
            data={client.payments as unknown as Record<string, unknown>[]}
            size="sm"
            density="compact"
            layout="fixed"
            defaultItemsPerPage={10}
            itemsPerPageOptions={[10, 25, 50]}
            autoCardBreakpoint={720}
            renderCard={(row) => {
              const p = row as unknown as Payment;
              return (
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{paymentConcept(p)}</p>
                      <p className="text-xs text-axzy-slate dark:text-axzy-mist">
                        {p.kind === "RECURRING" ? `Periodo ${periodText(p.period)}` : "Pago único"}
                      </p>
                    </div>
                    <PaymentBadge status={p.status} dueDate={p.dueDate} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold tabular-nums">{money(p.amount)}</span>
                    <span>Vence {dateText(p.dueDate)}</span>
                  </div>
                  {p.status === "PENDING" && (
                    <div className="flex flex-wrap gap-2">
                      <ITButton size="sm" variant="outlined" onClick={() => changeStatus(p.id, "PAID", "Efectivo")}>
                        Pagó efectivo
                      </ITButton>
                      <ITButton size="sm" variant="outlined" onClick={() => changeStatus(p.id, "PAID", "Transferencia")}>
                        Pagó transferencia
                      </ITButton>
                      <ITButton size="sm" variant="text" color="gray" onClick={() => changeStatus(p.id, "CANCELLED")}>
                        Cancelar
                      </ITButton>
                    </div>
                  )}
                </div>
              );
            }}
          />
        )}

        {pending.length > 0 && !client.overdue && (
          <ITAlert variant="info" className="mt-4">
            Siguiente pago: {dateText(client.nextDueDate)} · {PAYMENT_LABEL.PENDING} {money(pendingTotal)}.
          </ITAlert>
        )}
      </ITCard>
    </section>
  );
}
