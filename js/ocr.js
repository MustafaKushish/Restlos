// Texterkennung für Kassenbon-Fotos – läuft komplett im Browser (Tesseract.js), das Foto verlässt das Gerät nicht.
// Die Bibliothek (~3 MB inkl. deutscher Sprachdaten) wird erst beim ersten Scan geladen.
import { mergeTexts } from './receipt.js';
import { t } from './i18n.js';

const SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let loading;

function loadLib() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.onload = () => resolve(globalThis.Tesseract);
    s.onerror = () => { loading = null; reject(new Error(t('Texterkennung konnte nicht geladen werden. Bist du online?'))); };
    document.head.append(s);
  });
  return loading;
}

// Schwarz-Weiß mit örtlicher Schwelle (Bradley): Jeder Bildpunkt wird mit seiner Umgebung verglichen,
// so bleiben Schatten, Knicke und verblasste Thermobons lesbar – ein fester Kontrast würde sie verschlucken.
export function binarize(gray, w, h, radius = Math.max(8, Math.round(Math.max(w, h) / 40)), t = 0.13) {
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
      const area = (x1 - x0) * (y1 - y0);
      const s = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
      out[y * w + x] = gray[y * w + x] * area < s * (1 - t) ? 0 : 255;
    }
  }
  return out;
}

// Auf eine Größe bringen, bei der die Bonschrift gut lesbar ist, dann Graustufen und Schwarz-Weiß.
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const long = Math.max(bmp.width, bmp.height);
  const scale = Math.min(2600 / long, Math.max(1, 1800 / long));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const gray = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const bw = binarize(gray, c.width, c.height);
  for (let i = 0; i < bw.length; i++) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = bw[i];
  ctx.putImageData(img, 0, 0);
  return c;
}

// Ein oder mehrere Fotos (Teile eines langen Bons) → ein zusammenhängender Text.
export async function recognize(files, onProgress = () => {}) {
  const list = [files].flat();
  onProgress(0.02, 'Texterkennung wird geladen …');
  const T = await loadLib();
  let part = 0;
  const label = () => (list.length > 1 ? `Foto ${part + 1} von ${list.length} wird gelesen …` : 'Bon wird gelesen …');
  const worker = await T.createWorker('deu', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(0.3 + ((part + m.progress) / list.length) * 0.7, label());
      else if (m.status?.includes('loading')) onProgress(0.05 + (m.progress || 0) * 0.25, 'Sprachdaten werden geladen …');
    },
  });
  try {
    // 4 = eine Spalte mit unterschiedlich großen Zeilen – passt zu Kassenbons besser als ein starrer Textblock.
    await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' });
    const texts = [];
    for (part = 0; part < list.length; part++) {
      const { data } = await worker.recognize(await prepare(list[part]));
      texts.push(data.text);
    }
    return mergeTexts(texts);
  } finally {
    worker.terminate();
  }
}
