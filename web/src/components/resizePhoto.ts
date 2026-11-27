/**
 * Reduce la foto de un producto en el navegador antes de subirla: 1000 px en el lado largo, JPEG.
 * Una foto de celular pesa 3–8 MB; así queda en ~100–300 kB y el menú carga rápido con datos móviles.
 */
const MAX_SIDE = 1000;
const MAX_BYTES = 780_000;

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("No se pudo convertir la foto"))), "image/jpeg", quality));

const base64Of = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export async function resizePhoto(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    // Respeta la orientación de la cámara (EXIF).
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("No se pudo abrir la imagen (usa JPG o PNG)");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sin canvas");
  // Fondo blanco: un PNG transparente no queda negro al pasarlo a JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.82, 0.7, 0.55]) {
    const blob = await toBlob(canvas, quality);
    if (blob.size <= MAX_BYTES) return base64Of(blob);
  }
  throw new Error("La foto sigue pesando demasiado");
}
