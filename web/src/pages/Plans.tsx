import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ITAlert,
  ITBadget,
  ITButton,
  ITDialog,
  ITInput,
  ITSegmentedControl,
  ITSelect,
  ITText,
} from "@axzydev/axzy_ui_system";
import { LuPencil, LuPlus, LuReceipt, LuRepeat, LuTag, LuUsers } from "react-icons/lu";
import { api, money, planLimits, type BillingType, type Plan, type PlanBody, type PlanPatch, type Product } from "../api";
import { useNotify } from "../toast";
import { BillingTypeBadge, CountUp, errorOf } from "../shared";
import { Card, Empty, Page, StatCard, TableWrap, Td, Th } from "../ui";

const EMPTY = { productId: "", name: "", price: "", billingType: "RECURRING" as BillingType, maxKitchens: "1", maxWaiters: "2" };

/** Vacío = ilimitado. */
const limitOf = (v: string) => (v.trim() === "" ? null : Math.max(1, Math.floor(Number(v))));
const limitInvalid = (v: string) => v.trim() !== "" && !(Number(v) >= 1);

/** Cuántos teléfonos incluye el plan; vacío es ilimitado. */
function LimitFields({ kitchens, waiters, onChange }: { kitchens: string; waiters: string; onChange: (k: string, w: string) => void }) {
  return (
    <>
      <ITInput
        name="maxKitchens"
        type="number"
        label="Teléfonos de cocina"
        value={kitchens}
        onChange={(e) => onChange(e.target.value, waiters)}
        placeholder="Ilimitados"
      />
      <ITInput
        name="maxWaiters"
        type="number"
        label="Meseras a la vez"
        value={waiters}
        onChange={(e) => onChange(kitchens, e.target.value)}
        placeholder="Ilimitadas"
      />
      <div className="sm:col-span-2 -mt-2">
        <ITText muted className="text-xs">
          Déjalo vacío para ilimitado. La Central no deja dar de alta más cocinas; la cocina no acepta más meseras conectadas.
        </ITText>
      </div>
    </>
  );
}

export default function Plans() {
  const notify = useNotify();
  const [params, setParams] = useSearchParams();
  const productFilter = params.get("producto") ?? "";
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [editForm, setEditForm] = useState({ name: "", price: "", billingType: "RECURRING" as BillingType, maxKitchens: "", maxWaiters: "" });
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(() => {
    setError("");
    Promise.all([api<Plan[]>("GET", "/plans"), api<Product[]>("GET", "/products")])
      .then(([pl, pr]) => {
        setPlans(pl);
        setProducts(pr);
      })
      .catch((e) => setError(errorOf(e)));
  }, []);
  useEffect(load, [load]);

  const activeProducts = products.filter((p) => p.active);
  const productPlans = plans?.filter((p) => p.productId === form.productId) ?? [];
  const defaultProduct = activeProducts.find((p) => p.key === "TAQUERIA")?.id ?? activeProducts[0]?.id ?? "";

  const openCreate = () => {
    setForm({ ...EMPTY, productId: productFilter || defaultProduct });
    setCreating(true);
  };

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
      maxKitchens: limitOf(form.maxKitchens),
      maxWaiters: limitOf(form.maxWaiters),
    };
    if (await run(() => api("POST", "/plans", body), "Plan agregado")) {
      setCreating(false);
      setForm({ ...EMPTY, productId: form.productId });
    }
    setBusy(false);
  };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setEditForm({
      name: plan.name,
      price: String(Number(plan.price)),
      billingType: plan.billingType,
      maxKitchens: plan.maxKitchens == null ? "" : String(plan.maxKitchens),
      maxWaiters: plan.maxWaiters == null ? "" : String(plan.maxWaiters),
    });
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setEditBusy(true);
    const patch: PlanPatch = {
      name: editForm.name.trim(),
      price: Number(editForm.price),
      billingType: editForm.billingType,
      maxKitchens: limitOf(editForm.maxKitchens),
      maxWaiters: limitOf(editForm.maxWaiters),
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

  const rows = useMemo(
    () =>
      (plans ?? [])
        .filter((p) => !productFilter || p.productId === productFilter)
        .slice()
        .sort((a, b) => (a.productName ?? "").localeCompare(b.productName ?? "") || Number(a.price) - Number(b.price)),
    [plans, productFilter]
  );

  const filteredProduct = products.find((p) => p.id === productFilter);
  const createPriceLabel = form.billingType === "RECURRING" ? "Precio mensual (MXN)" : "Precio único (MXN)";

  return (
    <Page
      eyebrow="Catálogo"
      title="Planes"
      description="Cada plan pertenece a un producto y define si se cobra cada mes o una sola vez. Los cobros ya registrados no cambian al editar el plan."
      actions={
        <ITButton icon={<LuPlus size={15} />} onClick={openCreate} disabled={activeProducts.length === 0}>
          Nuevo plan
        </ITButton>
      }
      loading={plans === null && !error}
      error={error || null}
      onRetry={load}
    >
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Planes en catálogo" value={<CountUp value={stats.total} />} hint="activos y dados de baja" icon={<LuTag size={16} />} tone="teal" />
        <StatCard label="Recurrentes" value={<CountUp value={stats.recurring} />} hint="cobro mensual" icon={<LuRepeat size={16} />} tone="green" />
        <StatCard label="Pago único" value={<CountUp value={stats.oneTime} />} hint="cargo inicial" icon={<LuReceipt size={16} />} tone="violet" />
        <StatCard label="Clientes con plan" value={<CountUp value={stats.clients} />} hint="asignaciones" icon={<LuUsers size={16} />} tone="amber" />
      </div>

      <Card
        title="Catálogo de planes"
        subtitle={`${rows.length} plan(es) en ${products.length} producto(s)`}
        bodyClassName="p-0"
        actions={
          <>
            {filteredProduct && (
              <ITButton
                size="sm"
                variant="text"
                color="gray"
                onClick={() => {
                  params.delete("producto");
                  setParams(params);
                }}
              >
                Quitar filtro: {filteredProduct.name}
              </ITButton>
            )}
            <ITButton size="sm" variant="outlined" icon={<LuPlus size={13} />} onClick={openCreate} disabled={activeProducts.length === 0}>
              Nuevo plan
            </ITButton>
          </>
        }
      >
        {plans && plans.length === 0 ? (
          <div className="p-5">
            <Empty
              title="Todavía no hay planes"
              description="Crea el primero y asígnalo a tus clientes desde su detalle."
              action={<ITButton onClick={openCreate}>Crear plan</ITButton>}
            />
          </div>
        ) : (
          <TableWrap className="min-w-[900px]">
            <thead className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40">
              <tr>
                <Th>Plan</Th>
                <Th>Producto</Th>
                <Th>Tipo de cobro</Th>
                <Th className="text-right">Precio</Th>
                <Th>Incluye</Th>
                <Th className="text-right">Clientes</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <Td>
                    <span className="font-semibold text-slate-900 dark:text-white">{p.name}</span>
                  </Td>
                  <Td className="text-slate-500 dark:text-slate-400">{p.productName ?? "—"}</Td>
                  <Td>
                    <BillingTypeBadge type={p.billingType} />
                  </Td>
                  <Td className="text-right">
                    <span className="text-[15px] font-bold tabular-nums text-slate-900 dark:text-white">{money(p.price)}</span>
                    <span className="ml-1 text-xs text-slate-400">{p.billingType === "RECURRING" ? "/mes" : "único"}</span>
                  </Td>
                  <Td className="text-slate-600 dark:text-slate-300">{planLimits(p)}</Td>
                  <Td className="text-right tabular-nums">{p.clients ?? 0}</Td>
                  <Td>{p.active ? <ITBadget color="success" label="Activo" size="sm" /> : <ITBadget color="gray" label="Dado de baja" size="sm" />}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1.5">
                      <ITButton size="sm" variant="outlined" icon={<LuPencil size={13} />} onClick={() => openEdit(p)}>
                        Editar
                      </ITButton>
                      <ITButton
                        size="sm"
                        variant="text"
                        color={p.active ? "gray" : "primary"}
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
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {/* Alta de plan */}
      <ITDialog isOpen={creating} onClose={() => setCreating(false)} title="Nuevo plan" className="w-[min(94vw,620px)]">
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2" noValidate>
          <ITSelect
            name="productId"
            label="Producto"
            required
            value={form.productId}
            options={activeProducts.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}
          />
          <ITInput
            name="name"
            label="Nombre del plan"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Básico"
            required
            autoFocus
          />
          <div className="sm:col-span-2">
            <p className="axc-eyebrow mb-2 text-slate-500 dark:text-slate-400">Tipo de cobro</p>
            <ITSegmentedControl
              options={[
                { value: "RECURRING", label: "Recurrente (mensual)" },
                { value: "ONE_TIME", label: "Pago único" },
              ]}
              value={form.billingType}
              onChange={(value) => setForm({ ...form, billingType: value as BillingType })}
            />
          </div>
          <ITInput
            name="price"
            type="number"
            label={createPriceLabel}
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
          />
          <div className="flex items-end">
            <ITText muted className="text-xs">
              {form.billingType === "RECURRING"
                ? "La Central puede generar el siguiente cobro cada mes."
                : "Se cobra una sola vez: instalación o cargo inicial."}
            </ITText>
          </div>
          <LimitFields kitchens={form.maxKitchens} waiters={form.maxWaiters} onChange={(k, w) => setForm({ ...form, maxKitchens: k, maxWaiters: w })} />
          {productPlans.length > 0 && (
            <div className="sm:col-span-2">
              <ITAlert variant="info">
                {productPlans.length} plan(es) ya existen para este producto: {productPlans.map((p) => p.name).join(", ")}.
              </ITAlert>
            </div>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <ITButton type="button" variant="outlined" color="gray" onClick={() => setCreating(false)}>
              Cancelar
            </ITButton>
            <ITButton type="submit" disabled={busy || !form.productId || form.name.trim().length < 2 || form.price === "" || limitInvalid(form.maxKitchens) || limitInvalid(form.maxWaiters)}>
              {busy ? "Guardando…" : "Crear plan"}
            </ITButton>
          </div>
        </form>
      </ITDialog>

      {/* Edición de plan */}
      <ITDialog isOpen={editing !== null} onClose={() => setEditing(null)} title={`Editar ${editing?.name ?? "plan"}`} className="w-[min(94vw,560px)]">
        <form onSubmit={saveEdit} className="flex flex-col gap-4" noValidate>
          <ITInput name="editName" label="Nombre" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
          <div>
            <p className="axc-eyebrow mb-2 text-slate-500 dark:text-slate-400">Tipo de cobro</p>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <LimitFields
              kitchens={editForm.maxKitchens}
              waiters={editForm.maxWaiters}
              onChange={(k, w) => setEditForm({ ...editForm, maxKitchens: k, maxWaiters: w })}
            />
          </div>
          <ITAlert variant="info">Cambiar precio o tipo de cobro no altera los cobros ya registrados. Bajar los límites no revoca teléfonos ya activos.</ITAlert>
          <div className="flex justify-end gap-2">
            <ITButton type="button" variant="outlined" color="gray" onClick={() => setEditing(null)}>
              Cancelar
            </ITButton>
            <ITButton type="submit" disabled={editBusy || editForm.name.trim().length < 2 || editForm.price === "" || limitInvalid(editForm.maxKitchens) || limitInvalid(editForm.maxWaiters)}>
              {editBusy ? "Guardando…" : "Guardar cambios"}
            </ITButton>
          </div>
        </form>
      </ITDialog>
    </Page>
  );
}
