import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rescueTips, reminderPlan, reminderSchedule, remember, emptyMemo, dueSoon } from '../js/rescue.js';
import { ideasMessage, parseIdeas, pantryKey, rescueText, SYSTEM } from '../js/chef.js';
import { makeItem, addDays } from '../js/pantry.js';

const T = '2026-10-10';
const item = (name, days, extra = {}) => ({ ...makeItem({ name, bought: addDays(T, -2) }, T), expires: addDays(T, days), ...extra });

test('Retten-Tipps: passend zum Produkt, höchstens drei, kein Verschenken bei Fleisch', () => {
  const brot = rescueTips(item('Brot', 1), T);
  assert.ok(brot.length >= 2 && brot.length <= 3);
  assert.match(brot[0].text, /Arme Ritter/);
  assert.ok(brot.some((t) => /verschenken/i.test(t.text)));
  const hack = rescueTips(item('Hackfleisch', 0), T);
  assert.ok(hack.some((t) => /durchbraten|durchgaren/.test(t.text)));
  assert.ok(!hack.some((t) => /verschenken/i.test(t.text)));
  // Verbrauchsdatum überschritten: nur die Warnung.
  const alt = rescueTips(item('Hackfleisch', -1), T);
  assert.equal(alt.length, 1);
  assert.match(alt[0].text, /nicht mehr essen/);
  // Eingefrorenes bekommt keinen Einfrier-Tipp, Salat auch nicht.
  assert.ok(!rescueTips(item('Salat', 1), T).some((t) => t.icon === '❄️'));
  assert.ok(!rescueTips(item('Spinat', 1, { place: 'tk' }), T).some((t) => /Einfrieren –/.test(t.text)));
  // Unbekanntes Produkt: Tipps der Kategorie bzw. allgemeine.
  assert.ok(rescueTips(item('Irgendwas Seltenes', 1), T).length >= 1);
});

test('Erinnerung: gebündelt, nur fällige Sachen, Tiefkühler und Angebotenes nicht', () => {
  const items = [item('Milch', 1), item('Spinat', 0), item('Joghurt', 2), item('Eier', 9), item('Brot', 1, { offered: T }), item('Erbsen', 1, { place: 'tk' }), item('Quark', -2)];
  assert.deepEqual(dueSoon(items, T).map((i) => i.name), ['Spinat', 'Milch', 'Joghurt']);
  const plan = reminderPlan(items, emptyMemo(), T, () => 'Frittata mit Spinat');
  assert.equal(plan.title, '3 Sachen laufen bald ab');
  assert.match(plan.body, /Spinat \(heute\), Milch \(morgen\), Joghurt \(übermorgen\)/);
  assert.match(plan.body, /Idee: Frittata mit Spinat/);
  assert.equal(plan.url, './#/vorrat?retten=1');
  const one = reminderPlan([item('Milch', 1)], emptyMemo(), T);
  assert.equal(one.title, 'Bald weg: Milch');
  assert.match(one.body, /Ablauf morgen/);
  assert.equal(reminderPlan([item('Eier', 9)], emptyMemo(), T), null);
});

test('Erinnerung: höchstens einmal am Tag, jede Sache nur einmal, neues Datum zählt neu', () => {
  const milch = item('Milch', 2);
  const plan = reminderPlan([milch], emptyMemo(), T);
  const memo = remember(emptyMemo(), plan, T, [milch]);
  assert.equal(reminderPlan([milch, item('Spinat', 0)], memo, T), null, 'heute schon erinnert');
  assert.equal(reminderPlan([milch], memo, addDays(T, 1)), null, 'Milch schon gemeldet');
  const spinat = item('Spinat', 1);
  const next = reminderPlan([milch, spinat], memo, addDays(T, 1));
  assert.equal(next.title, '2 Sachen laufen bald ab', 'Neues kommt dazu, Bekanntes steht mit drin');
  // Angebrochen: früheres Datum → wieder neu.
  assert.ok(reminderPlan([{ ...milch, expires: addDays(T, 1) }], memo, addDays(T, 1)));
  // Aufgebrauchtes fliegt aus dem Gedächtnis.
  assert.deepEqual(Object.keys(remember(memo, next, addDays(T, 1), [spinat]).seen), [spinat.id]);
});

test('Fahrplan für den Hintergrund: eine Mitteilung je Tag mit Neuem, sonst nichts', () => {
  const items = [item('Milch', 3), item('Joghurt', 3), item('Brot', 5), item('Äpfel', 30)];
  const plan = reminderSchedule(items, emptyMemo(), T, undefined, 14);
  assert.deepEqual(plan.map((p) => p.day), [addDays(T, 1), addDays(T, 3)]);
  assert.equal(plan[0].title, '2 Sachen laufen bald ab');
  assert.match(plan[1].body, /Brot \(übermorgen\)/);
});

test('Ideen vom Koch: Anfrage mit Vorrat, Antwort wird zu antippbaren Karten', () => {
  assert.match(SYSTEM, /Ideen aus meinem Vorrat/);
  const msg = ideasMessage({ pantry: '- Spinat: muss heute weg', veg: true, avoid: ['Frittata'] }, T);
  assert.match(msg, /10\.10\.2026/);
  assert.match(msg, /Spinat/);
  assert.match(msg, /vegetarisch; bitte nicht noch einmal: Frittata/);
  const ideas = parseIdeas(`Hier sind Ideen:
- **Spinat-Rührei** | rettet: Spinat, Eier | 10 | Schnell und cremig
2. Tomatensuppe | rettet: Tomaten und Zwiebeln | 25 Min. | Wärmt
- Bananen-Pancakes | Bananen | ? | Süß
- Noch eine | x | 5 | zu viel`);
  assert.equal(ideas.length, 3);
  assert.deepEqual(ideas[0], { name: 'Spinat-Rührei', saves: ['Spinat', 'Eier'], minutes: 10, why: 'Schnell und cremig' });
  assert.deepEqual(ideas[1].saves, ['Tomaten', 'Zwiebeln']);
  assert.equal(ideas[1].minutes, 25);
  assert.equal(ideas[2].minutes, null);
  assert.deepEqual(parseIdeas('Leider nichts.'), []);
});

test('Ideen nur neu, wenn sich ändert, was bald weg muss', () => {
  const a = [item('Spinat', 1), item('Nudeln', 300)];
  const b = [...a, item('Reis', 200)];
  assert.equal(pantryKey(a, T), pantryKey(b, T), 'Lange Haltbares ändert nichts');
  assert.notEqual(pantryKey(a, T), pantryKey([...a, item('Milch', 2)], T));
  assert.notEqual(pantryKey(a, T), pantryKey(a, addDays(T, 1)), 'neuer Tag, neue Ideen');
});

test('Retten-Frage an den Koch', () => {
  assert.match(rescueText(item('Spinat', 0), T), /Spinat retten, es muss heute weg/);
  assert.match(rescueText(item('Milch', 3), T), /läuft in 3 Tagen ab/);
  assert.match(rescueText(item('Joghurt', -2), T), /seit 2 Tagen drüber/);
});

test('Nicht jeden Tag: Mitteilung nimmt Morgiges mit, am Tag danach nur Dringendes', () => {
  // Jeden Tag läuft etwas Neues ab – trotzdem kommt nicht täglich eine Mitteilung.
  const items = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => item(`Sache ${d}`, d));
  const days = reminderSchedule(items, emptyMemo(), T, undefined, 8).map((p) => p.day);
  assert.ok(days.length <= 5, `höchstens jeden zweiten Tag, war: ${days.join(', ')}`);
  for (let k = 1; k < days.length; k++) assert.ok(days[k] > addDays(days[k - 1], 1), 'nie zwei Tage hintereinander');
  // Neues, das morgen abläuft, darf trotzdem am Tag nach einer Mitteilung kommen.
  const memo = { day: addDays(T, -1), seen: {} };
  assert.equal(reminderPlan([item('Brot', 2)], memo, T), null);
  assert.ok(reminderPlan([item('Hackfleisch', 1)], memo, T));
  // Lange Liste wird gekürzt.
  const many = reminderPlan([0, 0, 1, 1, 2, 2].map((d, k) => item(`S${k}`, d)), emptyMemo(), T);
  assert.match(many.body, /und 2 mehr\. Tippe/);
});
