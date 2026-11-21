import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ITBadget,
  ITBentoPill,
  ITBentoPillRow,
  ITBentoStatStrip,
  ITButton,
  ITCard,
  ITEmptyState,
  ITInput,
  ITPage,
  ITText,
} from "@axzydev/axzy_ui_system";
import { LuBoxes, LuPlus } from "react-icons/lu";
import { api, type Product } from "../api";
import { useNotify } from "../toast";
import { CountUp, SectionTitle, errorOf } from "../shared";

const EMPTY = { key: "", name: "", description: "" };
const TONES = ["primary", "info", "success", "ternary"] as const;

export default function Products() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [keyTouched, setKeyTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError("");
    api<Product[]>("GET", "/products").then(setProducts).catch((e) => setError(errorOf(e)));
  }, []);
  useEffect(load, [load]);

  const keyFrom = (name: string) =>
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("POST", "/products", form);
      notify(`${form.name} agregado`);
      setForm(EMPTY);
      setKeyTouched(false);
      load();
    } catch (err) {
      notify(errorOf(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (p: Product) => {
    try {
      await api("PATCH", `/products/${p.id}`, { active: !p.active });
      notify(p.active ? `${p.name} dado de baja` : `${p.name} reactivado`);
      load();
    } catch (err) {
      notify(errorOf(err), "error");
    }
  };

  const stats = useMemo(() => {
    const all = products ?? [];
    return {
      total: all.length,
      active: all.filter((p) => p.active).length,
      clients: all.reduce((sum, p) => sum + (p.clients ?? 0), 0),
      plans: all.reduce((sum, p) => sum + (p.plans ?? 0), 0),
    };
  }, [products]);

  return (
    <ITPage
      title="Productos"
      description="Lo que vendes. Cada cliente y cada plan pertenecen a un producto."
      icon={<LuBoxes size={20} />}
      loading={products === null && !error}
      error={error || undefined}
      onRetry={load}
      actions={
        <ITButton icon={<LuPlus size={14} />} onClick={() => navigate("/planes")}>
          Ver planes
        </ITButton>
      }
    >
      <div className="flex flex-col gap-6">
        <ITBentoStatStrip
          items={[
            { id: "all", label: "Productos", value: <CountUp value={stats.total} />, caption: "en catálogo", color: "var(--color-primary)", tone: "plain" },
            { id: "active", label: "Activos", value: <CountUp value={stats.active} />, caption: "a la venta", color: "var(--color-success)", tone: "mint" },
            { id: "clients", label: "Clientes", value: <CountUp value={stats.clients} />, caption: "en todos", color: "var(--color-info)", tone: "lavender" },
            { id: "plans", label: "Planes", value: <CountUp value={stats.plans} />, caption: "en todos", color: "var(--color-warning)", tone: "sun" },
          ]}
        />

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section aria-labelledby="lista-productos">
            <SectionTitle id="lista-productos" eyebrow="Catálogo" title="Tus productos" />
            {products && products.length === 0 ? (
              <ITEmptyState
                icon={<LuBoxes size={32} />}
                title="Todavía no hay productos"
                description="Da de alta el primero para poder venderlo y crearle planes."
              />
            ) : (
              <div className="axc-stagger grid content-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {(products ?? []).map((p, i) => (
                  <ITCard
                    key={p.id}
                    tone={TONES[i % TONES.length]}
                    title={p.name}
                    headerActions={!p.active ? <ITBadget color="gray" size="sm" label="Dado de baja" /> : undefined}
                    actions={
                      <>
                        <ITButton size="sm" variant="outlined" onClick={() => navigate(`/clientes?producto=${p.id}`)}>
                          Ver clientes
                        </ITButton>
                        <ITButton size="sm" variant="text" color="gray" onClick={() => void toggle(p)}>
                          {p.active ? "Dar de baja" : "Reactivar"}
                        </ITButton>
                      </>
                    }
                  >
                    <p className="font-mono text-xs text-axzy-slate dark:text-axzy-mist">{p.key}</p>
                    {p.description && (
                      <ITText muted className="mt-2 line-clamp-2 block text-sm">
                        {p.description}
                      </ITText>
                    )}
                    <ITBentoPillRow className="mt-3">
                      <ITBentoPill dot="var(--color-info)">{p.clients ?? 0} cliente(s)</ITBentoPill>
                      <ITBentoPill dot="var(--color-warning)">{p.plans ?? 0} plan(es)</ITBentoPill>
                    </ITBentoPillRow>
                  </ITCard>
                ))}
              </div>
            )}
          </section>

          <ITCard title="Nuevo producto" tone="ternary" className="self-start">
            <form onSubmit={create} className="flex flex-col gap-4" noValidate>
              <ITInput
                name="name"
                label="Nombre"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value, key: keyTouched ? form.key : keyFrom(e.target.value) })}
                required
              />
              <div>
                <ITInput
                  name="key"
                  label="Clave"
                  value={form.key}
                  onChange={(e) => {
                    setKeyTouched(true);
                    setForm({ ...form, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") });
                  }}
                  required
                  className="font-mono"
                />
                <ITText muted className="mt-1 block text-xs">La usan las apps; no se cambia después.</ITText>
              </div>
              <ITInput
                name="description"
                type="textarea"
                rows={3}
                label="Descripción"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <ITButton
                type="submit"
                icon={<LuPlus size={14} />}
                disabled={busy || form.name.trim().length < 2 || form.key.length < 2}
              >
                {busy ? "Guardando…" : "Agregar producto"}
              </ITButton>
            </form>
          </ITCard>
        </div>
      </div>
    </ITPage>
  );
}
