import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ITAlert,
  ITBentoStatStrip,
  ITButton,
  ITDialog,
  ITEmptyState,
  ITInput,
  ITPage,
  ITSelect,
  ITSegmentedControl,
  ITTable,
  type Column,
} from "@axzydev/axzy_ui_system";
import { LuPlus, LuSearch, LuUsers } from "react-icons/lu";
import {
  agoText,
  api,
  dateText,
  planPrice,
  type ClientDetail,
  type ClientSummary,
  type Plan,
  type Product,
} from "../api";
import { useNotify } from "../toast";
import { BillingTypeBadge, CountUp, SectionTitle, StatusBadge, errorOf } from "../shared";

const EMPTY = { productId: "", name: "", contactName: "", phone: "", email: "", planId: "" };

type StatusFilter = "" | "ACTIVE" | "SUSPENDED" | "OVERDUE";

export default function Clients() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [params, setParams] = useSearchParams();
  const productFilter = params.get("producto") ?? "";
  const [rows, setRows] = useState<ClientSummary[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
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

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (rows ?? []).filter((c) => {
      if (statusFilter === "OVERDUE" && !c.overdue) return false;
      if (statusFilter === "ACTIVE" && c.status !== "ACTIVE") return false;
      if (statusFilter === "SUSPENDED" && c.status !== "SUSPENDED") return false;
      if (!text) return true;
      return [c.name, c.contactName, c.phone, c.email, c.product.name, c.plan?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text));
    });
  }, [rows, search, statusFilter]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      total: all.length,
      active: all.filter((c) => c.status === "ACTIVE").length,
      suspended: all.filter((c) => c.status === "SUSPENDED").length,
      overdue: all.filter((c) => c.overdue).length,
    };
  }, [rows]);

  const columns: Column<ClientSummary>[] = [
    {
      key: "name",
      label: "Cliente",
      type: "string",
      render: (c) => (
        <span>
          <span className="block font-semibold">{c.name}</span>
          <span className="block text-xs text-axzy-slate dark:text-axzy-mist">
            {c.contactName || c.phone || c.email || "Sin contacto"}
          </span>
        </span>
      ),
    },
    { key: "product", label: "Producto", type: "string", render: (c) => c.product.name },
    { key: "status", label: "Estado", type: "string", render: (c) => <StatusBadge status={c.status} /> },
    {
      key: "plan",
      label: "Plan",
      type: "string",
      render: (c) =>
        c.plan ? (
          <span className="block">
            <span className="block font-medium">{c.plan.name}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <BillingTypeBadge type={c.plan.billingType} />
              <span className="text-xs text-axzy-slate dark:text-axzy-mist">{planPrice(c.plan)}</span>
            </span>
          </span>
        ) : (
          <span className="text-axzy-slate">Sin plan</span>
        ),
    },
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
      render: (c) =>
        c.devices.active === 0 ? (
          <span className="font-medium text-amber-800 dark:text-amber-400">Sin activar</span>
        ) : (
          <span>
            {c.devices.active} activa{c.devices.active === 1 ? "" : "s"}
            <span className="block text-xs text-axzy-slate dark:text-axzy-mist">{agoText(c.lastSeenAt)}</span>
          </span>
        ),
    },
  ];

  return (
    <ITPage
      title="Clientes"
      description="Filtra por producto o estado y entra al detalle para ver licencias y cobros."
      icon={<LuUsers size={20} />}
      loading={rows === null && !error}
      error={error || undefined}
      onRetry={load}
      actions={
        <ITButton icon={<LuPlus size={14} />} onClick={openCreate} disabled={activeProducts.length === 0}>
          Nuevo cliente
        </ITButton>
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
          <div className="flex flex-col gap-5">
            <ITBentoStatStrip
              items={[
                {
                  id: "all",
                  label: "Clientes",
                  value: <CountUp value={counts.total} />,
                  caption: productFilter ? "en el producto" : "en total",
                  color: "var(--color-primary)",
                  tone: "plain",
                },
                {
                  id: "active",
                  label: "Activos",
                  value: <CountUp value={counts.active} />,
                  caption: "al corriente",
                  color: "var(--color-success)",
                  tone: "mint",
                },
                {
                  id: "suspended",
                  label: "Suspendidos",
                  value: <CountUp value={counts.suspended} />,
                  caption: "apps bloqueadas",
                  color: "var(--color-danger)",
                  tone: "lavender",
                },
                {
                  id: "overdue",
                  label: "Con pago vencido",
                  value: <CountUp value={counts.overdue} />,
                  caption: "por cobrar",
                  color: "var(--color-warning)",
                  tone: "sun",
                },
              ]}
              onSelect={(id) => setStatusFilter(id === "all" ? "" : (id as StatusFilter))}
            />

            <section aria-labelledby="lista-clientes">
              <SectionTitle
                id="lista-clientes"
                eyebrow="Cartera"
                title="Lista de clientes"
                description={filtered.length === (rows ?? []).length ? `${filtered.length} cliente(s)` : `${filtered.length} de ${rows.length} cliente(s)`}
              />
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div className="max-w-full overflow-x-auto pb-1">
                  <ITSegmentedControl
                    size="sm"
                    options={[
                      { value: "", label: "Todos" },
                      ...activeProducts.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                    value={productFilter}
                    onChange={(value) => {
                      if (value) params.set("producto", value);
                      else params.delete("producto");
                      setParams(params);
                    }}
                  />
                </div>
                <div className="w-full md:w-72">
                  <ITInput
                    name="buscar"
                    size="sm"
                    placeholder="Buscar nombre, contacto o teléfono"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    iconLeft={<LuSearch size={14} />}
                  />
                </div>
              </div>

              {filtered.length === 0 ? (
                <ITEmptyState
                  icon={<LuSearch size={28} />}
                  title="Sin resultados"
                  description="Prueba con otro término o quita los filtros."
                  action={
                    <ITButton
                      variant="outlined"
                      onClick={() => {
                        setSearch("");
                        setStatusFilter("");
                        params.delete("producto");
                        setParams(params);
                      }}
                    >
                      Limpiar filtros
                    </ITButton>
                  }
                />
              ) : (
                <ITTable
                  columns={columns as unknown as Column<Record<string, unknown>>[]}
                  data={filtered as unknown as Record<string, unknown>[]}
                  onRowClick={(row) => navigate(`/clientes/${(row as unknown as ClientSummary).id}`)}
                  defaultItemsPerPage={25}
                  itemsPerPageOptions={[25, 50, 100]}
                  autoCardBreakpoint={760}
                  renderCard={(row) => {
                    const c = row as unknown as ClientSummary;
                    return (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{c.name}</p>
                            <p className="text-xs text-axzy-slate dark:text-axzy-mist">{c.product.name}</p>
                          </div>
                          <StatusBadge status={c.status} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium">{c.plan?.name ?? "Sin plan"}</span>
                          {c.plan && <BillingTypeBadge type={c.plan.billingType} />}
                          {c.plan && <span className="text-axzy-slate dark:text-axzy-mist">{planPrice(c.plan)}</span>}
                        </div>
                        <div className="flex flex-wrap justify-between gap-2 text-xs">
                          <span className={c.overdue ? "font-semibold text-red-700 dark:text-red-400" : ""}>
                            Próximo pago: {dateText(c.nextDueDate)}
                            {c.overdue && " · vencido"}
                          </span>
                          <span>
                            {c.devices.active === 0
                              ? "Sin licencia activa"
                              : `${c.devices.active} licencia${c.devices.active === 1 ? "" : "s"}`}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
              )}
            </section>
          </div>
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
            options={[
              { value: "", label: "Sin plan" },
              ...productPlans.map((p) => ({ value: p.id, label: `${p.name} · ${planPrice(p)}` })),
            ]}
            onChange={(e) => setForm({ ...form, planId: e.target.value })}
          />
          <div className="sm:col-span-2">
            <ITInput name="name" label="Nombre del cliente" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </div>
          <ITInput name="contactName" label="Contacto" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          <ITInput name="phone" label="Teléfono (WhatsApp)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
