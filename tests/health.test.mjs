import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthTips } from '../js/health.js';

const T = '2026-10-11';

test('Gesund-Tipps: höchstens zwei, immer freundlich', () => {
  for (const list of [['Milch'], ['Nudeln', 'Toast', 'Chips', 'Cola'], ['Äpfel', 'Möhren']]) {
    const tips = healthTips(list, { today: T });
    assert.ok(tips.length >= 1 && tips.length <= 2);
    for (const x of tips) assert.doesNotMatch(x.text, /verboten|nicht kaufen|ungesund/i);
  }
});

test('Ohne Obst und Gemüse kommt ein Vorschlag zum Antippen – nichts, was schon da ist', () => {
  const [tip] = healthTips(['Nudeln', 'Milch'], { today: T, have: ['aepfel', 'moehren', 'bananen', 'paprika', 'brokkoli', 'gurke', 'tomaten'] });
  assert.equal(tip.add, 'Orangen');
  assert.ok(!healthTips(['Nudeln', 'Paprika'], { today: T }).some((x) => x.add));
});

test('Süßes wird gegönnt, bei Limo gibt es einen Durst-Tipp', () => {
  assert.match(healthTips(['Gummibärchen', 'Banane'], { today: T })[0].text, /gönn es dir/);
  assert.match(healthTips(['Chips', 'Cola', 'Gurke'], { today: T })[0].text, /Wasser/);
});

test('Tippfehler im Einkaufsfeld werden erkannt, richtige Wörter bleiben', async () => {
  const { correctProduct } = await import('../js/products.js');
  const fix = (w) => correctProduct(w)?.name ?? null;
  assert.equal(fix('Jogurt'), 'Joghurt');
  assert.equal(fix('Brokoli'), 'Brokkoli');
  assert.equal(fix('Zwibeln'), 'Zwiebeln');
  assert.equal(fix('Mozarella'), 'Mozzarella');
  for (const ok of ['Joghurt', 'Banane', 'Tomate', 'Apfel', 'Salami', 'Salz', 'Milch', 'Klopapier']) assert.equal(fix(ok), null, ok);
});
