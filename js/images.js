// Fotos einlesen, verkleinern (spart Speicher und PDF-Größe) und Vorschaubilder erzeugen.

export const MAX_SIDE = 2400;
const THUMB_SIDE = 360;

export async function decode(blob) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      /* Fallback unten */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fit(w, h, max) {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.round(w * s), Math.round(h * s)];
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.86) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht erzeugt werden'))), type, quality));
}

export function drawToCanvas(source, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return c;
}

// Foto aus Kamera/Mediathek → verkleinertes JPEG.
export async function importPhoto(file) {
  const src = await decode(file);
  const [w, h] = fit(src.width, src.height, MAX_SIDE);
  const canvas = drawToCanvas(src, w, h);
  src.close?.();
  const blob = await canvasToBlob(canvas);
  return { blob, width: w, height: h, thumb: await thumbFromCanvas(canvas) };
}

export async function thumbFromCanvas(canvas) {
  const [w, h] = fit(canvas.width, canvas.height, THUMB_SIDE);
  return canvasToBlob(drawToCanvas(canvas, w, h), 'image/jpeg', 0.8);
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Fürs PDF verkleinern: 1600 px lange Seite reicht für A4-Druck; hält das PDF mailtauglich klein.
export async function toPdfImage(blob, maxSide = 1600, quality = 0.72) {
  const src = await decode(blob);
  const [w, h] = fit(src.width, src.height, maxSide);
  const canvas = drawToCanvas(src, w, h);
  src.close?.();
  const small = await canvasToBlob(canvas, 'image/jpeg', quality);
  return { dataUrl: await blobToDataUrl(small), width: w, height: h };
}
