import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ITBadget, ITButton, ITCard, ITInput, ITPage, ITText } from "@axzydev/axzy_ui_system";
import { LuBoxes } from "react-icons/lu";
import { api, type Product } from "../api";
import { useNotify } from "../toast";
import { errorOf } from "../shared";

const EMPTY = { key: "", name: "", description: "" };

export default function Products() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [keyTouched, setKeyTouched] = useState(false);

  const load = useCallback(() => {
    setError("");
    api<Product[]>("GET", "/products").then(setProducts).catch((e) => setError(errorOf(e)));
  }, []);
  useEffect(load, [load]);

  const keyFrom = (name: string) =>
    name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("POST", "/products", form);
      notify(`${form.name} agregado`);
      setForm(EMPTY);
      setKeyTouched(false);
      load();
    } catch (err) {
      notify(errorOf(err), "error");
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

  return (
    <ITPage
      title="Productos"
      description="Lo que vendes. Cada cliente y cada plan pertenecen a un producto."
      icon={<LuBoxes size={20} />}
      loading={products === null && !error}
      error={error || undefined}
      onRetry={load}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-4 md:grid-cols-2">
          {products?.map((p) => (
            <ITCard key={p.id} title={p.name}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-axzy-slate dark:text-axzy-mist">{p.key}</span>
                {!p.active && <ITBadget color="gray" size="sm" label="Dado de baja" />}
              </div>
              {p.description && <ITText muted className="mt-2 block text-sm">{p.description}</ITText>}
              <p className="mt-3 text-sm">
                <strong className="tabular-nums">{p.clients ?? 0}</strong> cliente(s) · <strong className="tabular-nums">{p.plans ?? 0}</strong> plan(es)
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ITButton size="sm" variant="outlined" onClick={() => navigate(`/clientes?producto=${p.id}`)}>Ver clientes</ITButton>
                <ITButton size="sm" variant="text" color="gray" onClick={() => void toggle(p)}>{p.active ? "Dar de baja" : "Reactivar"}</ITButton>
              </div>
            </ITCard>
          ))}
        </div>

        <ITCard title="Nuevo producto">
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
            <ITInput name="description" type="textarea" rows={2} label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <ITButton type="submit" disabled={form.name.trim().length < 2 || form.key.length < 2}>Agregar producto</ITButton>
          </form>
        </ITCard>
      </div>
    </ITPage>
  );
}
