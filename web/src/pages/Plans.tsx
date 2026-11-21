import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, money, type Plan } from "../api";
import { Badge, Button, Card, ErrorText, Field, errorOf } from "../ui";

export default function Plans() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", monthlyPrice: "" });
  const [editing, setEditing] = useState<{ id: string; price: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setPlans(await api<Plan[]>("GET", "/plans"));
    } catch (e) {
      setError(errorOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorOf(e));
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("POST", "/plans", { name: form.name, monthlyPrice: Number(form.monthlyPrice) });
      setForm({ name: "", monthlyPrice: "" });
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-black">Planes</h1>
      <ErrorText>{error}</ErrorText>

      <Card title="Nuevo plan">
        <form onSubmit={create} className="grid items-end gap-4 sm:grid-cols-[1fr_180px_auto]">
          <Field label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
          <Field label="Precio mensual" type="number" min={0} step="0.01" value={form.monthlyPrice} onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value })} required />
          <Button type="submit">Agregar</Button>
        </form>
      </Card>

      <Card>
        {plans === null ? (
          <p className="text-sm text-stone-500">Cargando…</p>
        ) : plans.length === 0 ? (
          <p className="text-sm text-stone-500">Todavía no hay planes.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-40 flex-1">
                  <p className="font-semibold">{p.name} {!p.active && <Badge tone="gray">Dado de baja</Badge>}</p>
                  <p className="text-xs text-stone-500">{p.taquerias ?? 0} taquería(s)</p>
                </div>
                {editing?.id === p.id ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await api("PATCH", `/plans/${p.id}`, { monthlyPrice: Number(editing.price) });
                        setEditing(null);
                      });
                    }}
                  >
                    <input
                      aria-label="Precio mensual"
                      type="number"
                      min={0}
                      step="0.01"
                      value={editing.price}
                      onChange={(e) => setEditing({ id: p.id, price: e.target.value })}
                      className="min-h-10 w-32 rounded-xl border border-stone-300 px-3"
                      autoFocus
                    />
                    <Button type="submit">Guardar</Button>
                    <Button type="button" tone="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                  </form>
                ) : (
                  <>
                    <span className="font-semibold tabular-nums">{money(p.monthlyPrice)}<span className="text-xs text-stone-500"> /mes</span></span>
                    <Button tone="ghost" onClick={() => setEditing({ id: p.id, price: String(Number(p.monthlyPrice)) })}>Cambiar precio</Button>
                    <Button tone="secondary" onClick={() => void run(() => api("PATCH", `/plans/${p.id}`, { active: !p.active }))}>
                      {p.active ? "Dar de baja" : "Reactivar"}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
