import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ITBadget, ITButton, ITCheckbox, ITDialog, ITInput } from "@axzydev/axzy_ui_system";
import { LuHistory, LuPlus, LuSend, LuTrash2, LuX } from "react-icons/lu";
import {
  ApiError,
  agoText,
  getClientMenu,
  getClientMenuVersion,
  getIconSet,
  money,
  pngSrc,
  saveClientMenu,
  type ClientMenu as Menu,
  type IconItem,
  type MenuData,
  type MenuProduct,
  type MenuVersion,
} from "../api";
import { errorOf } from "../shared";
import { useNotify } from "../toast";
import { Card, Empty, Muted, Page } from "../ui";

/**
 * Menú de un cliente, como en el mock: categorías, productos y el editor en tres bloques.
 * Los cambios se juntan en un borrador y salen juntos con "Enviar a cocina" (una versión nueva);
 * la cocina la recibe en menos de un minuto. Si la cocina cambió algo entretanto, la Central
 * responde con conflicto y aquí se recarga lo de la cocina.
 */
export default function ClientMenu() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [draft, setDraft] = useState<MenuData | null>(null);
  const [error, setError] = useState("");
  const [icons, setIcons] = useState<IconItem[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuProduct | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [conflict, setConflict] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const m = await getClientMenu(id);
      setMenu(m);
      setDraft(m.current ? structuredClone(m.current.data) : null);
      setConflict(false);
      if (m.giro.iconSetId) setIcons((await getIconSet(m.giro.iconSetId)).icons);
    } catch (e) {
      setError(errorOf(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const base = menu?.current ?? null;
  const categories = useMemo(() => (draft ? categoriesOf(draft) : []), [draft]);
  const selected = category && categories.includes(category) ? category : categories[0] ?? null;
  const changed = useMemo(() => (base && draft ? changedIds(base.data, draft) : new Set<string>()), [base, draft]);
  const otherChanges = base && draft ? JSON.stringify(rest(base.data)) !== JSON.stringify(rest(draft)) : false;
  const pending = changed.size + (otherChanges ? 1 : 0);
  const iconByKey = useMemo(() => new Map(icons.map((i) => [i.key, i])), [icons]);

  const update = (fn: (d: MenuData) => MenuData) => setDraft((d) => (d ? fn(structuredClone(d)) : d));

  const send = async () => {
    if (!base || !draft) return;
    setSending(true);
    try {
      const r = await saveClientMenu(id, base.version, draft);
      notify(r.saved ? `Versión ${r.catalog.version} enviada a cocina` : "No había cambios");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "CATALOG_CONFLICT") setConflict(true);
      else notify(errorOf(e), "error");
    } finally {
      setSending(false);
    }
  };

  const saveProduct = (p: MenuProduct) => {
    update((d) => {
      const i = d.products.findIndex((x) => x.id === p.id);
      if (i >= 0) d.products[i] = p;
      else d.products.push(p);
      return d;
    });
    setCategory(p.category);
    setEditing(null);
  };

  const removeProduct = (p: MenuProduct) => {
    update((d) => ({ ...d, products: d.products.filter((x) => x.id !== p.id) }));
    setEditing(null);
  };

  const addCategory = () => {
    const name = window.prompt("Nombre de la categoría")?.trim();
    if (!name) return;
    if (categories.includes(name)) return setCategory(name);
    update((d) => ({ ...d, categories: [...d.categories, { name }] }));
    setCategory(name);
  };

  return (
    <Page
      eyebrow="Cliente · Menú"
      title={menu ? `Menú · ${menu.giro.name}` : "Menú"}
      back={{ label: "Cliente", onClick: () => navigate(`/clientes/${id}`) }}
      loading={!menu && !error}
      error={error || null}
      onRetry={load}
      actions={
        base && (
          <div className="flex flex-wrap items-center gap-2">
            <ITButton variant="outlined" icon={<LuHistory size={15} />} onClick={() => setHistoryOpen(true)}>
              Historial
            </ITButton>
            <ITButton icon={<LuSend size={15} />} disabled={pending === 0 || sending} onClick={() => void send()}>
              {sending ? "Enviando…" : "Enviar a cocina"}
            </ITButton>
          </div>
        )
      }
    >
      {menu && !base && (
        <Card>
          <Empty
            title="La cocina todavía no ha subido su menú"
            description="Llega solo en cuanto el teléfono de cocina con la app nueva se conecte a internet. Desde ahí se edita aquí."
          />
        </Card>
      )}

      {base && draft && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
            <span className="font-semibold text-slate-900 dark:text-white">
              Versión {base.version} en cocina
              {pending > 0 && <span className="text-amber-600"> · {pending === 1 ? "1 cambio sin enviar" : `${pending} cambios sin enviar`}</span>}
            </span>
            <Muted>
              Último cambio desde {base.source === "cocina" ? "la cocina" : "la Central"}
              {base.author ? ` (${base.author})` : ""}, {agoText(base.updatedAt)}.
            </Muted>
          </div>

          {conflict && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <span>La cocina cambió el menú mientras editabas. Tus cambios no se enviaron.</span>
              <ITButton size="sm" variant="outlined" onClick={() => void load()}>
                Cargar el de la cocina
              </ITButton>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
            <Card title="Categorías" bodyClassName="p-2">
              <nav className="flex flex-col">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                      c === selected
                        ? "bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-white"
                        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <span className="truncate">{c}</span>
                    <span className="text-xs text-slate-400">{draft.products.filter((p) => p.category === c).length}</span>
                  </button>
                ))}
                <button type="button" onClick={addCategory} className="rounded-lg px-3 py-2 text-left text-sm font-medium text-[#387D92] hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  + Categoría
                </button>
              </nav>
            </Card>

            <Card
              title={selected ?? "Sin categorías"}
              actions={
                selected && (
                  <ITButton size="sm" icon={<LuPlus size={13} />} onClick={() => setEditing(newProduct(selected))}>
                    Producto
                  </ITButton>
                )
              }
              bodyClassName="p-0"
            >
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {draft.products
                  .filter((p) => p.category === selected)
                  .map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setEditing(structuredClone(p))} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <IconThumb icon={iconFor(p, iconByKey)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-900 dark:text-white">{p.name}</span>
                          <span className="block truncate text-xs text-slate-500">{pricesText(p)}</span>
                        </span>
                        {p.active === false && <ITBadget color="danger" label="agotado" size="sm" variant="outlined" />}
                        {changed.has(p.id) && <ITBadget color="warning" label="sin enviar" size="sm" />}
                      </button>
                    </li>
                  ))}
                {selected && draft.products.every((p) => p.category !== selected) && (
                  <li className="px-4 py-6 text-center text-sm text-slate-500">Sin productos. Agrega el primero con “Producto”.</li>
                )}
              </ul>
            </Card>
          </div>
        </>
      )}

      {editing && draft && (
        <ProductDialog
          product={editing}
          isNew={!draft.products.some((p) => p.id === editing.id)}
          categories={categories}
          groups={draft.modifierGroups}
          icons={icons}
          onSave={saveProduct}
          onRemove={removeProduct}
          onClose={() => setEditing(null)}
        />
      )}

      {historyOpen && menu && (
        <HistoryDialog
          clientId={id}
          menu={menu}
          onUse={(v) => {
            setDraft(structuredClone(v.data));
            setHistoryOpen(false);
            notify(`Versión ${v.version} cargada en el borrador; revísala y envíala a cocina`);
          }}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ */

/** Categorías configuradas más las que solo existan en productos, en orden (igual que la app). */
const categoriesOf = (d: MenuData) => {
  const names = d.categories.map((c) => c.name);
  for (const p of d.products) if (!names.includes(p.category)) names.push(p.category);
  return names;
};

/** Productos agregados, cambiados o quitados respecto a la versión vigente. */
const changedIds = (before: MenuData, after: MenuData) => {
  const prev = new Map(before.products.map((p) => [p.id, JSON.stringify(p)]));
  const next = new Map(after.products.map((p) => [p.id, JSON.stringify(p)]));
  const ids = new Set<string>();
  for (const [k, v] of next) if (prev.get(k) !== v) ids.add(k);
  for (const k of prev.keys()) if (!next.has(k)) ids.add(k);
  return ids;
};

const rest = (d: MenuData) => ({ ...d, products: undefined });

const newProduct = (category: string): MenuProduct => ({
  id: crypto.randomUUID(),
  name: "",
  priceCents: 0,
  category,
  active: true,
  emoji: "",
  modifierGroupIds: [],
  color: "NONE",
  variants: [],
  mix: false,
  icon: null,
});

const pricesText = (p: MenuProduct) =>
  p.variants?.length ? p.variants.map((v) => `${v.name} ${money(v.priceCents / 100)}`).join(" · ") : money(p.priceCents / 100);

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** El icono que verá la app: el elegido o, como en la app, el del set que se llame igual. */
const iconFor = (p: MenuProduct, byKey: Map<string, IconItem>) => {
  if (p.icon) return byKey.get(p.icon) ?? null;
  const s = slug(p.name);
  return [...byKey.values()].find((i) => !i.key.startsWith("ing_") && i.key.slice(i.key.indexOf("_") + 1) === s) ?? null;
};

function IconThumb({ icon, size = 40 }: { icon: IconItem | null; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-slate-100 dark:bg-slate-800" style={{ width: size, height: size }}>
      {icon ? <img src={pngSrc(icon.png)} alt="" width={size - 8} height={size - 8} /> : <span className="text-xs text-slate-400">—</span>}
    </span>
  );
}

const pesos = (cents: number) => (cents ? String(cents / 100) : "");
const cents = (text: string) => Math.round(Number(text.replace(",", ".")) * 100) || 0;

/* ------------------------------------------------------------------ */

function ProductDialog({
  product,
  isNew,
  categories,
  groups,
  icons,
  onSave,
  onRemove,
  onClose,
}: {
  product: MenuProduct;
  isNew: boolean;
  categories: string[];
  groups: MenuData["modifierGroups"];
  icons: IconItem[];
  onSave: (p: MenuProduct) => void;
  onRemove: (p: MenuProduct) => void;
  onClose: () => void;
}) {
  const [p, setP] = useState<MenuProduct>(product);
  const [allIcons, setAllIcons] = useState(false);
  const variants = p.variants ?? [];
  // Sin presentaciones se edita un solo precio, que se ve como "Normal".
  const rows = variants.length ? variants : [{ name: "", priceCents: p.priceCents }];
  const setRows = (next: { name: string; priceCents: number }[]) =>
    setP(next.length === 1 && !next[0].name.trim() ? { ...p, variants: [], priceCents: next[0].priceCents } : { ...p, variants: next, priceCents: next[0]?.priceCents ?? 0 });
  const byKey = new Map(icons.map((i) => [i.key, i]));
  const shown = iconFor(p, byKey);
  // Primero los platillos; bebidas, extras y servicio al final (como la vista previa de Productos).
  const late = (k: string) => (/^(beb|extra|serv|side)_/.test(k) ? 1 : 0);
  const dishes = icons.filter((i) => !i.key.startsWith("ing_")).sort((a, b) => late(a.key) - late(b.key));
  const visibleIcons = allIcons ? dishes : dishes.slice(0, 15);
  const names = rows.map((r) => r.name.trim().toLowerCase());
  const invalid = !p.name.trim() || !p.category.trim() || (rows.length > 1 && (names.some((n) => !n) || new Set(names).size !== names.length));

  return (
    <ITDialog isOpen onClose={onClose} title={isNew ? "Nuevo producto" : p.name || "Producto"} className="w-[min(96vw,640px)]">
      <form
        noValidate
        className="flex max-h-[75vh] flex-col gap-5 overflow-y-auto pr-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) onSave({ ...p, name: p.name.trim(), category: p.category.trim() });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ITInput name="name" label="Nombre" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} required autoFocus />
          <div className="flex flex-col gap-1.5">
            <ITInput name="category" label="Categoría" value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })} required />
            <div className="flex flex-wrap gap-1">
              {categories
                .filter((c) => c !== p.category)
                .map((c) => (
                  <button key={c} type="button" className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300" onClick={() => setP({ ...p, category: c })}>
                    {c}
                  </button>
                ))}
            </div>
          </div>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">1 · ¿Cómo se vende?</h3>
          <Muted>Cada presentación con su precio. La primera es la que se pide sin preguntar.</Muted>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_140px_32px] items-end gap-2">
              <ITInput
                name={`variant-${i}`}
                label={i === 0 ? "Presentación" : undefined}
                placeholder={rows.length === 1 ? "Normal" : "Ej. Empanizado"}
                value={r.name}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <ITInput
                name={`price-${i}`}
                label={i === 0 ? "Precio ($)" : undefined}
                value={pesos(r.priceCents)}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, priceCents: cents(e.target.value) } : x)))}
              />
              {rows.length > 1 ? (
                <button type="button" aria-label="Quitar presentación" className="mb-2 text-slate-400 hover:text-red-600" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  <LuX size={16} />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
          <button
            type="button"
            className="self-start text-sm font-medium text-[#387D92]"
            onClick={() => setRows([...(rows.length === 1 && !rows[0].name.trim() ? [{ ...rows[0], name: "Normal" }] : rows), { name: "", priceCents: 0 }])}
          >
            + Presentación (ej. Empanizado)
          </button>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">2 · ¿Qué le pueden pedir?</h3>
          <Muted>Grupos de opciones que se usan en varios productos. Toca para prender o apagar.</Muted>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => {
              const on = p.modifierGroupIds?.includes(g.id) ?? false;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() =>
                    setP({ ...p, modifierGroupIds: on ? (p.modifierGroupIds ?? []).filter((x) => x !== g.id) : [...(p.modifierGroupIds ?? []), g.id] })
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    on ? "border-[#387D92] bg-[#387D92] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
                  }`}
                  title={g.options.join(" · ")}
                >
                  {g.name}: {g.options.slice(0, 3).join(" · ")}
                  {g.options.length > 3 ? "…" : ""}
                </button>
              );
            })}
            {groups.length === 0 && <Muted>Este menú no tiene opciones todavía.</Muted>}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">3 · Icono</h3>
          {icons.length === 0 ? (
            <Muted>El giro de este cliente no tiene set de iconos; la app usa los de taquería.</Muted>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <IconThumb icon={shown} size={56} />
                <Muted>{p.icon ? `Elegido: ${byKey.get(p.icon)?.label ?? p.icon}` : shown ? `Por su nombre: ${shown.label}` : "Sin icono: la app usa el genérico del giro"}</Muted>
                {p.icon && (
                  <button type="button" className="text-xs font-medium text-[#387D92]" onClick={() => setP({ ...p, icon: null })}>
                    Usar el de su nombre
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-2">
                {visibleIcons.map((i) => (
                  <button
                    key={i.key}
                    type="button"
                    title={i.label}
                    onClick={() => setP({ ...p, icon: i.key })}
                    className={`grid aspect-square place-items-center rounded-xl border transition ${
                      p.icon === i.key ? "border-[#387D92] ring-2 ring-[#387D92]/30" : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    <img src={pngSrc(i.png)} alt={i.label} width={36} height={36} />
                  </button>
                ))}
              </div>
              {dishes.length > 15 && (
                <button type="button" className="self-start text-sm font-medium text-[#387D92]" onClick={() => setAllIcons(!allIcons)}>
                  {allIcons ? "Ver menos" : `Ver los ${dishes.length}`}
                </button>
              )}
            </>
          )}
        </section>

        <ITCheckbox name="active" label="Disponible (si no, sale como agotado)" checked={p.active !== false} onChange={(v: boolean) => setP({ ...p, active: v })} />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          {!isNew ? (
            <ITButton type="button" variant="text" color="danger" icon={<LuTrash2 size={14} />} onClick={() => onRemove(product)}>
              Quitar del menú
            </ITButton>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <ITButton type="button" variant="outlined" color="gray" onClick={onClose}>
              Cancelar
            </ITButton>
            <ITButton type="submit" disabled={invalid}>
              Guardar
            </ITButton>
          </div>
        </div>
      </form>
    </ITDialog>
  );
}

function HistoryDialog({
  clientId,
  menu,
  onUse,
  onClose,
}: {
  clientId: string;
  menu: Menu;
  onUse: (v: MenuVersion) => void;
  onClose: () => void;
}) {
  const notify = useNotify();
  const [busy, setBusy] = useState<number | null>(null);
  const current = menu.current?.version;
  return (
    <ITDialog isOpen onClose={onClose} title="Historial del menú" className="w-[min(94vw,560px)]">
      <ul className="flex max-h-[60vh] flex-col divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
        {menu.history.map((h) => (
          <li key={h.version} className="flex items-center gap-3 py-2.5">
            <span className="w-10 text-sm font-semibold text-slate-900 dark:text-white">v{h.version}</span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block">
                {h.source === "cocina" ? "Cocina" : h.source === "plantilla" ? "Plantilla" : "Central"}
                {h.author ? ` · ${h.author}` : ""}
              </span>
              <Muted>{agoText(h.createdAt)}</Muted>
            </span>
            {h.version === current ? (
              <ITBadget color="success" label="vigente" size="sm" />
            ) : (
              <ITButton
                size="sm"
                variant="outlined"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(h.version);
                  try {
                    onUse(await getClientMenuVersion(clientId, h.version));
                  } catch (e) {
                    notify(errorOf(e), "error");
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === h.version ? "Cargando…" : "Volver a esta"}
              </ITButton>
            )}
          </li>
        ))}
      </ul>
    </ITDialog>
  );
}
