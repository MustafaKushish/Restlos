// Sammelt alle deutschen Texte, die übersetzt werden müssen: t('…') und tn(n, '…', '…') im Code,
// Retten-Tipps, Kategorien, Lagerorte und die festen Texte in index.html.
// `node tests/i18n-keys.mjs` gibt die Liste aus – praktisch, um eine neue Sprache anzulegen.
import { readFileSync, readdirSync } from 'node:fs';
import { CATS, PLACES, PRODUCTS } from '../js/products.js';
import { RECIPES } from '../js/recipes.js';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');

// Liest ab `start` bis zur passenden schließenden Klammer – Strings und Template-Strings werden übersprungen.
function args(src, start) {
  let depth = 1;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
    } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return src.slice(start, i);
  }
  return '';
}

// Nur die Strings vor dem Parameter-Objekt ({ n: … }) sind Texte.
function stringsIn(a) {
  const out = [];
  let depth = 0;
  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === "'" || c === '"') {
      const start = i;
      let s = '';
      for (i++; i < a.length && a[i] !== c; i++) { if (a[i] === '\\') i++; s += a[i]; }
      // Vergleiche wie notif === 'denied' sind keine Texte.
      if (depth === 0 && !/[=!]==\s*$/.test(a.slice(0, start))) out.push(s);
    } else if (c === '`') {
      for (i++; i < a.length && a[i] !== '`'; i++) if (a[i] === '\\') i++;
    }
  }
  return out;
}

export function uiKeys() {
  const keys = new Set();
  const files = readdirSync(new URL('js/', root)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`);
  for (const f of files) {
    const src = read(f).replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/(?<![\w.$])(tn?)\(/g)) {
      const a = args(src, m.index + m[0].length);
      for (const s of stringsIn(a)) if (/\p{L}/u.test(s)) keys.add(s);
    }
  }
  // Retten-Tipps: T('🥞', 'Text')
  for (const m of read('js/rescue.js').matchAll(/\bT\('[^']*', '((?:[^'\\]|\\.)*)'\)/g)) keys.add(m[1]);
  // Überschriften der Koch-Antwort (chef.js, HEADINGS)
  const head = read('js/chef.js').match(/const HEADINGS = \[([^\]]*)\]/)?.[1] || '';
  for (const m of head.matchAll(/'((?:[^'\\]|\\.)*)'|"([^"]*)"/g)) keys.add(m[1] ?? m[2]);
  for (const c of Object.values(CATS)) keys.add(c.name);
  for (const p of Object.values(PLACES)) keys.add(p);
  const html = read('index.html');
  for (const m of html.matchAll(/data-i18n>([^<]+)</g)) keys.add(m[1].trim());
  for (const m of html.matchAll(/data-i18n-label="([^"]+)"/g)) keys.add(m[1]);
  return [...keys].sort((a, b) => a.localeCompare(b, 'de'));
}

export const productIds = () => PRODUCTS.map((p) => p.id);
export const recipeIds = () => RECIPES.map((r) => r.id);

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const out = {
    ui: Object.fromEntries(uiKeys().map((k) => [k, k])),
    products: Object.fromEntries(PRODUCTS.map((p) => [p.id, p.name])),
    recipes: Object.fromEntries(RECIPES.map((r) => [r.id, { name: r.name, ...(r.name.includes('{}') ? { base: r.name.replace(/ (mit|aus) \{\}/, '') } : {}), steps: r.steps }])),
  };
  console.log(JSON.stringify(out, null, 2));
}
