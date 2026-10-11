// Kassenbon mit KI lesen: Die Fotos gehen an Gemini (bzw. in der claude.ai-Vorschau an Claude), zurück kommt
// jede Zeile des Bons – deutlich genauer als die Texterkennung auf dem Gerät, die bleibt als Rückfall.
// Ein langer Bon darf aus mehreren, sich überlappenden Fotos bestehen. Zeigt das Foto keinen Bon, sondern
// Lebensmittel selbst (Einkauf auf dem Tisch, Kühlschrank), zählt die KI die Produkte.
import { GEMINI_MODELS, GEMINI_URL, nextModel } from './chef.js';

export const MAX_PHOTOS = 6;
export const KINDS = ['essen', 'haushalt', 'pfand'];

export const RECEIPT_PROMPT = `Du bekommst ein oder mehrere Fotos.

FALL A – Kassenbon (type "bon"):
Mehrere Fotos zeigen denselben langen Bon in Teilen von oben nach unten, die sich überlappen können. Jede Zeile des Bons zählt genau einmal.
Lies den Bon vollständig, Zeile für Zeile, und lass keinen Artikel aus – auch Drogerie, Haushalt und Pfand.
Für jeden Artikel:
- name: verständlicher deutscher Produktname ohne Marke und Abkürzungen, so wie man ihn sagt (z. B. „H-Milch“, „Bananen“, „Gouda“, „Spülmittel“)
- kind: "essen" für Lebensmittel und Getränke, "haushalt" für alles andere (Drogerie, Haushalt, Tierfutter, Tüten, Blumen …), "pfand" für Pfand und Leergut
- qty: Anzahl Stück oder Packungen. Mengenzeilen wie „2 Stk x 0,99“ gehören zum Artikel darüber. Bei Ware nach Gewicht 1.
- price: Gesamtpreis dieser Zeile in Euro nach Rabatt. Rabattzeilen sind kein eigener Artikel, sie werden vom Artikel darüber abgezogen. Leergut-Rückgabe ist negativ.
- days: wie viele Tage das Produkt ab Kauf ungefähr hält, wenn man es richtig lagert (bei haushalt und pfand 0)
- raw: der Artikeltext, wie er auf dem Bon steht
Dazu:
- store: Name des Geschäfts, date: Kaufdatum als JJJJ-MM-TT (leer, wenn nicht lesbar)
- total: der Endbetrag (SUMME, zu zahlen) als Zahl, 0 wenn nicht lesbar
- count: die auf dem Bon gedruckte Artikelanzahl (z. B. „Anzahl Artikel: 14“, „Posten 14“), 0 wenn keine dasteht

FALL B – kein Bon, sondern Lebensmittel selbst (Einkauf auf dem Tisch, Kühlschrank, Vorratsschrank; type "produkte"):
Liste jedes erkennbare Produkt einmal, qty = wie oft es zu sehen ist (genau zählen, z. B. 6 Eier, 3 Joghurtbecher).
name wie oben, kind, price 0, days ab heute geschätzt, raw = Aufschrift oder kurze Beschreibung. total und count 0.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    type: { type: 'STRING', enum: ['bon', 'produkte'] },
    store: { type: 'STRING' },
    date: { type: 'STRING' },
    total: { type: 'NUMBER' },
    count: { type: 'NUMBER' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          kind: { type: 'STRING', enum: KINDS },
          qty: { type: 'NUMBER' },
          price: { type: 'NUMBER' },
          days: { type: 'NUMBER' },
          raw: { type: 'STRING' },
        },
        required: ['name', 'kind', 'qty', 'price'],
      },
    },
  },
  required: ['type', 'items'],
};

// Ein Bild ({ mimeType, data }) oder mehrere.
export function receiptRequest(images) {
  const list = (Array.isArray(images) ? images : [images]).slice(0, MAX_PHOTOS);
  return {
    contents: [{ role: 'user', parts: [...list.map((inlineData) => ({ inlineData })), { text: RECEIPT_PROMPT }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
  };
}

const money = (n) => Math.round(n * 100) / 100;

// Antwort prüfen und auf das Format bringen, das die Bon-Übersicht erwartet.
export function cleanReceipt(data) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(data?.date || '') ? data.date : null;
  const items = (Array.isArray(data?.items) ? data.items : [])
    .map((x) => {
      const qty = Math.max(1, Math.min(99, Math.round(Number(x.qty)) || 1));
      const kind = KINDS.includes(x.kind) ? x.kind : 'essen';
      const raw = Number(String(x.price ?? '').replace(',', '.'));
      // Nur Pfand/Leergut darf negativ sein.
      const line = Number.isFinite(raw) ? money(kind === 'pfand' ? raw : Math.max(0, raw)) : 0;
      const days = Math.round(Number(x.days));
      return {
        name: String(x.name || '').trim().slice(0, 60),
        kind,
        qty,
        line,
        price: money(line / qty),
        days: days > 0 && days < 3650 ? days : null,
        raw: String(x.raw || x.name || '').trim().slice(0, 80),
      };
    })
    .filter((x) => x.name);
  const total = Number(data?.total);
  const count = Math.round(Number(data?.count));
  return {
    type: data?.type === 'produkte' ? 'produkte' : 'bon',
    store: String(data?.store || '').trim().slice(0, 40) || null,
    date,
    total: total > 0 && total < 10000 ? money(total) : null,
    count: count > 0 && count < 1000 ? count : null,
    items,
  };
}

// Stimmt die Summe aller gelesenen Zeilen mit dem Endbetrag auf dem Bon? Dann fehlt nichts.
export function checkTotal({ total, count, items }) {
  const sum = money(items.reduce((s, x) => s + (x.line ?? x.price * x.qty), 0));
  const pieces = items.filter((x) => x.kind !== 'pfand').reduce((s, x) => s + x.qty, 0);
  const lines = items.filter((x) => x.kind !== 'pfand').length;
  return {
    sum,
    pieces,
    total,
    diff: total ? money(total - sum) : null,
    ok: total ? Math.abs(total - sum) <= 0.02 : null,
    // Manche Märkte drucken die Anzahl der Zeilen, andere die der Stücke.
    countOk: count ? count === pieces || count === lines : null,
  };
}

// Foto verkleinern (spart Datenvolumen, reicht zum Lesen) und als Base64-JPEG liefern.
// 2400 px, damit auch die kleine Schrift langer Bons lesbar bleibt.
export async function photoForAI(file, max = 2400) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
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
export async function readReceiptAI(files, { apiKey, server, sample, fetch = globalThis.fetch }) {
  const photos = await Promise.all([files].flat().slice(0, MAX_PHOTOS).map((f) => photoForAI(f)));
  if (sample) {
    return cleanReceipt(await sample.json(`${RECEIPT_PROMPT}\nAntworte nur mit JSON: {"type": "bon", "store": "", "date": "", "total": 0, "count": 0, "items": [{"name": "", "kind": "essen", "qty": 1, "price": 0, "days": 7, "raw": ""}]}`, { images: photos.map((p) => p.blob) }));
  }
  return cleanReceipt(await geminiJSON(photos.map((p) => p.image), { apiKey, server, fetch }));
}

export async function geminiJSON(images, { apiKey, server, fetch = globalThis.fetch }) {
  const list = Array.isArray(images) ? images : [images];
  let last = 0;
  for (const model of server ? [null] : GEMINI_MODELS) {
    const res = server
      ? await fetch(server, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ receipt: list }) })
      : await fetch(`${GEMINI_URL}/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(receiptRequest(list)) });
    if (res.ok) return JSON.parse(textOf(await res.json()) || '{}');
    last = res.status;
    if (server || !nextModel(res.status)) break;
  }
  throw new Error(`KI-Bonerkennung nicht erreichbar (Fehler ${last})`);
}
