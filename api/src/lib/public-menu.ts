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
  /** Clave del giro (`TAQUERIA`, `SUSHI`…): elige los colores de la carta. */
  giroKey: string;
  /** Lo que la app llama `Catalog`: categorías, productos, grupos de opciones y extras gratis. */
  catalog: Json;
  info: MenuInfo;
  /** El giro usa extras sin costo (cebollitas, chiles…). */
  freeExtras: boolean;
  /** Llave → sha del PNG, del set de iconos del giro. */
  icons: Map<string, string>;
  /** Producto → sha de su foto real (JPEG); un producto con foto la enseña en lugar del icono. */
  photos?: Map<string, string>;
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

/** Colores de cada giro: una carta con identidad propia, como las impresas. */
type Theme = { hero: string; heroInk: string; kicker: string; paper: string; ink: string; muted: string; accent: string; gold: string; line: string };
const THEMES: Record<string, Theme> = {
  TAQUERIA: { hero: "#1F3B2D", heroInk: "#F6EFE3", kicker: "#E0A33A", paper: "#F6EFE3", ink: "#2B1E16", muted: "#7A6A5C", accent: "#C8462B", gold: "#E0A33A", line: "#E3D6C2" },
  SUSHI: { hero: "#161616", heroInk: "#F4F1EA", kicker: "#C9A45C", paper: "#F4F1EA", ink: "#1B1B1B", muted: "#6E6A62", accent: "#B8312F", gold: "#C9A45C", line: "#DED8CC" },
  PIZZERIA: { hero: "#B8322A", heroInk: "#FFF7EA", kicker: "#FFD7A1", paper: "#FBF4E6", ink: "#2A211C", muted: "#7B6B5E", accent: "#B8322A", gold: "#2F6B3A", line: "#EADBC4" },
};
const DEFAULT_THEME: Theme = { hero: "#2F7358", heroInk: "#F4F6F5", kicker: "#E0A33A", paper: "#F4F6F5", ink: "#1E2422", muted: "#6B7470", accent: "#2F7358", gold: "#E0A33A", line: "#DCE3E0" };
export const themeOf = (giroKey: string) => THEMES[giroKey] ?? DEFAULT_THEME;

const priceHtml = (p: Json, category: Json | undefined) => {
  const variants = list(p.variants).filter((v) => str(v.name));
  if (variants.length) {
    return `<ul class="sizes">${variants
      .map((v) => `<li><span>${escapeHtml(str(v.name))}</span><b>${money(Number(v.priceCents) || 0)}</b></li>`)
      .join("")}</ul>`;
  }
  return "";
};

/** Precio de una sola pieza, alineado a la derecha con puntos guía; con tamaños va abajo. */
const singlePrice = (p: Json, category: Json | undefined) => {
  if (list(p.variants).some((v) => str(v.name))) return "";
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

/** Remate de los títulos de sección: línea, rombo y línea. */
const ORNAMENT = `<svg class="orn" viewBox="0 0 120 12" aria-hidden="true"><path d="M0 6h50M70 6h50" stroke="currentColor" stroke-width="1"/><path d="M60 1l5 5-5 5-5-5z" fill="currentColor"/></svg>`;

export const renderMenu = (m: PublicMenuInput): string => {
  const now = m.now ?? new Date();
  const keys = [...m.icons.keys()];
  const groups = new Map(list(m.catalog.modifierGroups).map((g) => [str(g.id), g]));
  const secs = sections(m.catalog);
  const base = m.basePath;
  const t = themeOf(m.giroKey);
  const iconUrl = (key: string) => `${base}/i/${key}.png?v=${m.icons.get(key)!.slice(0, 12)}`;
  const photos = m.photos ?? new Map<string, string>();
  const photoUrl = (p: Json) => {
    const sha = photos.get(str(p.id));
    return sha ? `${base}/f/${encodeURIComponent(str(p.id))}.jpg?v=${sha.slice(0, 12)}` : null;
  };

  /** Si todos los productos de la sección tienen las mismas opciones, se dicen una vez arriba. */
  const sharedOptions = (s: Section) => {
    const first = groupIds(s.products[0]).join("|");
    return s.products.length > 1 && first && s.products.every((p) => groupIds(p).join("|") === first) ? groupIds(s.products[0]) : null;
  };

  const items = (s: Section, shared: boolean) =>
    s.products
      .map((p) => {
        const soldOut = p.active === false;
        const photo = photoUrl(p);
        const key = photo ? null : iconFor(p, s.category, keys);
        const img = photo
          ? `<img class="photo" src="${photo}" alt="${escapeHtml(str(p.name))}" width="96" height="96" loading="lazy">`
          : key
            ? `<img src="${iconUrl(key)}" alt="" width="52" height="52" loading="lazy">`
            : "";
        return `<li class="item${soldOut ? " out" : ""}${photo ? " withphoto" : ""}${img ? "" : " noicon"}">${img}<div class="body"><div class="line"><h3>${escapeHtml(str(p.name))}</h3>${
          soldOut ? `<span class="tag">Agotado</span>` : ""
        }${((price) => (price ? `<span class="dots"></span>${price}` : ""))(singlePrice(p, s.category))}</div>${priceHtml(p, s.category)}${shared ? "" : optionsHtml(groupIds(p), groups)}</div></li>`;
      })
      .join("");

  const section = (s: Section) => {
    const shared = sharedOptions(s);
    const opts = shared ? optionsHtml(shared, groups).replace('class="opts"', 'class="opts shared"') : "";
    return `<section id="${s.id}"><div class="sec"><h2>${escapeHtml(s.name)}</h2>${ORNAMENT}</div>${opts}<ul class="items">${items(s, !!shared)}</ul></section>`;
  };

  // Portada: tres fotos reales del menú si las hay; si no, tres dibujos del giro.
  const all = secs.flatMap((s) => s.products.map((p) => ({ p, s })));
  const heroPhotos = all.map(({ p }) => photoUrl(p)).filter((u): u is string => !!u).slice(0, 3);
  const heroArt = heroPhotos.length
    ? heroPhotos.map((u, i) => `<img class="art pic a${i}" src="${u}" alt="" width="128" height="128">`).join("")
    : [...new Set(all.map(({ p, s }) => iconFor(p, s.category, keys)).filter((k): k is string => !!k))]
        .slice(0, 3)
        .map((k, i) => `<img class="art a${i}" src="${iconUrl(k)}" alt="" width="128" height="128">`)
        .join("");

  const freeList = m.freeExtras && Array.isArray(m.catalog.freeExtras) ? m.catalog.freeExtras.map(String).filter(Boolean) : [];

  const info: string[] = [];
  if (m.info.hours) info.push(`<li>${escapeHtml(m.info.hours)}</li>`);
  if (m.info.address) info.push(`<li>${escapeHtml(m.info.address)}</li>`);
  const wa = m.info.whatsapp ? waLink(m.info.whatsapp) : null;
  if (wa) info.push(`<li><a href="${wa}" rel="noopener">WhatsApp ${escapeHtml(m.info.whatsapp!)}</a></li>`);

  const stale = m.lastSeenAt && now.getTime() - m.lastSeenAt.getTime() > STALE_MS;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="${t.hero}">
<title>${escapeHtml(m.clientName)} · Menú</title>
<meta name="description" content="Menú de ${escapeHtml(m.clientName)}">
<style>
:root{--hero:${t.hero};--hero-ink:${t.heroInk};--kicker:${t.kicker};--paper:${t.paper};--ink:${t.ink};--muted:${t.muted};--accent:${t.accent};--gold:${t.gold};--line:${t.line};
--display:"Didot","Bodoni 72","Bodoni MT","Playfair Display","Noto Serif Display","Noto Serif",Georgia,serif;
--cond:"Avenir Next Condensed","Roboto Condensed","Arial Narrow","sans-serif-condensed",system-ui,sans-serif;
--text:"Avenir Next","Segoe UI",Roboto,system-ui,-apple-system,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 var(--text);-webkit-font-smoothing:antialiased}
.hero{position:relative;overflow:hidden;background:var(--hero);color:var(--hero-ink);padding:40px 20px 36px}
.hero::after{content:"";position:absolute;inset:auto 0 0;height:6px;background:repeating-linear-gradient(90deg,var(--gold) 0 18px,transparent 18px 26px)}
.wrap{position:relative;max-width:820px;margin:0 auto}
.kicker{margin:0;font:700 13px/1 var(--cond);letter-spacing:.28em;text-transform:uppercase;color:var(--kicker)}
h1{margin:10px 0 0;max-width:58%;font:400 clamp(40px,11vw,72px)/.95 var(--display);letter-spacing:-.01em;overflow-wrap:anywhere}
.menu-word{margin:14px 0 0;font:italic 400 22px/1 var(--display);opacity:.85}
.info{list-style:none;margin:20px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;max-width:60%;font:600 14px/1.3 var(--text);opacity:.92}
@media (min-width:600px){.info{flex-direction:row;flex-wrap:wrap;gap:6px 22px;max-width:70%}}
.info a{color:inherit}
.art{position:absolute;width:128px;height:128px;filter:drop-shadow(0 8px 14px rgba(0,0,0,.25))}
.a0{right:-18px;top:-14px;width:118px;height:118px;transform:rotate(-8deg)}
.a1{right:58px;top:78px;width:76px;height:76px;transform:rotate(10deg)}
.a2{right:-12px;top:112px;width:72px;height:72px;transform:rotate(-4deg)}
@media (min-width:600px){.a0{right:-6px;top:-8px;width:170px;height:170px}.a1{right:120px;top:96px;width:116px;height:116px}.a2{right:-10px;top:150px;width:108px;height:108px}}
.art.pic{object-fit:cover;border-radius:50%;border:4px solid var(--hero-ink);filter:drop-shadow(0 10px 18px rgba(0,0,0,.35))}
.stale{max-width:820px;margin:16px auto 0;padding:10px 14px;border-left:3px solid var(--accent);background:rgba(0,0,0,.04);font-size:14px}
nav{position:sticky;top:0;z-index:2;background:var(--paper);border-bottom:1px solid var(--line)}
nav ul{list-style:none;margin:0 auto;padding:12px 20px;display:flex;gap:22px;overflow-x:auto;max-width:860px;scrollbar-width:none}
nav ul::-webkit-scrollbar{display:none}
nav a{display:block;white-space:nowrap;font:700 14px/1 var(--cond);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);text-decoration:none;padding:6px 0;border-bottom:2px solid transparent}
nav a:hover,nav a:focus{color:var(--ink);border-color:var(--accent)}
main{max-width:860px;margin:0 auto;padding:8px 20px 24px}
section{scroll-margin-top:56px;padding-top:28px}
.sec{text-align:center;margin-bottom:14px;color:var(--accent)}
h2{margin:0;font:700 clamp(24px,6vw,30px)/1.05 var(--cond);letter-spacing:.16em;text-transform:uppercase;color:var(--ink)}
.orn{display:block;width:120px;height:12px;margin:8px auto 0}
.opts.shared{max-width:560px;margin:0 auto 14px;text-align:center;font-style:italic}
.items{list-style:none;margin:0;padding:0;display:grid;gap:4px 40px}
@media (min-width:760px){.items{grid-template-columns:1fr 1fr}}
.item{display:flex;gap:14px;align-items:flex-start;padding:12px 0;border-bottom:1px dashed var(--line)}
.item img{flex:none;width:52px;height:52px;border-radius:50%;background:rgba(0,0,0,.035);padding:3px}
.item img.photo{width:96px;height:96px;border-radius:10px;padding:0;object-fit:cover;background:var(--line);box-shadow:0 2px 8px rgba(0,0,0,.12)}
@media (min-width:760px){.item img.photo{width:112px;height:112px}}
.body{flex:1;min-width:0}
.line{display:flex;align-items:baseline;gap:8px}
h3{margin:0;font:600 18px/1.2 var(--text);letter-spacing:.01em}
.dots{flex:1;min-width:16px;border-bottom:2px dotted var(--line);transform:translateY(-4px)}
.price{font:700 18px/1 var(--text);color:var(--accent);white-space:nowrap}
.muted{color:var(--muted);font-weight:500;font-size:15px}
.sizes{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:4px 18px;font-size:15px}
.sizes li{display:flex;gap:6px;color:var(--muted)}
.sizes b{color:var(--accent);font-weight:700}
.opts{list-style:none;margin:6px 0 0;padding:0;color:var(--muted);font-size:14px;line-height:1.4}
.opts span{color:var(--ink);font-weight:600;font-style:normal}
.out h3{text-decoration:line-through;color:var(--muted)}
.out img{opacity:.4;filter:grayscale(1)}
.out .price,.out .sizes b{color:var(--muted)}
.tag{flex:none;padding:3px 8px;border-radius:4px;background:var(--accent);color:#fff;font:700 11px/1 var(--cond);letter-spacing:.12em;text-transform:uppercase}
.free{margin:32px auto 0;max-width:560px;padding:16px 18px;text-align:center;border:1px solid var(--line);border-radius:4px;font-size:15px}
.free b{font:700 13px/1 var(--cond);letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-right:6px}
footer{margin-top:24px;padding:28px 20px 36px;background:var(--hero);color:var(--hero-ink);text-align:center}
footer .name{margin:0;font:400 26px/1.1 var(--display)}
footer p{margin:6px 0 0;font-size:13px;opacity:.75}
.empty{padding:40px 0;text-align:center;color:var(--muted)}
</style>
</head>
<body>
<header class="hero">
<div class="wrap">
${heroArt}
<p class="kicker">${escapeHtml(m.giroName)}</p>
<h1>${escapeHtml(m.clientName)}</h1>
<p class="menu-word">Menú</p>
${info.length ? `<ul class="info">${info.join("")}</ul>` : ""}
</div>
</header>
${stale ? `<p class="stale">Menú actualizado hace ${ago(now.getTime() - m.lastSeenAt!.getTime())}; puede haber cambios.</p>` : ""}
${secs.length > 1 ? `<nav aria-label="Categorías"><ul>${secs.map((s) => `<li><a href="#${s.id}">${escapeHtml(s.name)}</a></li>`).join("")}</ul></nav>` : ""}
<main>
${secs.length ? secs.map(section).join("\n") : `<p class="empty">Este menú todavía no tiene productos.</p>`}
${freeList.length ? `<p class="free"><b>Sin costo</b> ${escapeHtml(freeList.join(", "))}</p>` : ""}
</main>
<footer><p class="name">${escapeHtml(m.clientName)}</p><p>Precios en pesos mexicanos · Pide a tu mesero</p></footer>
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
