import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ITBadget, ITButton, ITCard, ITEmptyState, ITInput, ITPage, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { LuTags } from "react-icons/lu";
import { api, money, type Plan, type Product } from "../api";
import { useNotify } from "../toast";
import { errorOf } from "../shared";

export default function Plans() {
  const notify = useNotify();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ productId: "", name: "", monthlyPrice: "" });
  const [editing, setEditing] = useState<{ id: string; price: string } | null>(null);

  const load = useCallback(() => {
    setError("");
    Promise.all([api<Plan[]>("GET", "/plans"), api<Product[]>("GET", "/products")])
      .then(([pl, pr]) => {
        setPlans(pl);
        setProducts(pr);
        setForm((f) => (f.productId ? f : { ...f, productId: pr.find((p) => p.active)?.id ?? "" }));
      })
      .catch((e) => setError(errorOf(e)));
  }, []);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      notify(ok);
      load();
      return true;
    } catch (e) {
      notify(errorOf(e), "error");
      return false;
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api("POST", "/plans", { productId: form.productId, name: form.name, monthlyPrice: Number(form.monthlyPrice) }), "Plan agregado")) {
      setForm({ ...form, name: "", monthlyPrice: "" });
    }
  };

  const byProduct = products
    .map((product) => ({ product, plans: (plans ?? []).filter((p) => p.productId === product.id) }))
    .filter((g) => g.plans.length > 0);

  return (
    <ITPage
      title="Planes"
      description="Precio mensual por producto."
      icon={<LuTags size={20} />}
      loading={plans === null && !error}
      error={error || undefined}
      onRetry={load}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          {byProduct.length === 0 && (
            <ITEmptyState icon={<LuTags size={32} />} title="Todavía no hay planes" description="Agrega el primero para asignarlo a tus clientes." />
          )}
          {byProduct.map(({ product, plans: list }) => (
            <ITCard key={product.id} title={product.name}>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {list.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-40 flex-1">
                      <p className="font-semibold">
                        {p.name} {!p.active && <ITBadget color="gray" size="sm" label="Dado de baja" />}
                      </p>
                      <ITText muted className="text-xs">{p.clients ?? 0} cliente(s)</ITText>
                    </div>
                    {editing?.id === p.id ? (
                      <form
                        className="flex items-end gap-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (await run(() => api("PATCH", `/plans/${p.id}`, { monthlyPrice: Number(editing.price) }), "Precio actualizado")) setEditing(null);
                        }}
                      >
                        <div className="w-32">
                          <ITInput
                            name="price"
                            type="number"
                            label="Precio"
                            size="sm"
                            value={editing.price}
                            onChange={(e) => setEditing({ id: p.id, price: e.target.value })}
                            autoFocus
                          />
                        </div>
                        <ITButton size="sm" type="submit">Guardar</ITButton>
                        <ITButton size="sm" type="button" variant="text" color="gray" onClick={() => setEditing(null)}>Cancelar</ITButton>
                      </form>
                    ) : (
                      <>
                        <span className="font-semibold tabular-nums">
                          {money(p.monthlyPrice)}
                          <span className="text-xs font-normal text-axzy-slate dark:text-axzy-mist"> /mes</span>
                        </span>
                        <ITButton size="sm" variant="text" onClick={() => setEditing({ id: p.id, price: String(Number(p.monthlyPrice)) })}>
                          Cambiar precio
                        </ITButton>
                        <ITButton
                          size="sm"
                          variant="outlined"
                          color="gray"
                          onClick={() => void run(() => api("PATCH", `/plans/${p.id}`, { active: !p.active }), p.active ? "Plan dado de baja" : "Plan reactivado")}
                        >
                          {p.active ? "Dar de baja" : "Reactivar"}
                        </ITButton>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </ITCard>
          ))}
        </div>

        <ITCard title="Nuevo plan">
          <form onSubmit={create} className="flex flex-col gap-4" noValidate>
            <ITSelect
              name="productId"
              label="Producto"
              value={form.productId}
              options={products.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
              required
            />
            <ITInput name="name" label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <ITInput
              name="monthlyPrice"
              type="number"
              label="Precio mensual (MXN)"
              value={form.monthlyPrice}
              onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value })}
              required
            />
            <ITButton type="submit" disabled={!form.productId || form.name.trim().length < 2 || form.monthlyPrice === ""}>
              Agregar plan
            </ITButton>
          </form>
        </ITCard>
      </div>
    </ITPage>
  );
}
