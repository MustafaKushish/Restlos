// Kassenbon mit KI lesen: Das Foto geht an Gemini (bzw. in der claude.ai-Vorschau an Claude), zurück kommt
// eine saubere Liste der Lebensmittel – deutlich genauer als die Texterkennung auf dem Gerät, die bleibt als Rückfall.
import { GEMINI_MODELS, GEMINI_URL } from './chef.js';

export const RECEIPT_PROMPT = `Lies diesen deutschen Kassenbon (Foto). Gib nur Lebensmittel und Getränke zurück.
Lass weg: Pfand, Leergut, Tüten, Drogerie- und Haushaltsartikel, Summen, Zahlungszeilen. Rabatte ziehst du vom Preis des Artikels ab.
Für jeden Artikel:
- name: verständlicher deutscher Produktname ohne Marke und Abkürzungen, so wie man ihn sagt (z. B. „H-Milch“, „Bananen“, „Gouda“, „Hähnchenbrust“)
- qty: Anzahl Stück oder Packungen (bei Ware nach Gewicht 1)
- price: Gesamtpreis dieser Zeile in Euro nach Rabatt
- days: wie viele Tage das Produkt ab Kauf ungefähr hält, wenn man es richtig lagert
- raw: der Artikeltext, wie er auf dem Bon steht
Dazu store (Name des Geschäfts) und date (Kaufdatum als JJJJ-MM-TT), falls lesbar, sonst leer.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    store: { type: 'STRING' },
    date: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, qty: { type: 'NUMBER' }, price: { type: 'NUMBER' }, days: { type: 'NUMBER' }, raw: { type: 'STRING' } },
        required: ['name', 'qty', 'price'],
      },
    },
  },
  required: ['items'],
};

export function receiptRequest(image) {
  return {
    contents: [{ role: 'user', parts: [{ inlineData: image }, { text: RECEIPT_PROMPT }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
  };
}

// Antwort prüfen und auf das Format bringen, das die Bon-Übersicht erwartet.
export function cleanReceipt(data) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(data?.date || '') ? data.date : null;
  const items = (Array.isArray(data?.items) ? data.items : [])
    .map((x) => {
      const qty = Math.max(1, Math.min(99, Math.round(Number(x.qty)) || 1));
      const total = Math.max(0, Number(x.price) || 0);
      const days = Math.round(Number(x.days));
      return {
        name: String(x.name || '').trim().slice(0, 60),
        qty,
        price: Math.round((total / qty) * 100) / 100,
        days: days > 0 && days < 3650 ? days : null,
        raw: String(x.raw || x.name || '').trim().slice(0, 80),
      };
    })
    .filter((x) => x.name);
  return { store: String(data?.store || '').trim().slice(0, 40) || null, date, items };
}

// Foto verkleinern (spart Datenvolumen, reicht zum Lesen) und als Base64-JPEG liefern.
export async function photoForAI(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
  const data = await new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = fail;
    r.readAsDataURL(blob);
  });
  return { blob, image: { mimeType: 'image/jpeg', data } };
}

const textOf = (res) => res?.candidates?.[0]?.content?.parts?.filter((p) => p.text && !p.thought).map((p) => p.text).join('') || '';

// Liest den Bon über Gemini (eigener/App-Schlüssel oder Koch-Server) oder in der Vorschau über Claude.
export async function readReceiptAI(file, { apiKey, server, sample, fetch = globalThis.fetch }) {
  const { blob, image } = await photoForAI(file);
  if (sample) {
    return cleanReceipt(await sample.json(`${RECEIPT_PROMPT}\nAntworte nur mit JSON: {"store": "", "date": "", "items": [{"name": "", "qty": 1, "price": 0, "days": 7, "raw": ""}]}`, { images: [blob] }));
  }
  return cleanReceipt(await geminiJSON(image, { apiKey, server, fetch }));
}

export async function geminiJSON(image, { apiKey, server, fetch = globalThis.fetch }) {
  let last = 0;
  for (const model of server ? [null] : GEMINI_MODELS) {
    const res = server
      ? await fetch(server, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ receipt: image }) })
      : await fetch(`${GEMINI_URL}/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(receiptRequest(image)) });
    if (res.ok) return JSON.parse(textOf(await res.json()) || '{}');
    last = res.status;
    if (server || (res.status !== 404 && res.status !== 429)) break;
  }
  throw new Error(`KI-Bonerkennung nicht erreichbar (Fehler ${last})`);
}
