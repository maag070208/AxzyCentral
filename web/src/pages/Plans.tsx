import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ITAlert,
  ITBadget,
  ITBentoGrid,
  ITBentoPill,
  ITBentoPillRow,
  ITBentoStatStrip,
  ITBentoTile,
  ITButton,
  ITCard,
  ITDialog,
  ITEmptyState,
  ITInput,
  ITPage,
  ITSelect,
  ITSegmentedControl,
  ITText,
} from "@axzydev/axzy_ui_system";
import { LuPencil, LuPlus, LuTag, LuTags } from "react-icons/lu";
import { api, money, type BillingType, type Plan, type PlanBody, type PlanPatch, type Product } from "../api";
import { useNotify } from "../toast";
import { BillingTypeBadge, CountUp, SectionTitle, errorOf } from "../shared";

const TONES = ["mint", "lavender", "sun", "plain"] as const;

const EMPTY = { productId: "", name: "", price: "", billingType: "RECURRING" as BillingType };

export default function Plans() {
  const notify = useNotify();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [editForm, setEditForm] = useState({ name: "", price: "", billingType: "RECURRING" as BillingType });
  const [editBusy, setEditBusy] = useState(false);

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
    setBusy(true);
    const body: PlanBody = {
      productId: form.productId,
      name: form.name.trim(),
      billingType: form.billingType,
      price: Number(form.price),
    };
    if (await run(() => api("POST", "/plans", body), "Plan agregado")) setForm({ ...form, name: "", price: "" });
    setBusy(false);
  };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setEditForm({ name: plan.name, price: String(Number(plan.price)), billingType: plan.billingType });
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setEditBusy(true);
    const patch: PlanPatch = {
      name: editForm.name.trim(),
      price: Number(editForm.price),
      billingType: editForm.billingType,
    };
    const ok = await run(() => api("PATCH", `/plans/${editing.id}`, patch), "Plan actualizado");
    setEditBusy(false);
    if (ok) setEditing(null);
  };

  const stats = useMemo(() => {
    const all = plans ?? [];
    return {
      total: all.length,
      recurring: all.filter((p) => p.billingType === "RECURRING").length,
      oneTime: all.filter((p) => p.billingType === "ONE_TIME").length,
      clients: all.reduce((sum, p) => sum + (p.clients ?? 0), 0),
    };
  }, [plans]);

  const byProduct = products
    .map((product) => ({ product, plans: (plans ?? []).filter((p) => p.productId === product.id) }))
    .filter((g) => g.plans.length > 0);

  const activeProducts = products.filter((p) => p.active);

  return (
    <ITPage
      title="Planes"
      description="Cada plan define qué cobras y cada cuánto: mensual recurrente o pago único."
      icon={<LuTags size={20} />}
      loading={plans === null && !error}
      error={error || undefined}
      onRetry={load}
    >
      <div className="flex flex-col gap-6">
        <ITBentoStatStrip
          items={[
            { id: "all", label: "Planes", value: <CountUp value={stats.total} />, caption: "en catálogo", color: "var(--color-primary)", tone: "plain" },
            { id: "recurring", label: "Recurrentes", value: <CountUp value={stats.recurring} />, caption: "cobro mensual", color: "var(--color-info)", tone: "mint" },
            { id: "onetime", label: "Pago único", value: <CountUp value={stats.oneTime} />, caption: "cargo inicial", color: "var(--color-ternary)", tone: "lavender" },
            { id: "clients", label: "Clientes asignados", value: <CountUp value={stats.clients} />, caption: "con plan", color: "var(--color-success)", tone: "sun" },
          ]}
        />

        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-6">
            {byProduct.length === 0 && plans && (
              <ITEmptyState
                icon={<LuTags size={32} />}
                title="Todavía no hay planes"
                description="Crea el primero y asígnalo a tus clientes desde su detalle."
              />
            )}
            {byProduct.map(({ product, plans: list }) => {
              const cols = list.length === 1 ? 6 : list.length === 2 ? 6 : 4;
              return (
                <section key={product.id} aria-labelledby={`producto-${product.id}`}>
                  <SectionTitle
                    id={`producto-${product.id}`}
                    eyebrow={product.key}
                    title={product.name}
                    description={`${list.length} plan(es) · ${product.clients ?? 0} cliente(s)`}
                  />
                  <ITBentoGrid className="axc-stagger">
                    {list.map((p, i) => (
                      <ITBentoTile
                        key={p.id}
                        cols={cols}
                        rows={2}
                        tone={TONES[i % TONES.length]}
                        icon={<LuTag size={15} />}
                        label={
                          <span className="flex flex-wrap items-center gap-2">
                            {p.name}
                            {!p.active && <ITBadget color="gray" size="sm" label="Dado de baja" />}
                          </span>
                        }
                        value={money(p.price)}
                        caption={p.billingType === "RECURRING" ? "por mes" : "pago único"}
                      >
                        <ITBentoPillRow className="mt-2">
                          <BillingTypeBadge type={p.billingType} />
                          <ITBentoPill>{p.clients ?? 0} cliente(s)</ITBentoPill>
                        </ITBentoPillRow>
                        <div className="mt-auto flex flex-wrap gap-2 pt-3">
                          <ITButton size="sm" variant="outlined" icon={<LuPencil size={13} />} onClick={() => openEdit(p)}>
                            Editar
                          </ITButton>
                          <ITButton
                            size="sm"
                            variant="text"
                            color="gray"
                            onClick={() =>
                              void run(
                                () => api("PATCH", `/plans/${p.id}`, { active: !p.active }),
                                p.active ? "Plan dado de baja" : "Plan reactivado"
                              )
                            }
                          >
                            {p.active ? "Dar de baja" : "Reactivar"}
                          </ITButton>
                        </div>
                      </ITBentoTile>
                    ))}
                  </ITBentoGrid>
                </section>
              );
            })}
          </div>

          <ITCard title="Nuevo plan" tone="ternary" className="self-start">
            <form onSubmit={create} className="flex flex-col gap-4" noValidate>
              <ITSelect
                name="productId"
                label="Producto"
                value={form.productId}
                options={activeProducts.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
                required
              />
              <ITInput
                name="name"
                label="Nombre del plan"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Básico"
                required
              />
              <div>
                <p className="axc-eyebrow mb-2 text-axzy-slate dark:text-axzy-mist">Tipo de cobro</p>
                <ITSegmentedControl
                  options={[
                    { value: "RECURRING", label: "Recurrente" },
                    { value: "ONE_TIME", label: "Pago único" },
                  ]}
                  value={form.billingType}
                  onChange={(value) => setForm({ ...form, billingType: value as BillingType })}
                />
              </div>
              <ITInput
                name="price"
                type="number"
                label={form.billingType === "RECURRING" ? "Precio mensual (MXN)" : "Precio único (MXN)"}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                required
              />
              <ITText muted className="text-xs">
                {form.billingType === "RECURRING"
                  ? "El precio se cobra cada mes y la Central puede generar el siguiente cobro automáticamente."
                  : "Se cobra una sola vez, como instalación o cargo inicial del producto."}
              </ITText>
              <ITButton
                type="submit"
                icon={<LuPlus size={14} />}
                disabled={busy || !form.productId || form.name.trim().length < 2 || form.price === ""}
              >
                {busy ? "Guardando…" : "Agregar plan"}
              </ITButton>
            </form>
          </ITCard>
        </div>
      </div>

      <ITDialog isOpen={editing !== null} onClose={() => setEditing(null)} title={`Editar ${editing?.name ?? "plan"}`}>
        <form onSubmit={saveEdit} className="flex flex-col gap-4" noValidate>
          <ITInput
            name="editName"
            label="Nombre"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            required
          />
          <div>
            <p className="axc-eyebrow mb-2 text-axzy-slate dark:text-axzy-mist">Tipo de cobro</p>
            <ITSegmentedControl
              options={[
                { value: "RECURRING", label: "Recurrente" },
                { value: "ONE_TIME", label: "Pago único" },
              ]}
              value={editForm.billingType}
              onChange={(value) => setEditForm({ ...editForm, billingType: value as BillingType })}
            />
          </div>
          <ITInput
            name="editPrice"
            type="number"
            label={editForm.billingType === "RECURRING" ? "Precio mensual (MXN)" : "Precio único (MXN)"}
            value={editForm.price}
            onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
            required
          />
          <ITAlert variant="info">
            Cambiar el precio o el tipo de cobro no altera los cobros ya registrados; solo aplica a los siguientes.
          </ITAlert>
          <div className="flex flex-wrap justify-end gap-2">
            <ITButton type="button" variant="outlined" color="gray" onClick={() => setEditing(null)}>
              Cancelar
            </ITButton>
            <ITButton type="submit" disabled={editBusy || editForm.name.trim().length < 2 || editForm.price === ""}>
              {editBusy ? "Guardando…" : "Guardar cambios"}
            </ITButton>
          </div>
        </form>
      </ITDialog>
    </ITPage>
  );
}
