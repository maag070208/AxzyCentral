/**
 * Menú digital público: la página que ve el comensal en `menu.axzy.dev/<slug>` (o `/m/<slug>` en el API).
 *
 * Se arma en el servidor, sin JavaScript, para que cargue rápido en celulares baratos. Solo usa lo
 * que el local quiere enseñar (nombre, menú y sus datos); nunca ventas, PIN, dispositivos ni cobros.
 */

type Json = Record<string, unknown>;

export type MenuInfo = { hours?: string | null; whatsapp?: string | null; address?: string | null };

export type PublicMenuInput = {
  /** Ruta de la página sin `/` final (`/don-luigi` en el dominio del menú, `/m/don-luigi` en el API). */
  basePath: string;
  clientName: string;
  giroName: string;
  /** Lo que la app llama `Catalog`: categorías, productos, grupos de opciones y extras gratis. */
  catalog: Json;
  info: MenuInfo;
  /** El giro usa extras sin costo (cebollitas, chiles…). */
  freeExtras: boolean;
  /** Llave → sha del PNG, del set de iconos del giro. */
  icons: Map<string, string>;
  /** Última vez que la cocina habló con la Central; null si nunca. */
  lastSeenAt: Date | null;
  now?: Date;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x): x is Json => !!x && typeof x === "object") : []);

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Igual que `DishIcons.slug` de la app: "Dragón Roll" → `dragon_roll`. */
export const iconSlug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const ALIAS: Record<string, string> = { mixto: "campechano", agua_de_sabor: "agua_fresca" };

/**
 * El icono de un producto, en el mismo orden que la app (`DishIcons.productKeys` + `IconStore`):
 * la llave que eligió el admin, por nombre en el set ("Pepperoni" → `pizza_pepperoni`), la de taquería
 * por categoría, la de la categoría y al final el genérico del set. null = el set no tiene ninguno.
 */
export const iconFor = (product: Json, category: Json | undefined, keys: string[]): string | null => {
  const has = new Set(keys);
  const sorted = [...keys].sort();
  const n = ((s) => ALIAS[s] ?? s)(iconSlug(str(product.name)));
  const cat = iconSlug(str(category?.name ?? product.category));
  const own = cat === "tacos" ? `taco_${n}` : cat === "bebidas" ? `beb_${n}` : `esp_${n}`;
  const byName = sorted.find((k) => k.slice(k.indexOf("_") + 1) === n && !k.startsWith("ing_"));
  const candidates = [str(product.icon), byName ?? "", own, `cat_${cat}`, `esp_${iconSlug(str(category?.singular))}`];
  return (
    candidates.find((k) => k && has.has(k)) ??
    sorted.find((k) => k.endsWith("_generico") || k.endsWith("_generica")) ??
    null
  );
};

export const money = (cents: number) => {
  const pesos = cents / 100;
  return `$${pesos.toLocaleString("es-MX", { minimumFractionDigits: Number.isInteger(pesos) ? 0 : 2, maximumFractionDigits: 2 })}`;
};

/** "hace 3 h": solo se muestra cuando la cocina lleva rato sin conectarse. */
const STALE_MS = 30 * 60_000;
const ago = (ms: number) => {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} días`;
};

const waLink = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.length === 10 ? `52${digits}` : digits}`;
};

type Section = { name: string; id: string; category: Json | undefined; products: Json[] };

/** Categorías en el orden del menú; productos de una categoría que ya no existe van al final, en "Otros". */
const sections = (catalog: Json): Section[] => {
  const categories = list(catalog.categories);
  const products = list(catalog.products);
  const known = new Set(categories.map((c) => str(c.name)));
  const out: Section[] = categories.map((c, i) => ({
    name: str(c.name),
    id: `c${i}`,
    category: c,
    products: products.filter((p) => str(p.category) === str(c.name)),
  }));
  const orphans = products.filter((p) => !known.has(str(p.category)));
  if (orphans.length) out.push({ name: "Otros", id: "otros", category: undefined, products: orphans });
  return out.filter((s) => s.products.length);
};

const priceHtml = (p: Json, category: Json | undefined) => {
  const variants = list(p.variants).filter((v) => str(v.name));
  if (variants.length) {
    return `<ul class="sizes">${variants
      .map((v) => `<li><span>${escapeHtml(str(v.name))}</span><b>${money(Number(v.priceCents) || 0)}</b></li>`)
      .join("")}</ul>`;
  }
  const cents = Number(p.priceCents) || 0;
  if (cents > 0) return `<b class="price">${money(cents)}</b>`;
  return category?.byAmount ? `<span class="price muted">Por monto</span>` : "";
};

const groupIds = (p: Json) => (Array.isArray(p.modifierGroupIds) ? p.modifierGroupIds.map(String) : []);

const optionsHtml = (ids: string[], groups: Map<string, Json>) => {
  const lines = ids
    .map((id) => groups.get(id))
    .filter((g): g is Json => !!g && Array.isArray(g.options) && g.options.length > 0)
    .map((g) => `<li><span>${escapeHtml(str(g.name))}:</span> ${escapeHtml((g.options as unknown[]).map(String).join(", "))}</li>`);
  return lines.length ? `<ul class="opts">${lines.join("")}</ul>` : "";
};

export const renderMenu = (m: PublicMenuInput): string => {
  const now = m.now ?? new Date();
  const keys = [...m.icons.keys()];
  const groups = new Map(list(m.catalog.modifierGroups).map((g) => [str(g.id), g]));
  const secs = sections(m.catalog);
  const base = m.basePath;

  /** Si todos los productos de la sección tienen las mismas opciones, se dicen una vez arriba. */
  const sharedOptions = (s: Section) => {
    const first = groupIds(s.products[0]).join("|");
    return s.products.length > 1 && first && s.products.every((p) => groupIds(p).join("|") === first) ? groupIds(s.products[0]) : null;
  };

  const items = (s: Section, shared: boolean) =>
    s.products
      .map((p) => {
        const soldOut = p.active === false;
        const key = iconFor(p, s.category, keys);
        // Sin set de iconos no se deja un cuadro vacío; con set, el cuadro mantiene la columna alineada.
        const img = key
          ? `<img src="${base}/i/${key}.png?v=${m.icons.get(key)!.slice(0, 12)}" alt="" width="56" height="56" loading="lazy">`
          : keys.length
            ? `<span class="noimg"></span>`
            : "";
        return `<li class="item${soldOut ? " out" : ""}">${img}<div class="body"><div class="row"><h3>${escapeHtml(str(p.name))}</h3>${
          soldOut ? `<span class="tag">Agotado</span>` : ""
        }</div>${priceHtml(p, s.category)}${shared ? "" : optionsHtml(groupIds(p), groups)}</div></li>`;
      })
      .join("");

  const section = (s: Section) => {
    const shared = sharedOptions(s);
    const opts = shared ? optionsHtml(shared, groups).replace('class="opts"', 'class="opts shared"') : "";
    return `<section id="${s.id}"><h2>${escapeHtml(s.name)}</h2>${opts}<ul class="items">${items(s, !!shared)}</ul></section>`;
  };

  const freeList = m.freeExtras && Array.isArray(m.catalog.freeExtras) ? m.catalog.freeExtras.map(String).filter(Boolean) : [];

  const info: string[] = [];
  if (m.info.hours) info.push(`<li>🕒 ${escapeHtml(m.info.hours)}</li>`);
  if (m.info.address) info.push(`<li>📍 ${escapeHtml(m.info.address)}</li>`);
  const wa = m.info.whatsapp ? waLink(m.info.whatsapp) : null;
  if (wa) info.push(`<li><a href="${wa}" rel="noopener">💬 WhatsApp ${escapeHtml(m.info.whatsapp!)}</a></li>`);

  const stale = m.lastSeenAt && now.getTime() - m.lastSeenAt.getTime() > STALE_MS;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(m.clientName)} · Menú</title>
<meta name="description" content="Menú de ${escapeHtml(m.clientName)}">
<style>
:root{--bg:#F4F6F5;--card:#fff;--line:#E6EAE8;--soft:#E8F2EE;--primary:#3F8F6F;--text:#1E2422;--muted:#6B7470;--late:#C8432F}
@media (prefers-color-scheme:dark){:root{--bg:#121614;--card:#1B201E;--line:#2A312E;--soft:#1F2D27;--primary:#6CC39F;--text:#E8EDEA;--muted:#9AA39F;--late:#F07A66}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{padding:24px 16px 8px;max-width:720px;margin:0 auto}
h1{margin:0;font-size:28px;line-height:1.15}
.giro{margin:4px 0 0;color:var(--muted)}
.info{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px 16px;color:var(--muted);font-size:15px}
.info a{color:var(--primary);font-weight:600;text-decoration:none}
.stale{margin:12px 0 0;padding:8px 12px;border-radius:10px;background:var(--soft);font-size:14px}
nav{position:sticky;top:0;z-index:1;background:var(--bg);border-bottom:1px solid var(--line)}
nav ul{list-style:none;margin:0 auto;padding:10px 16px;display:flex;gap:8px;overflow-x:auto;max-width:720px;scrollbar-width:none}
nav a{display:block;white-space:nowrap;padding:8px 14px;border-radius:999px;background:var(--card);border:1px solid var(--line);color:var(--text);text-decoration:none;font-weight:600;font-size:15px}
main{max-width:720px;margin:0 auto;padding:8px 16px 32px}
section{scroll-margin-top:64px}
h2{margin:24px 0 8px;font-size:20px}
.items{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.item{display:flex;gap:12px;padding:12px;background:var(--card);border:1px solid var(--line);border-radius:14px}
.item img,.noimg{flex:none;width:56px;height:56px;border-radius:12px;background:var(--soft)}
.body{flex:1;min-width:0}
.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
h3{margin:0;font-size:17px}
.price{display:block;margin-top:2px;color:var(--primary);font-size:17px}
.muted{color:var(--muted);font-weight:400}
.sizes{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:4px 16px}
.sizes li{display:flex;gap:6px}
.sizes b{color:var(--primary)}
.opts{list-style:none;margin:6px 0 0;padding:0;color:var(--muted);font-size:14px}
.opts span{color:var(--text)}
.opts.shared{margin:-4px 0 10px}
.out h3{text-decoration:line-through;color:var(--muted)}
.out img{opacity:.45;filter:grayscale(1)}
.out .price,.out .sizes b{color:var(--muted)}
.tag{padding:2px 8px;border-radius:999px;background:var(--late);color:#fff;font-size:12px;font-weight:700}
.free{margin:24px 0 0;padding:12px;border-radius:14px;background:var(--soft);font-size:15px}
footer{max-width:720px;margin:0 auto;padding:0 16px 32px;color:var(--muted);font-size:13px}
.empty{padding:32px 0;color:var(--muted)}
</style>
</head>
<body>
<header>
<h1>${escapeHtml(m.clientName)}</h1>
<p class="giro">${escapeHtml(m.giroName)}</p>
${info.length ? `<ul class="info">${info.join("")}</ul>` : ""}
${stale ? `<p class="stale">Menú actualizado hace ${ago(now.getTime() - m.lastSeenAt!.getTime())}; puede haber cambios.</p>` : ""}
</header>
${secs.length > 1 ? `<nav aria-label="Categorías"><ul>${secs.map((s) => `<li><a href="#${s.id}">${escapeHtml(s.name)}</a></li>`).join("")}</ul></nav>` : ""}
<main>
${
  secs.length
    ? secs.map(section).join("\n")
    : `<p class="empty">Este menú todavía no tiene productos.</p>`
}
${freeList.length ? `<p class="free"><b>Sin costo:</b> ${escapeHtml(freeList.join(", "))}</p>` : ""}
</main>
<footer>Precios en pesos mexicanos. Pide a tu mesero.</footer>
</body>
</html>`;
};

/** Página de "no disponible": slug que no existe, menú apagado, cliente suspendido o sin menú. */
export const renderUnavailable = () => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Menú no disponible</title>
<style>:root{--bg:#F4F6F5;--text:#1E2422;--muted:#6B7470}@media (prefers-color-scheme:dark){:root{--bg:#121614;--text:#E8EDEA;--muted:#9AA39F}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:16px/1.4 system-ui,sans-serif;padding:16px;text-align:center}
p{color:var(--muted)}</style></head>
<body><div><h1>Este menú no está disponible</h1><p>Pregunta en el local por su menú.</p></div></body></html>`;
