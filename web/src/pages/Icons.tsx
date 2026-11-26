import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ITAlert, ITBadget, ITButton, ITConfirmDialog, ITDialog, ITInput, ITText } from "@axzydev/axzy_ui_system";
import { LuImages, LuPlus, LuTrash2, LuUpload } from "react-icons/lu";
import {
  createIconSet,
  deleteIconSet,
  getIconSet,
  listIconSets,
  pngSrc,
  uploadIconSet,
  type IconSetFull,
  type IconSetSummary,
  type IconUploadResult,
} from "../api";
import { readIconKit, type IconKit } from "../iconKit";
import { useNotify } from "../toast";
import { errorOf } from "../shared";
import { Card, Empty, Page } from "../ui";

/** Orden en que se muestran los grupos; los demás van al final en orden alfabético. */
const GROUP_ORDER = ["Tacos", "Rollos", "Sushi", "Pizzas", "Especialidades", "Acompañamientos", "Bebidas", "Ingredientes", "Extras", "Servicio", "Categorías"];
const groupRank = (g: string) => {
  const i = GROUP_ORDER.indexOf(g);
  return i < 0 ? GROUP_ORDER.length : i;
};

export default function Icons() {
  const notify = useNotify();
  const [sets, setSets] = useState<IconSetSummary[] | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<IconSetFull | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [kit, setKit] = useState<IconKit | null>(null);
  const [result, setResult] = useState<IconUploadResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setError("");
    listIconSets()
      .then((list) => {
        setSets(list);
        setSelectedId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((e) => setError(errorOf(e)));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    setSelected(null);
    if (!selectedId) return;
    getIconSet(selectedId)
      .then(setSelected)
      .catch((e) => notify(errorOf(e), "error"));
  }, [selectedId, notify]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, IconSetFull["icons"]>();
    for (const icon of selected?.icons ?? []) byGroup.set(icon.group, [...(byGroup.get(icon.group) ?? []), icon]);
    return [...byGroup.entries()].sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b));
  }, [selected]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const set = await createIconSet(name.trim());
      notify(`Set ${set.name} creado; ahora sube su zip`);
      setCreating(false);
      setName("");
      setSelectedId(set.id);
      load();
    } catch (err) {
      notify(errorOf(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const pickZip = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    try {
      const read = await readIconKit(file);
      setWarnings(read.warnings);
      if (read.icons.length === 0) {
        notify("Ese zip no trae iconos PNG", "error");
        return;
      }
      setKit(read);
    } catch {
      notify("No se pudo abrir el zip", "error");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const upload = async () => {
    if (!kit || !selected) return;
    setBusy(true);
    try {
      const r = await uploadIconSet(selected.id, {
        icons: kit.icons,
        // Sin logo en el kit se conserva el que ya tenía.
        ...(kit.logo ? { logo: kit.logo } : {}),
        ...(kit.appIcon ? { appIcon: kit.appIcon } : {}),
      });
      setResult(r);
      setKit(null);
      notify(
        r.added.length + r.changed.length + r.removed.length === 0 && !r.logoChanged
          ? "El kit es igual al que ya estaba; no cambió nada"
          : `Set actualizado a la versión ${r.version}`
      );
      setSelected(await getIconSet(selected.id));
      load();
    } catch (err) {
      notify(errorOf(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await deleteIconSet(selected.id);
      notify(`Set ${selected.name} borrado`);
      setDeleting(false);
      setSelectedId(null);
      setSets(null);
      load();
    } catch (err) {
      notify(errorOf(err), "error");
      setDeleting(false);
    } finally {
      setBusy(false);
    }
  };

  const summary = sets?.find((s) => s.id === selectedId);

  return (
    <Page
      eyebrow="Catálogo"
      title="Iconos"
      description="Cada giro usa un set de iconos. Se sube como zip del kit; las apps lo bajan solas cuando cambia la versión."
      actions={
        <ITButton icon={<LuPlus size={15} />} onClick={() => setCreating(true)}>
          Nuevo set
        </ITButton>
      }
      loading={sets === null && !error}
      error={error || null}
      onRetry={load}
    >
      {sets && sets.length === 0 ? (
        <Card bodyClassName="p-5">
          <Empty
            title="Todavía no hay sets de iconos"
            description="Crea uno por giro (Tacos, Makis, Pizzería…) y súbele su zip."
            action={<ITButton onClick={() => setCreating(true)}>Nuevo set</ITButton>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            {(sets ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  s.id === selectedId
                    ? "border-[var(--color-axzy-deep)] bg-sky-50/60 dark:bg-sky-950/30"
                    : "border-slate-200 bg-white hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                <span className="block font-semibold text-slate-900 dark:text-white">{s.name}</span>
                <span className="block text-[12.5px] text-slate-500 dark:text-slate-400">
                  {s.icons} iconos · versión {s.version}
                  {s.products > 0 ? ` · ${s.products} producto${s.products === 1 ? "" : "s"}` : " · sin usar"}
                </span>
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {selectedId && (
              <Card bodyClassName="p-5">
                <div className="flex flex-wrap items-center gap-4">
                  {selected?.appIcon || selected?.logo ? (
                    <img src={pngSrc((selected.appIcon ?? selected.logo)!)} alt="" className="h-14 w-14 rounded-xl" />
                  ) : (
                    <span className="grid h-14 w-14 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                      <LuImages size={24} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{summary?.name ?? selected?.name}</h2>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                      {selected ? `${selected.icons.length} iconos · versión ${selected.version}` : "Cargando…"}
                      {selected?.logo ? " · con logo" : ""}
                    </p>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={(e) => void pickZip(e.target.files?.[0])}
                    aria-label="Zip del kit de iconos"
                  />
                  <ITButton icon={<LuUpload size={15} />} onClick={() => fileInput.current?.click()} disabled={!selected || busy}>
                    {selected && selected.icons.length > 0 ? "Subir nueva versión" : "Subir zip"}
                  </ITButton>
                  <ITButton
                    variant="text"
                    color="gray"
                    icon={<LuTrash2 size={14} />}
                    onClick={() => setDeleting(true)}
                    disabled={!selected || busy || (summary?.products ?? 0) > 0}
                  >
                    Borrar
                  </ITButton>
                </div>
                <ITText muted className="mt-3 block text-xs">
                  Se leen los PNG de <code>png/256</code> o <code>iconos_png/256</code> y el logo de <code>logo_svg/</code>. El nombre del
                  archivo es la llave y su prefijo el grupo (<code>rollo_</code> Rollos, <code>pizza_</code> Pizzas, <code>ing_</code>{" "}
                  Ingredientes…).
                </ITText>
                {result && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ITBadget color="success" label={`+${result.added.length} nuevos`} size="sm" />
                    <ITBadget color="warning" label={`${result.changed.length} cambiaron`} size="sm" />
                    <ITBadget color="gray" label={`${result.removed.length} quitados`} size="sm" />
                    {result.logoChanged && <ITBadget color="primary" label="logo nuevo" size="sm" />}
                  </div>
                )}
                {warnings.length > 0 && (
                  <div className="mt-3">
                    <ITAlert variant="warning">Se ignoró parte del zip: {warnings.slice(0, 6).join(" · ")}</ITAlert>
                  </div>
                )}
              </Card>
            )}

            {selected && selected.icons.length === 0 && (
              <Card bodyClassName="p-5">
                <Empty title="Este set no tiene iconos" description="Sube el zip del kit para llenarlo." />
              </Card>
            )}

            {groups.map(([group, icons]) => (
              <Card key={group} title={group} subtitle={`${icons.length} icono${icons.length === 1 ? "" : "s"}`} bodyClassName="p-4">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
                  {icons.map((icon) => (
                    <figure
                      key={icon.key}
                      className={`m-0 flex flex-col items-center gap-2 rounded-2xl border p-3 ${
                        result?.added.includes(icon.key) || result?.changed.includes(icon.key)
                          ? "border-[var(--color-axzy-deep)]"
                          : "border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <img src={pngSrc(icon.png)} alt="" className="h-16 w-16" loading="lazy" />
                      <figcaption className="w-full truncate text-center font-mono text-[11px] text-slate-500 dark:text-slate-400" title={icon.key}>
                        {icon.key}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <ITDialog isOpen={creating} onClose={() => setCreating(false)} title="Nuevo set de iconos" className="w-[min(94vw,480px)]">
        <form onSubmit={create} className="grid gap-4" noValidate>
          <ITInput name="name" label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Makis" required autoFocus />
          <div className="flex justify-end gap-2">
            <ITButton type="button" variant="outlined" color="gray" onClick={() => setCreating(false)}>
              Cancelar
            </ITButton>
            <ITButton type="submit" disabled={busy || name.trim().length < 2}>
              {busy ? "Creando…" : "Crear set"}
            </ITButton>
          </div>
        </form>
      </ITDialog>

      <ITDialog isOpen={kit !== null} onClose={() => setKit(null)} title={`Subir kit a ${selected?.name ?? "el set"}`} className="w-[min(94vw,560px)]">
        {kit && (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {kit.icons.slice(0, 8).map((i) => (
                <img key={i.key} src={pngSrc(i.png)} alt={i.key} className="h-12 w-12" />
              ))}
            </div>
            <ITText>
              {kit.icons.length} iconos{kit.logo ? " · con logo" : ""}
              {kit.appIcon ? " · con ícono de app" : ""}.
            </ITText>
            {selected && selected.icons.length > 0 && (
              <ITAlert variant="info">
                Reemplaza el set: los iconos que no vengan en este zip se quitan. Las apps bajan la versión nueva en su siguiente
                revisión.
              </ITAlert>
            )}
            <div className="flex justify-end gap-2">
              <ITButton type="button" variant="outlined" color="gray" onClick={() => setKit(null)}>
                Cancelar
              </ITButton>
              <ITButton onClick={() => void upload()} disabled={busy}>
                {busy ? "Subiendo…" : "Subir"}
              </ITButton>
            </div>
          </div>
        )}
      </ITDialog>

      <ITConfirmDialog
        isOpen={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => void remove()}
        title={`¿Borrar el set ${selected?.name ?? ""}?`}
        message="Se borran todos sus iconos. Solo se puede si ningún producto lo usa."
        confirmLabel="Borrar"
        cancelLabel="Cancelar"
        variant="danger"
      />
    </Page>
  );
}
