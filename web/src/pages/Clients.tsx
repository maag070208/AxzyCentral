import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ITAlert, ITButton, ITConfirmDialog, ITDialog, ITInput, ITSelect, ITSegmentedControl } from "@axzydev/axzy_ui_system";
import {
  LuAlarmClock,
  LuArrowUpRight,
  LuBan,
  LuCircleCheck,
  LuPlus,
  LuSearch,
  LuUserCheck,
  LuUsers,
  LuUserX,
  LuWallet,
} from "react-icons/lu";
import {
  agoText,
  api,
  dateText,
  planPrice,
  type ClientDetail,
  type ClientSummary,
  type Plan,
  type Product,
  type Status,
} from "../api";
import QuickPayDialog from "../components/QuickPayDialog";
import { useNotify } from "../toast";
import { BillingTypeBadge, CountUp, StatusBadge, errorOf } from "../shared";
import { Card, Empty, IconAction, Initials, Page, StatCard, TableWrap, Td, Th } from "../ui";

const EMPTY = { productId: "", name: "", contactName: "", phone: "", email: "", planId: "" };

type StatusFilter = "" | "ACTIVE" | "SUSPENDED" | "OVERDUE";

/** Acción con texto de la fila: el cobro es la acción primaria de la cartera. */
function CobrarAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 text-[12px] font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950"
    >
      <LuWallet size={13} />
      Cobrar
    </button>
  );
}

/** Par etiqueta/valor de la tarjeta móvil. */
function MiniField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">{label}</p>
      <div className="mt-0.5 text-[12.5px] text-slate-700 dark:text-slate-200">{children}</div>
    </div>
  );
}

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
  const [payClient, setPayClient] = useState<ClientSummary | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<ClientSummary | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

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
  const defaultProduct =
    productFilter || activeProducts.find((p) => p.key === "TAQUERIA")?.id || activeProducts[0]?.id || "";

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

  const applyStatus = async (client: ClientSummary, next: Status) => {
    setStatusBusy(client.id);
    try {
      await api<ClientDetail>("PATCH", `/clients/${client.id}`, { status: next });
      notify(next === "ACTIVE" ? `${client.name} reactivado` : `${client.name} suspendido`);
      load();
    } catch (e) {
      notify(errorOf(e), "error");
    } finally {
      setStatusBusy(null);
    }
  };

  const toggleStatus = (client: ClientSummary) => {
    if (client.status === "ACTIVE") setConfirmStatus(client);
    else void applyStatus(client, "ACTIVE");
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    if (params.get("producto")) {
      params.delete("producto");
      setParams(params, { replace: true });
    }
  };

  const filtersActive = Boolean(search.trim()) || statusFilter !== "" || productFilter !== "";

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

  const openDetail = (client: ClientSummary) => navigate(`/clientes/${client.id}`);

  const nextPayment = (c: ClientSummary) =>
    c.nextDueDate ? (
      <span className={c.overdue ? "font-semibold text-rose-700 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"}>
        {dateText(c.nextDueDate)}
        {c.overdue && <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">Vencido</span>}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
        <LuCircleCheck size={13} /> Al corriente
      </span>
    );

  const licenses = (c: ClientSummary) =>
    c.devices.active === 0 ? (
      <span className="font-medium text-amber-700 dark:text-amber-400">Sin activar</span>
    ) : (
      <span className="block">
        <span className="font-medium text-slate-800 dark:text-slate-100">
          {c.devices.active} de {c.devices.total}
        </span>
        <span className="mt-0.5 block text-[11.5px] text-slate-500 dark:text-slate-400">{agoText(c.lastSeenAt)}</span>
      </span>
    );

  return (
    <Page
      eyebrow="Cartera"
      title="Clientes"
      description="Toda la cartera en una tabla: filtra por producto o estado, cobra sin salir de la fila y entra al detalle para licencias y QR."
      actions={
        <ITButton icon={<LuPlus size={14} />} onClick={openCreate} disabled={activeProducts.length === 0}>
          Nuevo cliente
        </ITButton>
      }
      loading={rows === null && !error}
      error={error || null}
      onRetry={load}
    >
      {rows !== null &&
        (rows.length === 0 ? (
          <Empty
            title={productFilter ? "Sin clientes en este producto" : "Todavía no hay clientes"}
            description={activeProducts.length === 0 ? "Primero da de alta un producto." : "Da de alta el primero para empezar a cobrar."}
            action={
              activeProducts.length === 0 ? (
                <ITButton onClick={() => navigate("/productos")}>Ir a productos</ITButton>
              ) : (
                <ITButton icon={<LuPlus size={14} />} onClick={openCreate}>
                  Nuevo cliente
                </ITButton>
              )
            }
          />
        ) : (
          <div className="flex flex-col gap-4 lg:gap-5">
            <div className="axc-stagger grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatCard
                label="Todos"
                value={<CountUp value={counts.total} />}
                hint="clientes en cartera"
                icon={<LuUsers size={16} />}
                tone="navy"
                active={statusFilter === ""}
                onClick={() => setStatusFilter("")}
              />
              <StatCard
                label="Activos"
                value={<CountUp value={counts.active} />}
                hint="apps habilitadas"
                icon={<LuUserCheck size={16} />}
                tone="green"
                active={statusFilter === "ACTIVE"}
                onClick={() => setStatusFilter(statusFilter === "ACTIVE" ? "" : "ACTIVE")}
              />
              <StatCard
                label="Suspendidos"
                value={<CountUp value={counts.suspended} />}
                hint="apps bloqueadas"
                icon={<LuUserX size={16} />}
                tone="red"
                active={statusFilter === "SUSPENDED"}
                onClick={() => setStatusFilter(statusFilter === "SUSPENDED" ? "" : "SUSPENDED")}
              />
              <StatCard
                label="Vencidos"
                value={<CountUp value={counts.overdue} />}
                hint="con pago pendiente vencido"
                icon={<LuAlarmClock size={16} />}
                tone="amber"
                active={statusFilter === "OVERDUE"}
                onClick={() => setStatusFilter(statusFilter === "OVERDUE" ? "" : "OVERDUE")}
              />
            </div>

            <Card
              title="Cartera de clientes"
              subtitle={
                filtered.length === (rows ?? []).length
                  ? `${filtered.length} cliente${filtered.length === 1 ? "" : "s"}`
                  : `${filtered.length} de ${rows.length} cliente${rows.length === 1 ? "" : "s"}`
              }
              actions={
                filtersActive && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  >
                    Limpiar filtros
                  </button>
                )
              }
              bodyClassName="p-0"
              className="axc-rise"
            >
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between xl:px-5">
                <div className="min-w-0 overflow-x-auto pb-1 xl:pb-0">
                  <ITSegmentedControl
                    size="sm"
                    options={[{ value: "", label: "Todos" }, ...activeProducts.map((p) => ({ value: p.id, label: p.name }))]}
                    value={productFilter}
                    onChange={(value) => {
                      if (value) params.set("producto", value);
                      else params.delete("producto");
                      setParams(params);
                    }}
                  />
                </div>
                <div className="flex w-full items-center gap-2 xl:w-auto">
                  <div className="min-w-0 flex-1 xl:w-80 xl:flex-none">
                    <ITInput
                      name="buscar"
                      size="sm"
                      placeholder="Buscar nombre, contacto o teléfono"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      iconLeft={<LuSearch size={14} />}
                    />
                  </div>
                  <span
                    className="hidden shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.08em] text-slate-500 sm:inline-flex dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                    title="Clientes visibles / total"
                  >
                    {filtered.length} / {rows.length}
                  </span>
                </div>
              </div>

              {filtered.length === 0 ? (
                <Empty
                  title="Sin resultados"
                  description="Prueba con otro término o quita los filtros."
                  action={
                    <ITButton variant="outlined" onClick={clearFilters}>
                      Limpiar filtros
                    </ITButton>
                  }
                />
              ) : (
                <>
                  {/* Tabla full-width (escritorio) */}
                  <div className="hidden lg:block">
                    <TableWrap>
                      <thead className="bg-slate-50/80 dark:bg-slate-800/40">
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                          <Th className="pl-4 sm:pl-5">Cliente</Th>
                          <Th>Producto</Th>
                          <Th>Plan</Th>
                          <Th>Próximo pago</Th>
                          <Th>Licencias</Th>
                          <Th>Estado</Th>
                          <Th className="pr-4 text-right sm:pr-5">Acciones</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((c) => (
                          <tr
                            key={c.id}
                            onClick={() => openDetail(c)}
                            className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/40"
                          >
                            <Td className="pl-4 sm:pl-5">
                              <div className="flex min-w-0 items-center gap-3">
                                <Initials name={c.name} />
                                <div className="min-w-0">
                                  <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">{c.name}</p>
                                  <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                                    {c.contactName || c.phone || c.email || "Sin contacto"}
                                  </p>
                                </div>
                              </div>
                            </Td>
                            <Td>
                              <span className="font-medium text-slate-800 dark:text-slate-100">{c.product.name}</span>
                            </Td>
                            <Td>
                              {c.plan ? (
                                <div className="flex flex-col gap-1">
                                  <span className="font-medium text-slate-800 dark:text-slate-100">{c.plan.name}</span>
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    <BillingTypeBadge type={c.plan.billingType} />
                                    <span className="text-[11.5px] text-slate-500 dark:text-slate-400">{planPrice(c.plan)}</span>
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500">Sin plan</span>
                              )}
                            </Td>
                            <Td>{nextPayment(c)}</Td>
                            <Td>{licenses(c)}</Td>
                            <Td>
                              <StatusBadge status={c.status} />
                            </Td>
                            <Td className="pr-4 sm:pr-5">
                              <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <CobrarAction label={`Cobrar a ${c.name}`} onClick={() => setPayClient(c)} />
                                <IconAction label={`Abrir ${c.name}`} onClick={() => openDetail(c)}>
                                  <LuArrowUpRight size={14} />
                                </IconAction>
                                <IconAction
                                  label={c.status === "ACTIVE" ? `Suspender ${c.name}` : `Reactivar ${c.name}`}
                                  tone={c.status === "ACTIVE" ? "danger" : "success"}
                                  disabled={statusBusy === c.id}
                                  onClick={() => toggleStatus(c)}
                                >
                                  {c.status === "ACTIVE" ? <LuBan size={14} /> : <LuCircleCheck size={14} />}
                                </IconAction>
                              </div>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </TableWrap>
                  </div>

                  {/* Tarjetas (móvil) */}
                  <div className="divide-y divide-slate-100 lg:hidden dark:divide-slate-800">
                    {filtered.map((c) => (
                      <article key={c.id} className="flex flex-col gap-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <Initials name={c.name} />
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">{c.name}</p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {c.contactName || c.phone || c.email || "Sin contacto"}
                              </p>
                            </div>
                          </div>
                          <StatusBadge status={c.status} />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <MiniField label="Producto">{c.product.name}</MiniField>
                          <MiniField label="Plan">
                            {c.plan ? (
                              <span className="flex flex-wrap items-center gap-1.5">
                                {c.plan.name}
                                <BillingTypeBadge type={c.plan.billingType} />
                              </span>
                            ) : (
                              "Sin plan"
                            )}
                          </MiniField>
                          <MiniField label="Próximo pago">{nextPayment(c)}</MiniField>
                          <MiniField label="Licencias">{licenses(c)}</MiniField>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <ITButton size="sm" variant="outlined" icon={<LuWallet size={13} />} onClick={() => setPayClient(c)}>
                            Cobrar
                          </ITButton>
                          <ITButton size="sm" variant="outlined" color="gray" icon={<LuArrowUpRight size={13} />} onClick={() => openDetail(c)}>
                            Abrir
                          </ITButton>
                          <ITButton
                            size="sm"
                            variant="text"
                            color={c.status === "ACTIVE" ? "danger" : "success"}
                            icon={c.status === "ACTIVE" ? <LuBan size={13} /> : <LuCircleCheck size={13} />}
                            disabled={statusBusy === c.id}
                            onClick={() => toggleStatus(c)}
                          >
                            {c.status === "ACTIVE" ? "Suspender" : "Reactivar"}
                          </ITButton>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </div>
        ))}

      <ITDialog isOpen={creating} onClose={closeCreate} title="Nuevo cliente" className="w-[min(96vw,780px)]">
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
            options={[{ value: "", label: "Sin plan" }, ...productPlans.map((p) => ({ value: p.id, label: `${p.name} · ${planPrice(p)}` }))]}
            onChange={(e) => setForm({ ...form, planId: e.target.value })}
          />
          <div className="sm:col-span-2">
            <ITInput
              name="name"
              label="Nombre del cliente"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </div>
          <ITInput name="contactName" label="Contacto" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          <ITInput name="phone" label="Teléfono (WhatsApp)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div className="sm:col-span-2">
            <ITInput name="email" type="email" label="Correo" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Al dar de alta te llevamos al detalle para cargar su primer cobro o generar su QR.
            </p>
            <div className="flex justify-end gap-2">
              <ITButton type="button" variant="outlined" color="gray" onClick={closeCreate}>
                Cancelar
              </ITButton>
              <ITButton type="submit" icon={<LuPlus size={14} />} disabled={busy || form.name.trim().length < 2 || !form.productId}>
                {busy ? "Guardando…" : "Dar de alta"}
              </ITButton>
            </div>
          </div>
        </form>
      </ITDialog>

      <QuickPayDialog
        isOpen={payClient !== null}
        clientId={payClient?.id ?? null}
        clientName={payClient?.name}
        onClose={() => setPayClient(null)}
        onChanged={load}
      />

      <ITConfirmDialog
        isOpen={confirmStatus !== null}
        onClose={() => setConfirmStatus(null)}
        onConfirm={() => {
          if (confirmStatus) void applyStatus(confirmStatus, "SUSPENDED");
          setConfirmStatus(null);
        }}
        title={`¿Suspender a ${confirmStatus?.name ?? "este cliente"}?`}
        message="Su app queda bloqueada hasta que lo reactives. Los cobros y licencias se conservan."
        confirmLabel="Suspender"
        cancelLabel="Cancelar"
        variant="danger"
      />
    </Page>
  );
}
