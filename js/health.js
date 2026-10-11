// Gesund einkaufen: kleine, freundliche Hinweise auf der Einkaufsliste. Nie ein Verbot, nie ein erhobener
// Zeigefinger – höchstens zwei Tipps auf einmal, und man kann sie ausblenden.
import { byId, matchProduct, norm } from './products.js';
import { t, productName } from './i18n.js';

// Süßes und Knabberzeug: bekannte Produkte und Wörter, die man so auf die Liste schreibt.
const SWEET_IDS = ['schokolade', 'eis', 'kuchen'];
const SWEET_WORDS = ['chips', 'cola', 'limo', 'fanta', 'sprite', 'energy', 'gummi', 'keks', 'kekse', 'schoko', 'bonbon', 'suessigkeit', 'donut', 'candy', 'cookie', 'chocolate', 'soda', 'cips', 'cikolata', 'gateau', 'galleta', 'refresco'];
const SODA_WORDS = ['cola', 'limo', 'fanta', 'sprite', 'energy', 'eistee', 'soda', 'refresco'];
const WHITE_IDS = ['toast', 'broetchen', 'nudeln', 'reis'];
// Vorschläge, wenn noch kein Obst und Gemüse auf der Liste steht – lange haltbar, gut für Reste-Rezepte.
const FRESH = ['aepfel', 'moehren', 'bananen', 'paprika', 'brokkoli', 'gurke', 'tomaten', 'orangen'];

const dayNo = (today) => Math.floor(Date.parse(today) / 864e5) || 0;
const has = (name, words) => { const n = norm(name); return words.some((w) => n.includes(w)); };

// names: was noch offen auf der Liste steht. have: Produkt-ids, die schon zu Hause sind.
// Ergebnis: [{ icon, text, add? }] – add ist ein Vorschlag zum Antippen.
export function healthTips(names, { today = '2026-01-01', have = [] } = {}) {
  const tips = [];
  const ids = names.map((n) => matchProduct(n)?.id).filter(Boolean);
  const cats = new Set(ids.map((id) => byId[id]?.cat));
  const day = dayNo(today);

  if (names.length >= 2 && !cats.has('obst') && !cats.has('gemuese')) {
    const pool = FRESH.filter((id) => !have.includes(id));
    const id = pool.length ? pool[day % pool.length] : null;
    if (id) tips.push({ icon: '🥕', text: t('Noch kein Obst oder Gemüse dabei. Wie wäre es mit {name}?', { name: productName(id) }), add: productName(id) });
  }
  const sweet = names.find((n) => SWEET_IDS.includes(matchProduct(n)?.id) || has(n, SWEET_WORDS));
  if (sweet && names.some((n) => has(n, SODA_WORDS))) {
    tips.push({ icon: '💧', text: t('Durst-Tipp: Wasser mit Zitrone oder Saftschorle erfrischt genauso – und Süßes schmeckt dann umso besser.') });
  } else if (sweet) {
    tips.push({ icon: '🍫', text: t('„{name}“ auf der Liste – gönn es dir! Eine kleine Packung reicht oft.', { name: sweet }) });
  }
  if (tips.length < 2 && ids.some((id) => WHITE_IDS.includes(id))) {
    tips.push({ icon: '🌾', text: t('Vollkorn macht länger satt – nur falls du Lust hast, es mal zu probieren.') });
  }
  if (!tips.length) {
    const daily = [
      t('Bunt einkaufen: Je mehr Farben im Korb, desto mehr Vitamine.'),
      t('Mit vollem Bauch einkaufen – dann landet weniger Ungeplantes im Wagen.'),
      t('Bohnen und Linsen sind günstig, halten lange und machen satt.'),
      t('Tiefkühl-Gemüse ist genauso gesund wie frisches und wird nicht schlecht.'),
      t('Nüsse oder ein Apfel sind gute Snacks für unterwegs.'),
    ];
    tips.push({ icon: '💡', text: daily[day % daily.length] });
  }
  return tips.slice(0, 2);
}
