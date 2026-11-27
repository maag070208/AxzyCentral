import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ITBadget, ITButton, ITCheckbox, ITInput } from "@axzydev/axzy_ui_system";
import { LuCamera, LuCopy, LuExternalLink, LuPrinter, LuRefreshCw, LuSave, LuTrash2 } from "react-icons/lu";
import {
  api,
  deleteProductPhoto,
  getClientMenu,
  getConfig,
  getMenuVisits,
  listProductPhotos,
  productPhotoUrl,
  saveDigitalMenu,
  saveProductPhoto,
  suggestMenuSlug,
  type ClientDetail,
  type MenuProduct,
  type MenuVisits,
} from "../api";
import { resizePhoto } from "../components/resizePhoto";
import { printMenuQr, type QrSheet } from "../components/printMenuQr";
import { errorOf } from "../shared";
import { useNotify } from "../toast";
import { Card, Muted, Page } from "../ui";

type Form = { enabled: boolean; slug: string; hours: string; whatsapp: string; address: string };

const formOf = (c: ClientDetail): Form => ({
  enabled: c.menu.enabled,
  slug: c.menu.slug ?? suggestMenuSlug(c.name),
  hours: c.menu.info.hours ?? "",
  whatsapp: c.menu.info.whatsapp ?? "",
  address: c.menu.info.address ?? "",
});

/**
 * Menú digital del cliente: la página pública que abre el comensal con el QR de la mesa.
 * Sale del menú que la cocina sincroniza con la Central; aquí solo se enciende, se le da dirección
 * y datos del local, se ve como en el celular y se imprimen los QR.
 */
export default function DigitalMenu() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [menuUrl, setMenuUrl] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(0);
  const [visits, setVisits] = useState<MenuVisits | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [c, cfg, v] = await Promise.all([api<ClientDetail>("GET", `/clients/${id}`), getConfig(), getMenuVisits(id)]);
      setClient(c);
      setVisits(v);
      setForm(formOf(c));
      setMenuUrl(cfg.menuUrl);
    } catch (e) {
      setError(errorOf(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const saved = client?.menu;
  const publicUrl = saved?.slug ? `${menuUrl}/${saved.slug}` : "";
  const live = !!saved?.enabled && !!saved.slug && client?.status === "ACTIVE";
  const dirty = !!client && !!form && JSON.stringify(form) !== JSON.stringify(formOf(client));
  const slugChanged = !!saved?.slug && !!form && form.slug.trim() !== saved.slug;

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const c = await saveDigitalMenu(id, {
        menuSlug: form.slug.trim() || null,
        menuEnabled: form.enabled,
        menuInfo: { hours: form.hours, whatsapp: form.whatsapp, address: form.address },
      });
      setClient(c);
      setForm(formOf(c));
      setPreview((n) => n + 1);
      notify(c.menu.enabled ? "Menú digital guardado y encendido" : "Menú digital guardado (apagado)", "success");
    } catch (e) {
      notify(errorOf(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const print = async (sheet: QrSheet) => {
    if (!client || !publicUrl) return;
    try {
      await printMenuQr(sheet, client.name, publicUrl);
    } catch (e) {
      notify(errorOf(e), "error");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      notify("Enlace copiado", "success");
    } catch {
      notify("No se pudo copiar el enlace", "error");
    }
  };

  return (
    <Page
      eyebrow="Menú digital"
      title={client?.name ?? "Cliente"}
      description="La página que abre el comensal con el QR de la mesa. Sale del menú de la cocina: precios y agotados se actualizan solos en menos de un minuto."
      back={{ label: client?.name ?? "Cliente", onClick: () => navigate(`/clientes/${id}`) }}
      loading={!client && !error}
      error={error || null}
      onRetry={load}
      actions={
        client && (
          <div className="flex flex-wrap items-center gap-2">
            <ITBadget color={live ? "success" : "gray"} label={live ? "Encendido" : "Apagado"} size="sm" />
            <ITButton icon={<LuSave size={15} />} onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? "Guardando…" : "Guardar"}
            </ITButton>
          </div>
        )
      }
    >
      {client && form && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
          <div className="flex min-w-0 flex-col gap-5">
            <Card title="Configuración" subtitle="Dirección del menú y datos del local">
              <div className="flex flex-col gap-4">
                <ITCheckbox
                  name="enabled"
                  label="Menú digital encendido (si está apagado, la página dice que no está disponible)"
                  checked={form.enabled}
                  onChange={(v: boolean) => setForm({ ...form, enabled: v })}
                />
                <div>
                  <ITInput
                    name="slug"
                    label="Dirección"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                    placeholder="don-luigi"
                  />
                  <Muted className="mt-1 block">
                    {menuUrl}/{form.slug || "…"} · minúsculas, números y guiones.
                    {slugChanged && " Si la cambias, los QR que ya imprimiste dejan de servir."}
                  </Muted>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ITInput
                    name="hours"
                    label="Horario (opcional)"
                    value={form.hours}
                    onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    placeholder="Mar a dom, 1 pm a 11 pm"
                  />
                  <ITInput
                    name="whatsapp"
                    label="WhatsApp (opcional)"
                    value={form.whatsapp}
                    onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                    placeholder="55 1234 5678"
                  />
                  <div className="sm:col-span-2">
                    <ITInput
                      name="address"
                      label="Dirección del local (opcional)"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="Av. Reforma 123, Centro"
                    />
                  </div>
                </div>
              </div>
            </Card>

            <Card title="QR para imprimir" subtitle="Hoja carta; en el diálogo de impresión se puede guardar como PDF">
              {live ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm dark:bg-slate-800">{publicUrl}</code>
                    <ITButton size="sm" variant="outlined" icon={<LuCopy size={14} />} onClick={() => void copy()}>
                      Copiar
                    </ITButton>
                    <ITButton size="sm" variant="outlined" icon={<LuExternalLink size={14} />} onClick={() => window.open(publicUrl, "_blank", "noopener")}>
                      Abrir
                    </ITButton>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ITButton icon={<LuPrinter size={15} />} onClick={() => void print("mesas")} disabled={dirty}>
                      Mesas · 6 por hoja
                    </ITButton>
                    <ITButton variant="outlined" icon={<LuPrinter size={15} />} onClick={() => void print("mostrador")} disabled={dirty}>
                      Mostrador · 1 grande
                    </ITButton>
                  </div>
                  {dirty && <Muted>Guarda los cambios antes de imprimir.</Muted>}
                  {visits && (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Visitas: <b>{visits.today}</b> hoy · <b>{visits.last7}</b> en 7 días · <b>{visits.last30}</b> en 30 días
                    </p>
                  )}
                </div>
              ) : (
                <Muted>
                  {client.status !== "ACTIVE"
                    ? "El cliente está suspendido: su menú no se ve."
                    : "Enciende el menú y guarda para imprimir sus QR."}
                </Muted>
              )}
            </Card>

            <PhotosCard clientId={id} onChanged={() => setPreview((n) => n + 1)} />
          </div>

          <aside className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-6">
            <Card
              title="Vista previa"
              subtitle="Como lo ve el comensal"
              actions={
                live && (
                  <ITButton size="sm" variant="text" icon={<LuRefreshCw size={14} />} onClick={() => setPreview((n) => n + 1)}>
                    Recargar
                  </ITButton>
                )
              }
            >
              {live ? (
                <div className="mx-auto w-full max-w-[375px] overflow-hidden rounded-[28px] border-[6px] border-slate-800 bg-white shadow-sm dark:border-slate-700">
                  <iframe key={preview} title="Vista previa del menú digital" src={`${publicUrl}?vista=${preview}`} className="block h-[680px] w-full" />
                </div>
              ) : (
                <Muted>La vista previa aparece cuando el menú está encendido y guardado.</Muted>
              )}
            </Card>
          </aside>
        </div>
      )}
    </Page>
  );
}

/**
 * Fotos reales de los productos. Se guardan en la Central aparte del menú (no viajan a la cocina);
 * el menú digital enseña la foto donde la hay y el icono del giro donde no.
 */
function PhotosCard({ clientId, onChanged }: { clientId: string; onChanged: () => void }) {
  const notify = useNotify();
  const [products, setProducts] = useState<MenuProduct[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [menu, photos] = await Promise.all([getClientMenu(clientId), listProductPhotos(clientId)]);
      setProducts(menu.current?.data.products ?? []);
      const entries = await Promise.all(photos.map(async (p) => [p.productId, await productPhotoUrl(clientId, p.productId)] as const));
      setUrls((old) => {
        Object.values(old).forEach((u) => URL.revokeObjectURL(u));
        return Object.fromEntries(entries);
      });
    } catch (e) {
      setError(errorOf(e));
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (p: MenuProduct, file: File | undefined) => {
    if (!file) return;
    setBusy(p.id);
    try {
      await saveProductPhoto(clientId, p.id, await resizePhoto(file));
      notify(`Foto de ${p.name} guardada`, "success");
      await load();
      onChanged();
    } catch (e) {
      notify(errorOf(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: MenuProduct) => {
    setBusy(p.id);
    try {
      await deleteProductPhoto(clientId, p.id);
      notify(`Se quitó la foto de ${p.name}`, "success");
      await load();
      onChanged();
    } catch (e) {
      notify(errorOf(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const withPhoto = products ? products.filter((p) => urls[p.id]).length : 0;

  return (
    <Card
      title="Fotos de productos"
      subtitle={products ? `${withPhoto} de ${products.length} con foto · donde no hay foto se ve el icono del giro` : "Fotos reales para el menú digital"}
    >
      {error ? (
        <Muted>{error}</Muted>
      ) : !products ? (
        <Muted>Cargando…</Muted>
      ) : products.length === 0 ? (
        <Muted>El cliente todavía no tiene menú en la Central.</Muted>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {products.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2 dark:border-slate-800">
              {urls[p.id] ? (
                <img src={urls[p.id]} alt="" className="h-14 w-14 flex-none rounded-lg object-cover" />
              ) : (
                <span className="flex h-14 w-14 flex-none items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800">
                  <LuCamera size={18} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{p.name}</p>
                <p className="truncate text-xs text-slate-500">{p.category}</p>
              </div>
              <label
                className={`cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 ${
                  busy === p.id ? "pointer-events-none opacity-50" : ""
                }`}
              >
                {busy === p.id ? "Subiendo…" : urls[p.id] ? "Cambiar" : "Subir foto"}
                <input
                  type="file"
                  accept="image/*"
                  aria-label={`Foto de ${p.name}`}
                  className="hidden"
                  onChange={(e) => {
                    void upload(p, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {urls[p.id] && (
                <button
                  type="button"
                  aria-label={`Quitar la foto de ${p.name}`}
                  disabled={busy === p.id}
                  onClick={() => void remove(p)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"
                >
                  <LuTrash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
