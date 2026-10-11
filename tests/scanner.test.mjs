import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt, mergeTexts } from '../js/receipt.js';
import { cleanReceipt, checkTotal, receiptRequest } from '../js/receiptai.js';
import { frameStats, hintFor } from '../js/camera.js';
import { binarize } from '../js/ocr.js';
import worker from '../worker/koch.js';

test('Bon: alles wird gelesen – Drogerie und Pfand landen in „others“, Summe und Artikelanzahl werden erkannt', () => {
  const r = parseReceipt(`REWE
BIO BANANE 1,99 B
COLA 1,5L 1,19 B
PFAND 0,25 A
SPUELMITTEL 1,29 A
LEERGUT -0,75 A
JOGHURT 2 Stk x 0,49 0,98 B
SUMME EUR 4,95
Anzahl Artikel: 6`);
  assert.deepEqual(r.items.map((i) => [i.pid, i.qty, i.line]), [['bananen', 1, 1.99], [r.items[1].pid, 1, 1.19], ['joghurt', 2, 0.98]]);
  assert.deepEqual(r.others.map((o) => [o.kind, o.line]), [['pfand', 0.25], ['haushalt', 1.29], ['pfand', -0.75]]);
  // Leergut darf nicht als Rabatt vom Artikel davor abgezogen werden.
  assert.equal(r.others[1].price, 1.29);
  assert.equal(r.total, 4.95);
  assert.equal(r.count, 6);
  const c = checkTotal({ total: r.total, count: r.count, items: [...r.items, ...r.others] });
  assert.equal(c.ok, true);
  assert.equal(c.pieces, 5);
});

test('Bon: Endbetrag in der nächsten Zeile', () => {
  const r = parseReceipt('LIDL\nBananen 1,49 A\nzu zahlen\nEUR 1,49');
  assert.equal(r.total, 1.49);
});

test('Summen-Abgleich meldet fehlende Beträge', () => {
  const items = [{ kind: 'essen', qty: 2, line: 1.98 }, { kind: 'pfand', qty: 1, line: 0.25 }];
  assert.deepEqual(checkTotal({ total: 5.23, count: 3, items }), { sum: 2.23, pieces: 2, total: 5.23, diff: 3, ok: false, countOk: false });
  assert.equal(checkTotal({ total: null, items }).ok, null);
});

test('Mehrere Fotos eines langen Bons: Überlappung fällt weg, auch mit Lesefehlern', () => {
  const a = 'REWE\nBIO BANANE 1,99 B\nJA! H-MILCH 3,5% 1,98 B\nGOUDA JUNG 1,79 B';
  const b = 'JA! H-MlLCH 3,5% 1,98 B\nGOUDA JUNG 1,79 B\nRISPENTOMATEN 2,09 B\nSUMME 7,85';
  const merged = mergeTexts([a, b]);
  assert.equal(merged.split('\n').filter((l) => /GOUDA/.test(l)).length, 1);
  assert.equal(merged.split('\n').filter((l) => /MILCH|MlLCH/.test(l)).length, 1);
  assert.match(merged, /RISPENTOMATEN/);
  assert.equal(parseReceipt(merged).total, 7.85);
});

test('KI-Bon: mehrere Fotos in einer Anfrage, Art und Summe werden geprüft', () => {
  const req = receiptRequest([{ mimeType: 'image/jpeg', data: 'A' }, { mimeType: 'image/jpeg', data: 'B' }]);
  assert.deepEqual(req.contents[0].parts.slice(0, 2).map((p) => p.inlineData.data), ['A', 'B']);
  assert.match(req.contents[0].parts[2].text, /genau einmal/);
  const r = cleanReceipt({ type: 'bon', total: '3,10', count: 3, items: [
    { name: 'Leergut', kind: 'pfand', qty: 1, price: -0.75 },
    { name: 'Spülmittel', kind: 'haushalt', qty: 1, price: 1.29 },
    { name: 'Milch', kind: 'quatsch', qty: 2, price: -1 },
  ] });
  assert.deepEqual(r.items.map((x) => [x.kind, x.line]), [['pfand', -0.75], ['haushalt', 1.29], ['essen', 0]]);
  assert.equal(r.total, null); // „3,10“ als Text ist keine Zahl – lieber keine Summe als eine falsche
  assert.equal(cleanReceipt({ type: 'produkte', items: [] }).type, 'produkte');
});

test('Koch-Server nimmt mehrere Bon-Fotos an, aber nicht beliebig viele', async () => {
  const env = { GEMINI_API_KEY: 'AIzaServer', ALLOWED_ORIGIN: 'https://mustafakushish.github.io' };
  const post = (body) => new Request('https://koch.example/', { method: 'POST', headers: { origin: 'https://mustafakushish.github.io' }, body: JSON.stringify(body) });
  const realFetch = globalThis.fetch;
  let up;
  globalThis.fetch = async (url, init) => { up = JSON.parse(init.body); return Response.json({ candidates: [] }); };
  try {
    const img = { mimeType: 'image/jpeg', data: 'AAAA' };
    assert.equal((await worker.fetch(post({ receipt: [img, img] }), env)).status, 200);
    assert.equal(up.contents[0].parts.length, 3);
    assert.equal((await worker.fetch(post({ receipt: Array(7).fill(img) }), env)).status, 413);
    assert.equal((await worker.fetch(post({ receipt: [img, { mimeType: 'text/html', data: 'x' }] }), env)).status, 400);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Kamera-Hinweise: dunkel, wackelig, gut', () => {
  const px = (v) => new Uint8ClampedArray(64 * 4).fill(v);
  const dark = frameStats(px(20));
  assert.match(hintFor(dark, { shots: 0, torch: true }).text, /Lampe/);
  const a = frameStats(px(120));
  const b = frameStats(px(160), a.gray);
  assert.match(hintFor(b, { shots: 0 }).text, /Ruhig/);
  const c = frameStats(px(160), b.gray);
  assert.deepEqual(hintFor(c, { shots: 1 }), { text: 'Gut – nächstes Stück oder „Fertig“', ok: true });
});

test('Texterkennung: Schatten wird ausgeglichen (örtliche Schwelle)', () => {
  // Links hell, rechts im Schatten – auf beiden Seiten ein dunkler Strich, der schwarz werden muss.
  const w = 40, h = 10, g = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = x < 20 ? 220 : 90;
  for (let y = 0; y < h; y++) { g[y * w + 8] = 120; g[y * w + 30] = 30; }
  const bw = binarize(g, w, h, 4);
  assert.equal(bw[5 * w + 8], 0);
  assert.equal(bw[5 * w + 30], 0);
  assert.equal(bw[5 * w + 2], 255);
  assert.equal(bw[5 * w + 35], 255);
});
