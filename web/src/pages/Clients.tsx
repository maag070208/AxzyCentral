import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ITAlert, ITButton, ITDialog, ITEmptyState, ITInput, ITPage, ITSelect, ITTable, type Column } from "@axzydev/axzy_ui_system";
import { LuPlus, LuUsers } from "react-icons/lu";
import { agoText, api, dateText, money, type ClientDetail, type ClientSummary, type Plan, type Product } from "../api";
import { useNotify } from "../toast";
import { StatusBadge, errorOf } from "../shared";

const EMPTY = { productId: "", name: "", contactName: "", phone: "", email: "", planId: "" };

export default function Clients() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [params, setParams] = useSearchParams();
  const productFilter = params.get("producto") ?? "";
  const [rows, setRows] = useState<ClientSummary[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(params.get("nuevo") === "1");
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError("");
    const query = productFilter ? `?productId=${encodeURIComponent(productFilter)}` : "";
    Promise.all([api<ClientSummary[]>("GET", `/clients${query}`), api<Product[]>("GET", "/products"), api<Plan[]>("GET", "/plans")])
      .then(([c, p, pl]) => {
        setRows(c);
        setProducts(p);
        setPlans(pl);
      })
      .catch((e) => setError(errorOf(e)));
  }, [productFilter]);
  useEffect(load, [load]);

  const activeProducts = products.filter((p) => p.active);
  const productPlans = plans.filter((p) => p.active && p.productId === form.productId);
  const defaultProduct = productFilter || activeProducts[0]?.id || "";

  useEffect(() => {
    if (creating && !form.productId && defaultProduct) setForm((f) => ({ ...f, productId: defaultProduct }));
  }, [creating, form.productId, defaultProduct]);

  const openCreate = () => {
    setForm({ ...EMPTY, productId: defaultProduct });
    setFormError("");
    setCreating(true);
  };

  const closeCreate = () => {
    setCreating(false);
    if (params.get("nuevo")) {
      params.delete("nuevo");
      setParams(params, { replace: true });
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const c = await api<ClientDetail>("POST", "/clients", { ...form, planId: form.planId || null });
      notify(`${c.name} dado de alta`);
      navigate(`/clientes/${c.id}`);
    } catch (err) {
      setFormError(errorOf(err));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<ClientSummary>[] = [
    {
      key: "name",
      label: "Cliente",
      type: "string",
      render: (c) => (
        <span>
          <span className="block font-semibold">{c.name}</span>
          {c.contactName && <span className="block text-xs text-axzy-slate dark:text-axzy-mist">{c.contactName}</span>}
        </span>
      ),
    },
    { key: "product", label: "Producto", type: "string", render: (c) => c.product.name },
    { key: "status", label: "Estado", type: "string", render: (c) => <StatusBadge status={c.status} /> },
    { key: "plan", label: "Plan", type: "string", render: (c) => c.plan?.name ?? <span className="text-axzy-slate">Sin plan</span> },
    {
      key: "nextDueDate",
      label: "Siguiente pago",
      type: "string",
      render: (c) =>
        c.nextDueDate ? (
          <span className={c.overdue ? "font-semibold text-red-700 dark:text-red-400" : ""}>
            {dateText(c.nextDueDate)}
            {c.overdue && " · vencido"}
          </span>
        ) : (
          <span className="text-axzy-slate">Al corriente</span>
        ),
    },
    {
      key: "lastSeenAt",
      label: "Licencias",
      type: "string",
      render: (c) => (c.devices.active === 0 ? <span className="text-amber-800 dark:text-amber-400">Sin activar</span> : agoText(c.lastSeenAt)),
    },
  ];

  const filterOptions = [{ value: "", label: "Todos los productos" }, ...products.map((p) => ({ value: p.id, label: p.name }))];

  return (
    <ITPage
      title="Clientes"
      description={rows ? `${rows.length} cliente(s)` : undefined}
      icon={<LuUsers size={20} />}
      loading={rows === null && !error}
      error={error || undefined}
      onRetry={load}
      actions={
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-56">
            <ITSelect
              name="producto"
              label="Producto"
              size="sm"
              value={productFilter}
              placeholder="Todos los productos"
              options={filterOptions}
              onChange={(e) => {
                if (e.target.value) params.set("producto", e.target.value);
                else params.delete("producto");
                setParams(params);
              }}
            />
          </div>
          <ITButton icon={<LuPlus size={14} />} onClick={openCreate} disabled={activeProducts.length === 0}>
            Nuevo cliente
          </ITButton>
        </div>
      }
    >
      {rows && rows.length === 0 ? (
        <ITEmptyState
          icon={<LuUsers size={32} />}
          title={productFilter ? "Sin clientes en este producto" : "Todavía no hay clientes"}
          description={activeProducts.length === 0 ? "Primero da de alta un producto." : "Da de alta el primero."}
          action={
            activeProducts.length === 0 ? (
              <ITButton onClick={() => navigate("/productos")}>Ir a productos</ITButton>
            ) : (
              <ITButton onClick={openCreate}>Nuevo cliente</ITButton>
            )
          }
        />
      ) : (
        rows && (
          <ITTable
            columns={columns as unknown as Column<Record<string, unknown>>[]}
            data={rows as unknown as Record<string, unknown>[]}
            onRowClick={(row) => navigate(`/clientes/${(row as unknown as ClientSummary).id}`)}
            defaultItemsPerPage={25}
            itemsPerPageOptions={[25, 50, 100]}
          />
        )
      )}

      <ITDialog isOpen={creating} onClose={closeCreate} title="Nuevo cliente">
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2" noValidate>
          {formError && (
            <div className="sm:col-span-2">
              <ITAlert variant="error">{formError}</ITAlert>
            </div>
          )}
          <ITSelect
            name="productId"
            label="Producto"
            required
            value={form.productId}
            options={activeProducts.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(e) => setForm({ ...form, productId: e.target.value, planId: "" })}
          />
          <ITSelect
            name="planId"
            label="Plan"
            placeholder="Sin plan"
            value={form.planId}
            options={[{ value: "", label: "Sin plan" }, ...productPlans.map((p) => ({ value: p.id, label: `${p.name} · ${money(p.monthlyPrice)}/mes` }))]}
            onChange={(e) => setForm({ ...form, planId: e.target.value })}
          />
          <div className="sm:col-span-2">
            <ITInput name="name" label="Nombre del cliente" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </div>
          <ITInput name="contactName" label="Contacto" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          <ITInput name="phone" label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div className="sm:col-span-2">
            <ITInput name="email" type="email" label="Correo" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <ITButton type="button" variant="outlined" color="gray" onClick={closeCreate}>
              Cancelar
            </ITButton>
            <ITButton type="submit" disabled={busy || form.name.trim().length < 2 || !form.productId}>
              {busy ? "Guardando…" : "Dar de alta"}
            </ITButton>
          </div>
        </form>
      </ITDialog>
    </ITPage>
  );
}
