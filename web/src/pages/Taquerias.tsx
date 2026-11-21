import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { agoText, api, dateText, type Plan, type TaqueriaDetail, type TaqueriaSummary } from "../api";
import { Badge, Button, Card, ErrorText, Field, Select, errorOf } from "../ui";

export default function Taquerias() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<TaqueriaSummary[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", ownerName: "", phone: "", planId: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, planList] = await Promise.all([api<TaqueriaSummary[]>("GET", "/taquerias"), api<Plan[]>("GET", "/plans")]);
      setRows(list);
      setPlans(planList.filter((p) => p.active));
    } catch (e) {
      setError(errorOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const t = await api<TaqueriaDetail>("POST", "/taquerias", {
        name: form.name,
        ownerName: form.ownerName,
        phone: form.phone,
        planId: form.planId || null,
      });
      navigate(`/taquerias/${t.id}`);
    } catch (err) {
      setError(errorOf(err));
    } finally {
      setBusy(false);
    }
  };

  const active = rows?.filter((r) => r.status === "ACTIVE").length ?? 0;
  const overdue = rows?.filter((r) => r.overdue).length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Taquerías</h1>
          {rows && (
            <p className="text-sm text-stone-500">
              {rows.length} en total · {active} activas{overdue > 0 && <span className="font-semibold text-rose-700"> · {overdue} con pago vencido</span>}
            </p>
          )}
        </div>
        {!creating && <Button onClick={() => setCreating(true)}>+ Nueva taquería</Button>}
      </div>

      <ErrorText>{error}</ErrorText>

      {creating && (
        <Card title="Nueva taquería">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} autoFocus />
            <Select label="Plan" value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
              <option value="">Sin plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Field label="Encargado" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
            <Field label="Teléfono" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} hint="Para mandarle el código por WhatsApp" />
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={busy}>{busy ? "Guardando…" : "Dar de alta"}</Button>
              <Button type="button" tone="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {rows === null ? (
        <p className="text-sm text-stone-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-center text-sm text-stone-500">Todavía no hay taquerías. Da de alta la primera.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Taquería</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Siguiente pago</th>
                <th className="px-4 py-3">Cocina</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link to={`/taquerias/${t.id}`} className="font-semibold text-emerald-800 hover:underline">{t.name}</Link>
                    {t.ownerName && <p className="text-xs text-stone-500">{t.ownerName}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {t.status === "ACTIVE" ? <Badge tone="green">Activa</Badge> : <Badge tone="red">Suspendida</Badge>}
                  </td>
                  <td className="px-4 py-3">{t.plan?.name ?? <span className="text-stone-400">Sin plan</span>}</td>
                  <td className="px-4 py-3">
                    {t.nextDueDate ? (
                      <span className={t.overdue ? "font-semibold text-rose-700" : ""}>
                        {dateText(t.nextDueDate)}{t.overdue && " · vencido"}
                      </span>
                    ) : (
                      <span className="text-stone-400">Sin cobros pendientes</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {t.devices.active === 0 ? <span className="text-amber-700">Sin activar</span> : agoText(t.lastSeenAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
