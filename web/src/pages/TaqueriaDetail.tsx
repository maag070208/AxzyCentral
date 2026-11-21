import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { agoText, api, dateText, money, type Device, type Plan, type TaqueriaDetail as Detail } from "../api";
import { Badge, Button, Card, ErrorText, Field, Select, errorOf } from "../ui";

const today = () => new Date().toISOString().slice(0, 10);
const PAYMENT_LABEL = { PENDING: "Pendiente", PAID: "Pagado", CANCELLED: "Cancelado" } as const;

export default function TaqueriaDetail() {
  const { id = "" } = useParams();
  const [t, setT] = useState<Detail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [detail, planList] = await Promise.all([api<Detail>("GET", `/taquerias/${id}`), api<Plan[]>("GET", "/plans")]);
      setT(detail);
      setPlans(planList);
    } catch (e) {
      setError(errorOf(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Corre una acción que devuelve la taquería actualizada. */
  const act = async (fn: () => Promise<Detail | unknown>) => {
    setError("");
    try {
      const next = await fn();
      if (next && typeof next === "object" && "payments" in next) setT(next as Detail);
      else await load();
      return true;
    } catch (e) {
      setError(errorOf(e));
      return false;
    }
  };

  if (!t) return error ? <ErrorText>{error}</ErrorText> : <p className="text-sm text-stone-500">Cargando…</p>;

  const suspended = t.status === "SUSPENDED";
  const toggleStatus = () => {
    const message = suspended
      ? `¿Reactivar ${t.name}? La app se desbloquea en cuanto se conecte a internet.`
      : `¿Suspender ${t.name}? La app de cocina se bloquea en cuanto se conecte a internet.`;
    if (window.confirm(message)) void act(() => api("PATCH", `/taquerias/${t.id}`, { status: suspended ? "ACTIVE" : "SUSPENDED" }));
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/taquerias" className="text-sm font-semibold text-emerald-800 hover:underline">← Taquerías</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black">{t.name}</h1>
          {suspended ? <Badge tone="red">Suspendida</Badge> : <Badge tone="green">Activa</Badge>}
          <Button className="ml-auto" tone={suspended ? "primary" : "danger"} onClick={toggleStatus}>
            {suspended ? "Reactivar" : "Suspender"}
          </Button>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Cocina: {t.devices.some((d) => d.active) ? `última conexión ${agoText(t.lastSeenAt).toLowerCase()}` : "sin activar"}
          {t.nextDueDate && <> · siguiente pago {dateText(t.nextDueDate)}{t.overdue && <strong className="text-rose-700"> (vencido)</strong>}</>}
        </p>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="grid gap-5 lg:grid-cols-2">
        <InfoCard t={t} plans={plans} onSave={(body) => act(() => api("PATCH", `/taquerias/${t.id}`, body))} />
        <DevicesCard t={t} act={act} />
      </div>
      <PaymentsCard t={t} act={act} />
    </div>
  );
}

function InfoCard({ t, plans, onSave }: { t: Detail; plans: Plan[]; onSave: (body: object) => Promise<boolean> }) {
  const initial = { name: t.name, ownerName: t.ownerName ?? "", phone: t.phone ?? "", notes: t.notes ?? "", planId: t.plan?.id ?? "" };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const options = plans.filter((p) => p.active || p.id === t.plan?.id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await onSave({ ...form, planId: form.planId || null })) setSaved(true);
  };

  return (
    <Card title="Datos y plan">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nombre" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setSaved(false); }} required minLength={2} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Encargado" value={form.ownerName} onChange={(e) => { setForm({ ...form, ownerName: e.target.value }); setSaved(false); }} />
          <Field label="Teléfono" type="tel" value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setSaved(false); }} />
        </div>
        <Select label="Plan" value={form.planId} onChange={(e) => { setForm({ ...form, planId: e.target.value }); setSaved(false); }}>
          <option value="">Sin plan</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>{p.name} · {money(p.monthlyPrice)}/mes{p.active ? "" : " (dado de baja)"}</option>
          ))}
        </Select>
        <Field label="Notas" value={form.notes} onChange={(e) => { setForm({ ...form, notes: e.target.value }); setSaved(false); }} />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty}>Guardar</Button>
          {saved && !dirty && <span className="text-sm text-emerald-700">Guardado</span>}
        </div>
      </form>
    </Card>
  );
}

function DevicesCard({ t, act }: { t: Detail; act: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [code, setCode] = useState<{ device: Device; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const issue = async (fn: () => Promise<{ device: Device; code: string }>) => {
    setError("");
    setCopied(false);
    try {
      setCode(await fn());
      await act(() => api("GET", `/taquerias/${t.id}`));
    } catch (e) {
      setError(errorOf(e));
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card
      title="Tablet de cocina"
      action={<Button tone="secondary" onClick={() => void issue(() => api("POST", `/taquerias/${t.id}/devices`, { name: `Cocina ${t.devices.length + 1}` }))}>Generar código</Button>}
    >
      <p className="mb-3 text-sm text-stone-500">
        El código se pega una vez en el teléfono o tablet de cocina (con internet). Con él la app pregunta si la cuenta sigue activa.
      </p>
      <ErrorText>{error}</ErrorText>

      {code && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">Código de {code.device.name}. Cópialo ahora: no se vuelve a mostrar.</p>
          <p className="my-2 break-all rounded-lg bg-white p-2 font-mono text-sm">{code.code}</p>
          <p className="mb-2 text-xs text-amber-900">Mándalo por WhatsApp{t.phone ? ` al ${t.phone}` : ""} y que lo pegue en la app: Cocina → Activar.</p>
          <div className="flex gap-2">
            <Button onClick={() => void copy()}>{copied ? "Copiado" : "Copiar"}</Button>
            <Button tone="ghost" onClick={() => setCode(null)}>Listo</Button>
          </div>
        </div>
      )}

      {t.devices.length === 0 ? (
        <p className="text-sm text-stone-500">Todavía no hay dispositivos.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {t.devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-3">
              <div className="min-w-32 flex-1">
                <p className="font-semibold">{d.name} {!d.active && <Badge tone="gray">Revocado</Badge>}</p>
                <p className="text-xs text-stone-500">Última conexión: {agoText(d.lastSeenAt)}</p>
              </div>
              <Button tone="ghost" onClick={() => void issue(() => api("POST", `/taquerias/${t.id}/devices/${d.id}/code`))}>Nuevo código</Button>
              <Button
                tone="secondary"
                onClick={() => {
                  if (!d.active || window.confirm(`¿Revocar ${d.name}? Esa app se bloquea en cuanto se conecte.`)) {
                    void act(() => api("PATCH", `/taquerias/${t.id}/devices/${d.id}`, { active: !d.active }));
                  }
                }}
              >
                {d.active ? "Revocar" : "Reactivar"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PaymentsCard({ t, act }: { t: Detail; act: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState({ period: today().slice(0, 7), amount: t.plan ? String(Number(t.plan.monthlyPrice)) : "", dueDate: today() });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    await act(() => api("POST", `/taquerias/${t.id}/payments`, { period: form.period, amount: Number(form.amount), dueDate: form.dueDate }));
  };
  const setStatus = (paymentId: string, status: string, method?: string) =>
    void act(() => api("PATCH", `/taquerias/${t.id}/payments/${paymentId}`, { status, ...(method ? { method } : {}) }));

  return (
    <Card title="Cobros">
      <p className="mb-3 text-sm text-stone-500">
        Sin internet, la app funciona hasta 5 días después del cobro pendiente más antiguo. Si no pagan, suspende la taquería.
      </p>
      <form onSubmit={create} className="mb-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Field label="Periodo" type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} required />
        <Field label="Importe" type="number" min={1} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        <Field label="Vence" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
        <Button type="submit">Agregar cobro</Button>
      </form>

      {t.payments.length === 0 ? (
        <p className="text-sm text-stone-500">Sin cobros registrados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="py-2">Periodo</th>
                <th className="py-2">Importe</th>
                <th className="py-2">Vence</th>
                <th className="py-2">Estado</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {t.payments.map((p) => {
                const late = p.status === "PENDING" && p.dueDate < today();
                return (
                  <tr key={p.id} className="border-t border-stone-100">
                    <td className="py-2 font-semibold">{p.period}</td>
                    <td className="py-2 tabular-nums">{money(p.amount)}</td>
                    <td className={`py-2 ${late ? "font-semibold text-rose-700" : ""}`}>{dateText(p.dueDate)}</td>
                    <td className="py-2">
                      <Badge tone={p.status === "PAID" ? "green" : p.status === "CANCELLED" ? "gray" : late ? "red" : "amber"}>
                        {late ? "Vencido" : PAYMENT_LABEL[p.status]}
                      </Badge>
                      {p.paidAt && <span className="ml-2 text-xs text-stone-500">{dateText(p.paidAt)}{p.method ? ` · ${p.method}` : ""}</span>}
                    </td>
                    <td className="py-2 text-right">
                      {p.status === "PENDING" ? (
                        <span className="inline-flex gap-1">
                          <Button tone="secondary" onClick={() => setStatus(p.id, "PAID", "Efectivo")}>Pagó efectivo</Button>
                          <Button tone="secondary" onClick={() => setStatus(p.id, "PAID", "Transferencia")}>Pagó transferencia</Button>
                          <Button tone="ghost" onClick={() => setStatus(p.id, "CANCELLED")}>Cancelar</Button>
                        </span>
                      ) : (
                        <Button tone="ghost" onClick={() => setStatus(p.id, "PENDING")}>Reabrir</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
