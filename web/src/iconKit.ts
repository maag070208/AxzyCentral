/**
 * Abre en el navegador el zip de un kit de iconos (como `iconos_makis.zip` o `kit_pizzeria.zip`)
 * y arma lo que se sube a la Central: PNG de 256 px por llave, más el logo y el ícono de app
 * si el kit los trae (los SVG se pasan a PNG aquí, porque Android no dibuja SVG).
 */
import { unzipSync } from "fflate";

export interface IconKit {
  icons: { key: string; png: string }[];
  logo: string | null;
  appIcon: string | null;
  /** Lo que se ignoró o no se pudo leer, para decírselo a quien sube. */
  warnings: string[];
}

const KEY = /^[a-z0-9_]{1,60}$/;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

const base64Of = (bytes: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

const isPng = (b: Uint8Array) => PNG_MAGIC.every((v, i) => b[i] === v);
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const stem = (path: string) => baseName(path).replace(/\.[^.]+$/, "");

/** SVG → PNG cuadrado del tamaño pedido, dibujado en un canvas. */
const svgToPng = (svg: Uint8Array, size: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Sin canvas"));
      const scale = Math.min(size / (img.naturalWidth || size), size / (img.naturalHeight || size));
      const w = (img.naturalWidth || size) * scale;
      const h = (img.naturalHeight || size) * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png").split(",")[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG ilegible"));
    };
    img.src = url;
  });

/**
 * Busca los PNG en `png/256/` o `iconos_png/256/`; si el kit no trae esa carpeta, toma cualquier
 * PNG fuera de la carpeta de logos. El logo sale de `logo_svg/logo_principal.svg` (o `logo_isotipo`)
 * y el ícono de app de `logo_svg/icono_app.svg`.
 */
export async function readIconKit(file: File): Promise<IconKit> {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const paths = Object.keys(entries).filter((p) => !p.endsWith("/") && !p.includes("__MACOSX") && !baseName(p).startsWith("."));
  const warnings: string[] = [];

  const in256 = paths.filter((p) => /(^|\/)(png|iconos_png)\/256\/[^/]+\.png$/i.test(p));
  const candidates = in256.length > 0 ? in256 : paths.filter((p) => /\.png$/i.test(p) && !/logo/i.test(p) && !/vista_previa|preview/i.test(p));

  const icons: IconKit["icons"] = [];
  const seen = new Set<string>();
  for (const p of candidates) {
    const key = stem(p).toLowerCase();
    if (!KEY.test(key)) {
      warnings.push(`${baseName(p)}: el nombre debe ser minúsculas, números y guion bajo`);
      continue;
    }
    if (seen.has(key)) continue;
    const bytes = entries[p];
    if (!isPng(bytes)) {
      warnings.push(`${baseName(p)}: no es un PNG`);
      continue;
    }
    if (bytes.length > 400_000) {
      warnings.push(`${baseName(p)}: pesa más de 400 kB`);
      continue;
    }
    seen.add(key);
    icons.push({ key, png: base64Of(bytes) });
  }

  const find = (...names: string[]) => paths.find((p) => names.includes(stem(p).toLowerCase()) && /\.(svg|png)$/i.test(p));
  const toPng = async (path: string | undefined, size: number, what: string): Promise<string | null> => {
    if (!path) return null;
    const bytes = entries[path];
    if (/\.png$/i.test(path)) return isPng(bytes) ? base64Of(bytes) : null;
    try {
      return await svgToPng(bytes, size);
    } catch {
      warnings.push(`No se pudo leer el ${what} (${baseName(path)})`);
      return null;
    }
  };
  const logo = await toPng(find("logo_principal", "logo", "logo_isotipo"), 512, "logo");
  const appIcon = await toPng(find("icono_app", "app_icon"), 512, "ícono de app");

  if (icons.length === 0) warnings.push("El zip no trae iconos PNG (se buscan en png/256 o iconos_png/256)");
  return { icons: icons.sort((a, b) => a.key.localeCompare(b.key)), logo, appIcon, warnings };
}
