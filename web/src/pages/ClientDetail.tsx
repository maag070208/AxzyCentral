import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ITAlert,
  ITBadget,
  ITButton,
  ITCard,
  ITConfirmDialog,
  ITDatePicker,
  ITInput,
  ITPage,
  ITSelect,
  ITText,
} from "@axzydev/axzy_ui_system";
import { LuCheck, LuCopy, LuKeyRound, LuPause, LuPlay, LuPlus, LuRefreshCw, LuShieldOff, LuUser } from "react-icons/lu";
import { agoText, api, dateText, money, today, type ClientDetail as Detail, type Device, type Plan } from "../api";
import { useNotify } from "../toast";
import { Eyebrow, StatusBadge, errorOf, isoDate } from "../shared";

type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;

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
  const run: Run = async (fn, ok) => {
    try {
      const next = await fn();
      if (next && typeof next === "object" && "payments" in next) setClient(next as Detail);
      else await load();
      if (ok) notify(ok);
      return true;
    } catch (e) {
      notify(errorOf(e), "error");
      return false;
    }
  };

  const suspended = client?.status === "SUSPENDED";

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
        <div className="flex flex-col gap-5">
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await run(() => api("PATCH", `/clients/${client.id}`, { ...form, planId: form.planId || null }), "Cambios guardados");
  };

  return (
    <ITCard title="Datos y plan">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <ITInput name="name" label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <ITInput name="contactName" label="Contacto" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
        <ITInput name="phone" label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
              ...options.map((p) => ({ value: p.id, label: `${p.name} · ${money(p.monthlyPrice)}/mes${p.active ? "" : " (dado de baja)"}` })),
            ]}
            onChange={(e) => setForm({ ...form, planId: e.target.value })}
          />
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
  const notify = useNotify();
  const [issued, setIssued] = useState<{ device: Device; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<Device | null>(null);

  const issue = async (fn: () => Promise<{ device: Device; code: string }>) => {
    setCopied(false);
    try {
      setIssued(await fn());
      await run(() => api("GET", `/clients/${client.id}`));
    } catch (e) {
      notify(errorOf(e), "error");
    }
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
    } catch {
      notify("No se pudo copiar; selecciona el código a mano", "error");
    }
  };

  return (
    <ITCard
      title="Licencias"
      headerActions={
        <ITButton
          size="sm"
          variant="outlined"
          icon={<LuPlus size={13} />}
          onClick={() => void issue(() => api("POST", `/clients/${client.id}/devices`, { name: `Dispositivo ${client.devices.length + 1}` }))}
        >
          Generar código
        </ITButton>
      }
    >
      <ITText muted className="mb-4 block text-sm">
        Cada dispositivo del cliente (por ejemplo, la tablet de cocina) se activa una vez con su código. Con él la app pregunta si la cuenta sigue activa.
      </ITText>

      {issued && (
        <div className="mb-4 rounded-[10px] border border-primary-200 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-950/40">
          <Eyebrow>Código de {issued.device.name} · solo se muestra ahora</Eyebrow>
          <p className="my-2 break-all rounded-md bg-white p-2 font-mono text-sm text-axzy-navy dark:bg-slate-900 dark:text-white">{issued.code}</p>
          <ITText className="mb-3 block text-xs">
            Mándalo por WhatsApp{client.phone ? ` al ${client.phone}` : ""} y que lo pegue en la app al activarla.
          </ITText>
          <div className="flex gap-2">
            <ITButton size="sm" icon={copied ? <LuCheck size={13} /> : <LuCopy size={13} />} onClick={() => void copy()}>
              {copied ? "Copiado" : "Copiar"}
            </ITButton>
            <ITButton size="sm" variant="text" color="gray" onClick={() => setIssued(null)}>
              Listo
            </ITButton>
          </div>
        </div>
      )}

      {client.devices.length === 0 ? (
        <ITText muted className="text-sm">Todavía no hay dispositivos.</ITText>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {client.devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-3">
              <LuKeyRound aria-hidden className="text-axzy-teal" />
              <div className="min-w-32 flex-1">
                <p className="font-semibold">
                  {d.name} {!d.active && <ITBadget color="gray" label="Revocado" size="sm" />}
                </p>
                <p className="text-xs text-axzy-slate dark:text-axzy-mist">Última conexión: {agoText(d.lastSeenAt)}</p>
              </div>
              <ITButton
                size="sm"
                variant="text"
                icon={<LuRefreshCw size={13} />}
                onClick={() => void issue(() => api("POST", `/clients/${client.id}/devices/${d.id}/code`))}
              >
                Nuevo código
              </ITButton>
              {d.active ? (
                <ITButton size="sm" variant="outlined" color="danger" icon={<LuShieldOff size={13} />} onClick={() => setRevoking(d)}>
                  Revocar
                </ITButton>
              ) : (
                <ITButton size="sm" variant="outlined" onClick={() => void run(() => api("PATCH", `/clients/${client.id}/devices/${d.id}`, { active: true }), "Licencia reactivada")}>
                  Reactivar
                </ITButton>
              )}
            </li>
          ))}
        </ul>
      )}

      <ITConfirmDialog
        isOpen={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          const d = revoking;
          setRevoking(null);
          if (d) await run(() => api("PATCH", `/clients/${client.id}/devices/${d.id}`, { active: false }), "Licencia revocada");
        }}
        title={`¿Revocar ${revoking?.name ?? ""}?`}
        message="Esa app se bloquea en cuanto se conecte a internet. Puedes reactivarla o darle un código nuevo después."
        confirmLabel="Revocar"
        cancelLabel="Cancelar"
        variant="danger"
      />
    </ITCard>
  );
}

const PAYMENT_LABEL = { PENDING: "Pendiente", PAID: "Pagado", CANCELLED: "Cancelado" } as const;

function PaymentsCard({ client, run }: { client: Detail; run: Run }) {
  const [amount, setAmount] = useState(client.plan ? String(Number(client.plan.monthlyPrice)) : "");
  const [due, setDue] = useState<Date>(new Date());
  const [adding, setAdding] = useState(false);
  const dueIso = isoDate(due);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(
      () => api("POST", `/clients/${client.id}/payments`, { period: dueIso.slice(0, 7), amount: Number(amount), dueDate: dueIso }),
      "Cobro agregado"
    );
    if (ok) setAdding(false);
  };
  const setStatus = (paymentId: string, status: string, method?: string) =>
    void run(() => api("PATCH", `/clients/${client.id}/payments/${paymentId}`, { status, ...(method ? { method } : {}) }), "Cobro actualizado");

  return (
    <ITCard
      title="Cobros"
      headerActions={
        !adding && (
          <ITButton size="sm" variant="outlined" icon={<LuPlus size={13} />} onClick={() => setAdding(true)}>
            Agregar cobro
          </ITButton>
        )
      }
    >
      <ITText muted className="mb-4 block text-sm">
        Sin internet, las apps funcionan hasta 5 días después del cobro pendiente más antiguo. Un pago vencido no suspende solo: tú decides.
      </ITText>

      {adding && (
        <form onSubmit={create} className="mb-5 grid items-end gap-3 rounded-[10px] border border-slate-200 p-4 sm:grid-cols-[1fr_1fr_auto] dark:border-slate-800" noValidate>
          <ITDatePicker
            name="dueDate"
            label="Vence"
            value={due}
            onChange={(e) => {
              const v = e.target.value;
              if (v instanceof Date) setDue(v);
            }}
          />
          <ITInput name="amount" type="number" label="Importe (MXN)" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <div className="flex gap-2">
            <ITButton type="submit" disabled={!(Number(amount) > 0)}>Agregar</ITButton>
            <ITButton type="button" variant="text" color="gray" onClick={() => setAdding(false)}>Cancelar</ITButton>
          </div>
          <ITText muted className="text-xs sm:col-span-3">Periodo: {dueIso.slice(0, 7)} (uno por mes).</ITText>
        </form>
      )}

      {client.payments.length === 0 ? (
        <ITText muted className="text-sm">Sin cobros registrados.</ITText>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="axc-eyebrow border-b border-slate-200 text-axzy-slate dark:border-slate-800 dark:text-axzy-mist">
                <th className="py-2 font-medium">Periodo</th>
                <th className="py-2 font-medium">Importe</th>
                <th className="py-2 font-medium">Vence</th>
                <th className="py-2 font-medium">Estado</th>
                <th className="py-2 font-medium"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {client.payments.map((p) => {
                const late = p.status === "PENDING" && p.dueDate < today();
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="py-3 font-mono font-semibold">{p.period}</td>
                    <td className="py-3 tabular-nums">{money(p.amount)}</td>
                    <td className={`py-3 ${late ? "font-semibold text-red-700 dark:text-red-400" : ""}`}>{dateText(p.dueDate)}</td>
                    <td className="py-3">
                      <ITBadget
                        size="sm"
                        color={p.status === "PAID" ? "success" : p.status === "CANCELLED" ? "gray" : late ? "danger" : "warning"}
                        label={late ? "Vencido" : PAYMENT_LABEL[p.status]}
                      />
                      {p.paidAt && (
                        <span className="ml-2 text-xs text-axzy-slate dark:text-axzy-mist">
                          {dateText(p.paidAt)}
                          {p.method ? ` · ${p.method}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {p.status === "PENDING" ? (
                        <span className="inline-flex flex-wrap justify-end gap-1">
                          <ITButton size="sm" variant="outlined" onClick={() => setStatus(p.id, "PAID", "Efectivo")}>Pagó efectivo</ITButton>
                          <ITButton size="sm" variant="outlined" onClick={() => setStatus(p.id, "PAID", "Transferencia")}>Pagó transferencia</ITButton>
                          <ITButton size="sm" variant="text" color="gray" onClick={() => setStatus(p.id, "CANCELLED")}>Cancelar</ITButton>
                        </span>
                      ) : (
                        <ITButton size="sm" variant="text" color="gray" onClick={() => setStatus(p.id, "PENDING")}>Reabrir</ITButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {client.payments.some((p) => p.status === "PENDING") && !client.overdue && (
        <ITAlert variant="info" className="mt-4">Siguiente pago: {dateText(client.nextDueDate)}.</ITAlert>
      )}
    </ITCard>
  );
}
