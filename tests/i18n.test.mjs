import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, pickLang, useLang, t, tn, pname, productName } from '../js/i18n.js';
import { uiKeys, productIds, recipeIds } from './i18n-keys.mjs';
import { RECIPES, suggest } from '../js/recipes.js';
import { makeItem, addDays, status, parseFreeText } from '../js/pantry.js';
import { matchProduct } from '../js/products.js';
import { ideas, usedItems, langNote, firstMessage } from '../js/chef.js';

const others = Object.keys(LANGS).filter((l) => l !== 'de');
const load = async (code) => (await import(`../js/lang/${code}.js`)).default;
const holes = (s) => [...String(s).matchAll(/\{(\w*)\}/g)].map((m) => m[1]).sort().join(',');
const tags = (s) => [...String(s).matchAll(/<\/?(\w+)/g)].map((m) => m[1]).sort().join(',');

test('mindestens 6 Sprachen, Arabisch von rechts nach links', () => {
  assert.ok(Object.keys(LANGS).length >= 6);
  assert.equal(LANGS.ar.dir, 'rtl');
});

test('Sprache: gespeicherte Wahl, sonst Gerätesprache, sonst Englisch', () => {
  assert.equal(pickLang('tr', ['de-DE']), 'tr');
  assert.equal(pickLang(null, ['ar-EG', 'en']), 'ar');
  assert.equal(pickLang(null, ['pl-PL', 'fr-CA']), 'fr');
  assert.equal(pickLang('xx', ['pl-PL']), 'en');
});

for (const code of others) {
  test(`${LANGS[code].name}: alle Texte übersetzt, Platzhalter und HTML stimmen`, async () => {
    const d = await load(code);
    const missing = uiKeys().filter((k) => typeof d.ui?.[k] !== 'string' || !d.ui[k].trim());
    assert.deepEqual(missing, [], `Es fehlen ${missing.length} Übersetzungen`);
    for (const k of uiKeys()) {
      assert.equal(holes(d.ui[k]), holes(k), `Platzhalter in „${k}“`);
      assert.equal(tags(d.ui[k]), tags(k), `HTML in „${k}“`);
    }
  });

  test(`${LANGS[code].name}: alle Lebensmittel und Rezepte`, async () => {
    const d = await load(code);
    assert.deepEqual(productIds().filter((id) => !d.products?.[id]), []);
    for (const r of RECIPES) {
      const x = d.recipes?.[r.id];
      assert.ok(x, `Rezept ${r.id}`);
      assert.equal(x.steps?.length, r.steps.length, `Schritte ${r.id}`);
      assert.equal(x.name.includes('{}'), r.name.includes('{}'), `{} im Namen ${r.id}`);
      if (r.name.includes('{}')) assert.ok(x.base && !x.base.includes('{}'), `base für ${r.id}`);
    }
    assert.deepEqual(recipeIds().filter((id) => !d.recipes[id]), []);
  });
}

test('Ohne Übersetzung bleibt der deutsche Text, Platzhalter werden gefüllt', async () => {
  await useLang('en', { ui: { 'noch {n} Tage': '{n} days left' }, products: { milch: 'Milk' } });
  try {
    assert.equal(t('noch {n} Tage', { n: 3 }), '3 days left');
    assert.equal(t('Gibt es nicht {x}', { x: 1 }), 'Gibt es nicht 1');
    assert.equal(tn(1, 'eine Sache', '{n} Sachen'), 'eine Sache');
    assert.equal(tn(4, 'eine Sache', '{n} Sachen'), '4 Sachen');
    assert.equal(pname({ name: 'Milch', pid: 'milch' }), 'Milk');
    assert.equal(pname({ name: 'Mein Kuchen', pid: null }), 'Mein Kuchen');
    assert.equal(productName('milch'), 'Milk');
  } finally {
    await useLang('de');
  }
});

test('Englisch: Status, Rezepte, Eingabe und Koch in der Sprache', async () => {
  await useLang('en');
  try {
    const T = '2026-10-10';
    const it = (name, days) => ({ ...makeItem({ name, bought: addDays(T, -2) }, T), expires: addDays(T, days) });
    assert.equal(status(it('Milch', 3), T).label, '3 days left');
    // Englische Namen finden die Produkte
    assert.equal(matchProduct('milk')?.id, 'milch');
    assert.equal(matchProduct('Bananas')?.id, 'bananen');
    assert.deepEqual(parseFreeText('2 milk and 6 eggs').map((x) => x.qty), [2, 6]);
    const [r] = suggest([it('Eier', 5), it('Zucchini', 1), it('Paprika', 2)], { today: T, limit: 1 });
    assert.match(r.title, /Courgette|Zucchini|pepper/i);
    assert.ok(r.steps.every((s) => !/[äöüß]/.test(s)), 'Schritte auf Englisch');
    // Der Koch antwortet auf Englisch – auch über den Koch-Server, darum steht es in der Nachricht.
    assert.match(langNote(), /Englisch/);
    assert.match(firstMessage({ text: 'Reis' }, T), /Antworte immer auf Englisch/);
    const md = `## Frittata\n### ${t('Das brauchst du')}\n- 1 zucchini 🌱\n### ${t('Andere Ideen')}\n- Pancakes – sweet\n`;
    assert.deepEqual(ideas(md), ['Pancakes']);
    assert.deepEqual(usedItems(md, [it('Zucchini', 1)]).length, 1);
  } finally {
    await useLang('de');
  }
});

test('Arabisch: Namen in arabischer Schrift werden gefunden', async () => {
  const d = await load('ar');
  await useLang('ar', d);
  try {
    assert.equal(matchProduct(d.products.milch)?.id, 'milch');
  } finally {
    await useLang('de');
  }
});
