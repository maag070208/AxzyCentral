import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ITBadget, ITButton, ITCheckbox, ITDialog, ITInput, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { LuBoxes, LuDownload, LuLayers, LuPencil, LuPlus, LuTags, LuUsers } from "react-icons/lu";
import {
  api,
  getIconSet,
  listIconSets,
  pngSrc,
  type GiroFeatures,
  type GiroTerms,
  type IconSetFull,
  type IconSetSummary,
  type Product,
} from "../api";
import { useNotify } from "../toast";
import { CountUp, errorOf } from "../shared";
import { Card, Empty, Page, StatCard } from "../ui";

const EMPTY = { key: "", name: "", description: "" };

/** Lo que la app usa cuando el giro no dice nada: la taquería de siempre. */
const TERM_FIELDS: { key: keyof GiroTerms; label: string; placeholder: string }[] = [
  { key: "kitchenRole", label: "Quien prepara", placeholder: "Taquero" },
  { key: "waiterRole", label: "Quien toma la orden", placeholder: "Mesero" },
  { key: "item", label: "La pieza", placeholder: "Taco" },
  { key: "kitchen", label: "Dónde se prepara", placeholder: "Cocina" },
];
const FEATURE_FIELDS: { key: keyof GiroFeatures; label: string; hint: string }[] = [
  { key: "mixes", label: "Mixtos", hint: "Un producto con varias carnes (campechano)" },
  { key: "meatColors", label: "Color de carne", hint: "Barra de color por carne en el ticket" },
  { key: "freeExtras", label: "Extras sin costo", hint: "Cebollitas, chiles, salsas por persona" },
];

const TONE = [
  "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
];

export default function Products() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [keyTouched, setKeyTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState<Product | null>(null);
  const [release, setRelease] = useState({ versionCode: "", versionName: "", url: "", notes: "" });
  const [iconSets, setIconSets] = useState<IconSetSummary[]>([]);
  const [previews, setPreviews] = useState<Record<string, IconSetFull>>({});
  const [editingGiro, setEditingGiro] = useState<Product | null>(null);
  const [giro, setGiro] = useState<{ terms: GiroTerms; features: GiroFeatures; iconSetId: string }>({ terms: {}, features: {}, iconSetId: "" });

  const load = useCallback(() => {
    setError("");
    api<Product[]>("GET", "/products")
      .then(setProducts)
      .catch((e) => setError(errorOf(e)));
  }, []);
  useEffect(load, [load]);

  // Vista previa: los primeros iconos (y el ícono de app) de cada set asignado.
  useEffect(() => {
    const ids = [...new Set((products ?? []).map((p) => p.iconSet?.id).filter((id): id is string => Boolean(id)))];
    ids.forEach((id) => {
      getIconSet(id, 6)
        .then((set) => setPreviews((prev) => ({ ...prev, [id]: set })))
        .catch(() => undefined);
    });
  }, [products]);

  const openGiro = (p: Product) => {
    setGiro({ terms: { ...(p.terms ?? {}) }, features: { ...(p.features ?? {}) }, iconSetId: p.iconSet?.id ?? "" });
    setEditingGiro(p);
    listIconSets().then(setIconSets).catch(() => undefined);
  };

  const saveGiro = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingGiro) return;
    setBusy(true);
    try {
      const terms = Object.fromEntries(
        Object.entries(giro.terms)
          .map(([k, v]) => [k, (v ?? "").trim()])
          .filter(([, v]) => v !== "")
      );
      await api("PATCH", `/products/${editingGiro.id}`, { terms, features: giro.features, iconSetId: giro.iconSetId || null });
      notify(`${editingGiro.name} actualizado: las apps lo toman en su siguiente revisión`);
      setEditingGiro(null);
      load();
    } catch (err) {
      notify(errorOf(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const keyFrom = (name: string) =>
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);

  const openCreate = () => {
    setForm(EMPTY);
    setKeyTouched(false);
    setCreating(true);
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("POST", "/products", form);
      notify(`${form.name} agregado`);
      setCreating(false);
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

  const openPublish = (p: Product) => {
    const l = p.latestApp;
    setRelease({
      versionCode: l ? String(l.versionCode + 1) : "",
      versionName: l?.versionName ?? "",
      url: l?.url ?? "",
      notes: "",
    });
    setPublishing(p);
  };

  const saveRelease = async (latestApp: Product["latestApp"]) => {
    if (!publishing) return;
    setBusy(true);
    try {
      await api("PATCH", `/products/${publishing.id}`, { latestApp });
      notify(latestApp ? `Versión ${latestApp.versionName} publicada: las apps avisarán` : "Aviso de versión quitado");
      setPublishing(null);
      load();
    } catch (err) {
      notify(errorOf(err), "error");
    } finally {
      setBusy(false);
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
    <Page
      eyebrow="Catálogo"
      title="Productos"
      description="Lo que vendes y lo que agrupa a tus clientes y planes. La clave no cambia: las apps la usan para identificarse."
      actions={
        <>
          <ITButton variant="outlined" icon={<LuTags size={15} />} onClick={() => navigate("/planes")}>
            Ver planes
          </ITButton>
          <ITButton icon={<LuPlus size={15} />} onClick={openCreate}>
            Nuevo producto
          </ITButton>
        </>
      }
      loading={products === null && !error}
      error={error || null}
      onRetry={load}
    >
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Productos" value={<CountUp value={stats.total} />} hint="en catálogo" icon={<LuBoxes size={16} />} tone="teal" />
        <StatCard label="Activos" value={<CountUp value={stats.active} />} hint="a la venta" icon={<LuLayers size={16} />} tone="green" />
        <StatCard label="Clientes" value={<CountUp value={stats.clients} />} hint="en todos los productos" icon={<LuUsers size={16} />} tone="amber" />
        <StatCard label="Planes" value={<CountUp value={stats.plans} />} hint="en todos los productos" icon={<LuTags size={16} />} tone="violet" />
      </div>

      {products && products.length === 0 ? (
        <Card bodyClassName="p-5">
          <Empty
            title="Todavía no hay productos"
            description="Da de alta el primero para poder venderlo y crearle planes."
            action={<ITButton onClick={openCreate}>Nuevo producto</ITButton>}
          />
        </Card>
      ) : (
        <div className="axc-stagger grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {(products ?? []).map((p, i) => (
            <Card key={p.id} bodyClassName="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {p.iconSet && (previews[p.iconSet.id]?.appIcon || previews[p.iconSet.id]?.icons[0]) ? (
                    <img
                      src={pngSrc((previews[p.iconSet.id].appIcon ?? previews[p.iconSet.id].icons[0].png)!)}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-xl"
                    />
                  ) : (
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${TONE[i % TONE.length]}`}>
                      <LuBoxes size={21} />
                    </span>
                  )}
                  <div className="min-w-0">
                    <h2 className="truncate text-[17px] font-semibold tracking-tight text-slate-900 dark:text-white">{p.name}</h2>
                    <p className="font-mono text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{p.key}</p>
                  </div>
                </div>
                {p.active ? <ITBadget color="success" label="Activo" size="sm" /> : <ITBadget color="gray" label="Dado de baja" size="sm" />}
              </div>

              <p className="mt-3 line-clamp-2 min-h-[36px] text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                {p.description || "Sin descripción."}
              </p>

              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] text-slate-600 dark:text-slate-300">
                    {[p.terms?.kitchenRole ?? "Taquero", p.terms?.waiterRole ?? "Mesero"].join(" · ")}
                    {` · "${p.terms?.item ?? "Taco"}"`}
                  </span>
                  <ITButton size="sm" variant="text" icon={<LuPencil size={13} />} onClick={() => openGiro(p)}>
                    Editar giro
                  </ITButton>
                </div>
                {p.iconSet ? (
                  <div className="flex items-center gap-1.5">
                    {(previews[p.iconSet.id]?.icons ?? []).map((icon) => (
                      <img key={icon.key} src={pngSrc(icon.png)} alt={icon.label} className="h-9 w-9" />
                    ))}
                    <button
                      type="button"
                      onClick={() => navigate("/iconos")}
                      className="ml-auto text-[12px] font-medium text-[var(--color-axzy-deep)] hover:underline"
                    >
                      {p.iconSet.name} · {p.iconSet.icons}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openGiro(p)}
                    className="rounded-lg border border-dashed border-slate-300 py-2 text-[12.5px] text-slate-500 hover:border-sky-300 dark:border-slate-600 dark:text-slate-400"
                  >
                    Sin set de iconos · asignar uno
                  </button>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {FEATURE_FIELDS.filter((f) => p.features?.[f.key]).map((f) => (
                    <span key={f.key} className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[11.5px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      {f.label}
                    </span>
                  ))}
                  <span className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[11.5px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    {p.template ? `Menú base: ${p.template.products} productos` : "Sin menú base"}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/clientes?producto=${p.id}`)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-sky-300 hover:bg-sky-50/50 dark:border-slate-700 dark:hover:border-sky-800 dark:hover:bg-sky-950/20"
                >
                  <span className="block text-xl font-bold tabular-nums text-slate-900 dark:text-white">{p.clients ?? 0}</span>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">clientes</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/planes?producto=${p.id}`)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-sky-300 hover:bg-sky-50/50 dark:border-slate-700 dark:hover:border-sky-800 dark:hover:bg-sky-950/20"
                >
                  <span className="block text-xl font-bold tabular-nums text-slate-900 dark:text-white">{p.plans ?? 0}</span>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">planes</span>
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                <div className="min-w-0 text-[12.5px]">
                  <span className="block font-medium text-slate-700 dark:text-slate-200">
                    {p.latestApp ? `App publicada: v${p.latestApp.versionName} (${p.latestApp.versionCode})` : "Sin versión publicada"}
                  </span>
                  <span className="block truncate text-slate-500 dark:text-slate-400">
                    {p.latestApp ? "Las apps con una versión menor avisan que hay que actualizar." : "Publica una para que las apps avisen."}
                  </span>
                </div>
                <ITButton size="sm" variant="outlined" icon={<LuDownload size={13} />} onClick={() => openPublish(p)}>
                  {p.latestApp ? "Cambiar" : "Publicar"}
                </ITButton>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="flex flex-wrap gap-1.5">
                  <ITButton size="sm" variant="outlined" onClick={() => navigate(`/clientes?producto=${p.id}`)}>
                    Ver clientes
                  </ITButton>
                  <ITButton size="sm" variant="text" color="gray" onClick={() => navigate(`/planes?producto=${p.id}`)}>
                    Ver planes
                  </ITButton>
                </div>
                <ITButton size="sm" variant="text" color={p.active ? "gray" : "primary"} onClick={() => void toggle(p)}>
                  {p.active ? "Dar de baja" : "Reactivar"}
                </ITButton>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ITDialog isOpen={creating} onClose={() => setCreating(false)} title="Nuevo producto" className="w-[min(94vw,600px)]">
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2">
            <ITInput
              name="name"
              label="Nombre"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value, key: keyTouched ? form.key : keyFrom(e.target.value) })}
              placeholder="App de taquerías"
              required
              autoFocus
            />
          </div>
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
              placeholder="TAQUERIA"
            />
            <ITText muted className="mt-1 block text-xs">La usan las apps; no se cambia después.</ITText>
          </div>
          <div className="flex items-end">
            <ITInput
              name="description"
              type="textarea"
              rows={3}
              label="Descripción (opcional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full"
            />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <ITButton type="button" variant="outlined" color="gray" onClick={() => setCreating(false)}>
              Cancelar
            </ITButton>
            <ITButton type="submit" disabled={busy || form.name.trim().length < 2 || form.key.length < 2}>
              {busy ? "Guardando…" : "Crear producto"}
            </ITButton>
          </div>
        </form>
      </ITDialog>
      <ITDialog
        isOpen={editingGiro !== null}
        onClose={() => setEditingGiro(null)}
        title={`Giro de ${editingGiro?.name ?? "el producto"}`}
        className="w-[min(94vw,620px)]"
      >
        <form onSubmit={saveGiro} className="grid gap-5" noValidate>
          <div>
            <ITText className="mb-1 block font-semibold">Palabras</ITText>
            <ITText muted className="mb-3 block text-xs">Lo que la app dice en pantalla. Vacío = como en la taquería.</ITText>
            <div className="grid gap-3 sm:grid-cols-2">
              {TERM_FIELDS.map((f) => (
                <ITInput
                  key={f.key}
                  name={f.key}
                  label={f.label}
                  value={giro.terms[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setGiro({ ...giro, terms: { ...giro.terms, [f.key]: e.target.value.slice(0, 30) } })}
                />
              ))}
            </div>
          </div>
          <div>
            <ITText className="mb-2 block font-semibold">Partes que usa</ITText>
            <div className="grid gap-2">
              {FEATURE_FIELDS.map((f) => (
                <div key={f.key}>
                  <ITCheckbox
                    name={f.key}
                    label={f.label}
                    checked={Boolean(giro.features[f.key])}
                    onChange={(v: boolean) => setGiro({ ...giro, features: { ...giro.features, [f.key]: v } })}
                  />
                  <ITText muted className="ml-7 block text-xs">{f.hint}</ITText>
                </div>
              ))}
            </div>
          </div>
          <ITSelect
            name="iconSetId"
            label="Set de iconos"
            value={giro.iconSetId}
            options={[{ value: "", label: "Sin set (iconos de taquería de la app)" }, ...iconSets.map((s) => ({ value: s.id, label: `${s.name} · ${s.icons} iconos` }))]}
            onChange={(e) => setGiro({ ...giro, iconSetId: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <ITButton type="button" variant="outlined" color="gray" onClick={() => setEditingGiro(null)}>
              Cancelar
            </ITButton>
            <ITButton type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar giro"}
            </ITButton>
          </div>
        </form>
      </ITDialog>
      <ITDialog
        isOpen={publishing !== null}
        onClose={() => setPublishing(null)}
        title={`Publicar versión de ${publishing?.name ?? "la app"}`}
        className="w-[min(94vw,560px)]"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveRelease({
              versionCode: Number(release.versionCode),
              versionName: release.versionName.trim(),
              url: release.url.trim() || null,
              notes: release.notes.trim() || null,
            });
          }}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <ITInput
            name="versionName"
            label="Versión"
            value={release.versionName}
            onChange={(e) => setRelease({ ...release, versionName: e.target.value })}
            placeholder="1.3.0"
            required
          />
          <ITInput
            name="versionCode"
            type="number"
            label="Número de versión (versionCode)"
            value={release.versionCode}
            onChange={(e) => setRelease({ ...release, versionCode: e.target.value })}
            placeholder="6"
            required
          />
          <div className="sm:col-span-2">
            <ITInput
              name="url"
              label="Enlace de descarga"
              value={release.url}
              onChange={(e) => setRelease({ ...release, url: e.target.value })}
              placeholder="https://drive.google.com/…"
            />
          </div>
          <div className="sm:col-span-2">
            <ITInput
              name="notes"
              label="Qué trae (opcional)"
              value={release.notes}
              onChange={(e) => setRelease({ ...release, notes: e.target.value })}
              placeholder="Órdenes sin conexión y respaldo en la Central"
            />
          </div>
          <div className="sm:col-span-2">
            <ITText muted className="text-xs">
              El número es el <code>taqueria.versionCode</code> del APK. Las apps con uno menor muestran el aviso al revisar su licencia.
            </ITText>
          </div>
          <div className="flex flex-wrap justify-between gap-2 sm:col-span-2">
            {publishing?.latestApp ? (
              <ITButton type="button" variant="text" color="gray" disabled={busy} onClick={() => void saveRelease(null)}>
                Quitar aviso
              </ITButton>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <ITButton type="button" variant="outlined" color="gray" onClick={() => setPublishing(null)}>
                Cancelar
              </ITButton>
              <ITButton type="submit" disabled={busy || !(Number(release.versionCode) >= 1) || release.versionName.trim() === ""}>
                {busy ? "Guardando…" : "Publicar"}
              </ITButton>
            </div>
          </div>
        </form>
      </ITDialog>
    </Page>
  );
}
