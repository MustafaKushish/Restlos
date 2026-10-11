// Sprachen. Deutsch ist die Grundlage: Im Code steht der deutsche Text in t('…'), die Übersetzungen liegen
// in js/lang/<code>.js. Neuer Text: t('Deutscher Text') schreiben und in jede Sprachdatei eintragen –
// fehlt eine Übersetzung, erscheint der deutsche Text, und `npm test` sagt, was fehlt.
// Neue Sprache: Eintrag in LANGS, Datei js/lang/<code>.js nach dem Muster von en.js, in sw.js aufnehmen.
import { PRODUCTS, addProductNames } from './products.js';

export const LANGS = {
  de: { name: 'Deutsch', locale: 'de-DE', de: 'Deutsch' },
  en: { name: 'English', locale: 'en-GB', de: 'Englisch' },
  tr: { name: 'Türkçe', locale: 'tr-TR', de: 'Türkisch' },
  ar: { name: 'العربية', locale: 'ar-u-nu-latn', de: 'Arabisch', dir: 'rtl' },
  fr: { name: 'Français', locale: 'fr-FR', de: 'Französisch' },
  es: { name: 'Español', locale: 'es-ES', de: 'Spanisch' },
};
const KEY = 'restlos:lang';

// Gespeicherte Wahl, sonst die Sprache des Geräts, sonst Englisch.
export function pickLang(saved, wanted = []) {
  if (LANGS[saved]) return saved;
  for (const w of wanted) {
    const code = String(w).toLowerCase().split('-')[0];
    if (LANGS[code]) return code;
  }
  return 'en';
}

const browser = typeof document !== 'undefined';
const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
// Ohne Browser (Tests, Koch-Server) bleibt alles Deutsch.
export let lang = browser ? pickLang(stored(), navigator.languages?.length ? navigator.languages : [navigator.language]) : 'de';
let dict = {};

export async function useLang(code, data) {
  lang = LANGS[code] ? code : 'de';
  dict = data ?? (lang === 'de' ? {} : (await import(`./lang/${lang}.js`)).default);
  addProductNames(lang === 'de' ? {} : dict.products || {});
  return lang;
}
await useLang(lang).catch(() => useLang('de'));

export const locale = () => LANGS[lang].locale;
export const dir = () => LANGS[lang].dir || 'ltr';

// Sprache wechseln: merken und neu laden, damit wirklich alles in der neuen Sprache erscheint.
export function saveLang(code) {
  try { localStorage.setItem(KEY, code); } catch { /* privater Modus */ }
}

const fill = (s, params) => (params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m)) : s);

// t('Noch {n} Tage', { n: 3 })
export const t = (key, params) => fill(dict.ui?.[key] ?? key, params);
// tn(3, 'eine Sache', '{n} Sachen') – Einzahl und Mehrzahl
export const tn = (n, one, other, params) => t(n === 1 ? one : other, { n, ...params });

// Anzeigename eines Lebensmittels. Bekannte Produkte heißen in jeder Sprache passend, eigene Namen bleiben.
export function pname(item) {
  const own = lang !== 'de' && item?.pid && dict.products?.[item.pid];
  return own || item?.name || '';
}
export const productName = (id) => (lang !== 'de' && dict.products?.[id]) || PRODUCTS.find((p) => p.id === id)?.name || id;

// Rezepte stehen nach id in der Sprachdatei: { name, base, steps }
export const recipeText = (id) => (lang !== 'de' && dict.recipes?.[id]) || null;

// Zahlen, Geld und Datum im Format der Sprache.
export const num = (n, opts) => n.toLocaleString(locale(), opts);
export const euro = (n) => num(n, { style: 'currency', currency: 'EUR' });
export function dateLabel(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'numeric' });
}

// Für Tests: alle Sprachdateien laden.
export const _dict = () => dict;
