import QRCode from "qrcode";

/** Hoja carta: 6 tarjetas para mesas (se recortan y se doblan) o 1 cartel grande para el mostrador. */
export type QrSheet = "mesas" | "mostrador";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Abre una ventana con los QR listos para imprimir (o "Guardar como PDF" en el diálogo de impresión).
 * Se abre en el clic del botón para que el navegador no la bloquee; el QR se dibuja después.
 */
export async function printMenuQr(sheet: QrSheet, clientName: string, url: string) {
  const win = window.open("", "_blank");
  if (!win) throw new Error("El navegador bloqueó la ventana de impresión");
  win.document.write("<p style=\"font:16px system-ui;padding:24px\">Preparando los QR…</p>");
  // Corrección alta: el QR se sigue leyendo aunque se manche o se doble en la mesa.
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: "H", margin: 1, width: sheet === "mesas" ? 600 : 1200 });
  const shortUrl = url.replace(/^https?:\/\//, "");
  const card = `<div class="card"><p class="cta">Escanea para ver el menú</p><img src="${qr}" alt="QR del menú"><p class="name">${esc(
    clientName
  )}</p><p class="url">${esc(shortUrl)}</p></div>`;
  win.document.open();
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR · ${esc(clientName)}</title>
<style>
@page{size:letter;margin:12mm}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1E2422}
.sheet{display:grid;gap:0;${sheet === "mesas" ? "grid-template-columns:1fr 1fr;grid-auto-rows:84mm" : "grid-template-columns:1fr;min-height:250mm"}}
.card{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:6mm;border:1px dashed #C9D1CD}
.cta{margin:0 0 3mm;font-weight:700;font-size:${sheet === "mesas" ? "14pt" : "30pt"};color:#2F7358}
img{width:${sheet === "mesas" ? "52mm" : "150mm"};height:auto}
.name{margin:3mm 0 0;font-weight:700;font-size:${sheet === "mesas" ? "13pt" : "28pt"}}
.url{margin:1mm 0 0;font-size:${sheet === "mesas" ? "9pt" : "16pt"};color:#6B7470}
@media screen{body{background:#EEF1F0;padding:16px}.sheet{max-width:216mm;margin:0 auto;background:#fff}}
</style></head><body><div class="sheet">${sheet === "mesas" ? card.repeat(6) : card}</div></body></html>`);
  win.document.close();
  const img = win.document.querySelector("img");
  if (img && !img.complete) await new Promise((ok) => img.addEventListener("load", ok, { once: true }));
  win.focus();
  win.print();
}
