// Kassenbon-Text (aus der Texterkennung oder einem digitalen eBon) → Liste gekaufter Lebensmittel.
// Funktioniert mit den üblichen Formaten von REWE, Edeka, Lidl, Aldi, Penny, Netto, Kaufland:
//   BIO BANANE              1,99 B
//   JA! H-MILCH 3,5%        1,98 B
//     2 Stk x   0,99
//   LOSE WARE               2,09 A
//     0,824 kg x 2,54 EUR/kg
import { matchProduct, isNonFood } from './products.js';

const STORES = ['rewe', 'edeka', 'lidl', 'aldi', 'penny', 'netto', 'kaufland', 'norma', 'globus', 'real', 'tegut', 'denns', 'alnatura', 'dm', 'rossmann', 'marktkauf'];
const END = /\b(summe|zu zahlen|zwischensumme|gesamt|total|gesamtbetrag|endbetrag|bar\b|ec[- ]?cash|kartenzahlung|girocard)/i;
const TOTAL = /\b(summe|zu zahlen|gesamtbetrag|endbetrag|gesamt|total)\b/i;
const COUNT = /\b(?:anzahl\s*(?:der\s*)?(?:artikel|posten)|artikelanzahl|posten|artikel)\s*:?\s*(\d{1,3})\b/i;
const PFAND = /\b(?:pfand|leergut|einweg|mehrweg)/i;
const SKIP = /\b(?:mwst|mw\.?\s?st|ust|steuer|netto|brutto|rückgeld|rueckgeld|gegeben|kasse|bon-?nr|beleg|filiale|uhrzeit|datum|tse|seriennr|signatur|transaktion|terminal|tel|telefon|www|payback|punkte|coupon|gutschein|kundenkarte|danke)\b/i;
const DISCOUNT = /\b(?:rabatt|preisvorteil|nachlass|sofortrabatt|ersparnis|preisreduzierung)\b/i;
// Preis am Zeilenende, danach meist die Steuerklasse (A/B). „2,099 B“ = Texterkennung hat eine Ziffer verdoppelt.
const PRICE_END = /(-?\d{1,4}[.,]\d{2})(?:\d(?=\s+[a-z]\s*$))?\s*(?:-)?\s*(?:[a-z0-9]\b)?\s*\*?\s*$/i;

const num = (s) => parseFloat(s.replace(',', '.'));

// Typische Fehler der Texterkennung glätten: „1 ,99“ → „1,99“, „O,99“ → „0,99“.
function clean(line) {
  return line
    .replace(/\t/g, ' ')
    .replace(/(\d)\s*[,.]\s*(\d{2})(?!\d)/g, '$1,$2')
    .replace(/\b[Oo](?=[,.]\d{2}\b)/g, '0')
    .replace(/[€]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// „2 Stk x 0,99“, „0,824 kg x 2,54 EUR/kg“ – Zeilen ohne eigenen Artikelnamen.
function detail(line) {
  const letters = line.replace(/\b(stk|st|x|kg|eur|euro|g|l|je|á|a)\b/gi, '').replace(/[^a-zäöüß]/gi, '');
  if (letters.length > 1) return null;
  const q = line.match(/^\s*(\d{1,2})\s*(?:stk|st)?\.?\s*[x×*]\s*(\d+,\d{2})/i);
  if (q) return { qty: +q[1], unit: num(q[2]) };
  const w = line.match(/(\d+,\d{1,3})\s*kg/i);
  if (w) return { weight: num(w[1]) };
  return {};
}

function prettify(name) {
  return name.toLowerCase()
    .replace(/(^|[\s\-/(])([a-zäöüß])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseReceipt(text) {
  const rawLines = String(text).split(/\r?\n/);
  const lines = rawLines.map(clean).filter(Boolean);
  const head = lines.slice(0, 8).join(' ').toLowerCase();
  const store = STORES.find((s) => new RegExp(`\\b${s}\\b`).test(head));
  let date = null;
  for (const l of rawLines) {
    const m = l.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\b/);
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      const d = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      if (!Number.isNaN(Date.parse(d))) { date = d; break; }
    }
  }

  const items = [];
  // Was sonst auf dem Bon steht (Drogerie, Haushalt, Pfand) – kommt nicht in den Vorrat, zählt aber für die Summe.
  const others = [];
  let total = null;
  // Steht oft erst unter der Summe.
  const c = lines.find((l) => COUNT.test(l) && !PRICE_END.test(l));
  const count = c ? +c.match(COUNT)[1] : null;
  let prev = null;
  for (const [n, line] of lines.entries()) {
    if (END.test(line) && prev) {
      // „SUMME EUR 13,30“ – der Betrag steht manchmal erst in der nächsten Zeile.
      if (TOTAL.test(line)) {
        const t = line.match(PRICE_END) || (/^[^a-zäöü]*(?:eur)?[^a-zäöü]*$/i.test(lines[n + 1] || '') && lines[n + 1].match(PRICE_END));
        if (t) total = num(t[1]);
      }
      break;
    }
    const d = detail(line);
    if (d && prev) {
      if (d.qty) prev.qty = d.qty;
      if (d.weight) prev.weight = d.weight;
      continue;
    }
    const m = line.match(PRICE_END);
    if (!m) continue;
    let name = line.slice(0, m.index).trim();
    const price = num(m[1]);
    // Pfand und Leergut-Rückgabe (negativ) zuerst, sonst sähe Leergut aus wie ein Rabatt.
    if (PFAND.test(name)) { others.push(prev = { raw: name, name: 'Pfand', kind: 'pfand', price, qty: 1 }); continue; }
    if (price < 0 || DISCOUNT.test(name)) {
      if (prev) prev.price = Math.max(0, +(prev.price - Math.abs(price)).toFixed(2));
      continue;
    }
    if (SKIP.test(line)) continue;
    // Menge in derselben Zeile: „Joghurt mild 2 x 0,49“ oder „2x Joghurt“
    let qty = 1;
    const inl = name.match(/\s(\d{1,2})\s*(?:stk|st)?\.?\s*[x×*]\s*\d+,\d{2}\s*$/i) || name.match(/\s(?:\d+,\d{2})\s*[x×*]\s*(\d{1,2})\s*$/i);
    if (inl) { qty = +inl[1]; name = name.slice(0, inl.index); }
    const lead = name.match(/^(\d{1,2})\s*[x×]\s+/i);
    if (lead) { qty = +lead[1]; name = name.slice(lead[0].length); }
    name = name.replace(/^\d{4,}\s+/, '').replace(/\s+\d{4,}$/, '').replace(/[*#]+/g, '').trim();
    if ((name.match(/[a-zäöüß]/gi) || []).length < 3) continue;
    if (isNonFood(name)) { others.push(prev = { raw: name, name: prettify(name), kind: 'haushalt', price, qty }); continue; }
    const product = matchProduct(name);
    items.push(prev = { raw: name, name: product ? product.name : prettify(name), pid: product?.id ?? null, price, qty, known: !!product });
  }
  // Stückpreis statt Gesamtpreis merken, damit die Bilanz pro Stück rechnet.
  for (const it of [...items, ...others]) {
    it.line = it.price;
    if (it.qty > 1) it.price = +(it.price / it.qty).toFixed(2);
  }
  return { store: store ? store.toUpperCase() : null, date, items, others, total, count };
}

// Mehrere Fotos eines langen Bons überlappen sich. Was am Anfang eines Fotos schon am Ende des vorigen stand, fällt weg.
const key = (l) => clean(l).toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
function similar(a, b) {
  if (a.length < 6 || b.length < 6) return false;
  if (a === b) return true;
  // Texterkennung liest dieselbe Zeile nicht immer gleich – erlaubt ist etwa jeder zehnte Buchstabe anders.
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length] <= Math.max(1, Math.floor(Math.max(a.length, b.length) / 10));
}

export function mergeTexts(texts) {
  let out = [];
  for (const text of texts) {
    const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
    const tail = out.slice(-25).map(key);
    let cut = 0;
    for (let j = 0; j < Math.min(lines.length, 25); j++) {
      if (tail.some((t) => similar(t, key(lines[j])))) cut = j + 1;
    }
    out = out.concat(lines.slice(cut));
  }
  return out.join('\n');
}
