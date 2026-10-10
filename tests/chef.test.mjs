import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pantryForChef, firstMessage, chefRequest, renderMarkdown, ideas, usedItems, askChef, MODEL } from '../js/chef.js';
import { makeItem, addDays } from '../js/pantry.js';
import { createStore } from '../js/store.js';

const T = '2026-10-10';
const item = (name, days, extra = {}) => ({ ...makeItem({ name, bought: addDays(T, -2) }, T), expires: addDays(T, days), ...extra });

const ANSWER = `## Spinat-Frittata mit Tomaten
_20 Min. · 2 Portionen · leicht_
Rettet Spinat und Tomaten, die heute weg müssen.
### Das brauchst du
- 4 Eier
- 1 Packung Spinat 🌱
- 2 Tomaten 🌱
- Salz, Pfeffer, Öl
### So geht's
1. Pfanne auf **mittlere Hitze** stellen.
2. Spinat zusammenfallen lassen.
### Profi-Tipp
Zum Schluss etwas Zitrone.
### Reste-Tipp
Hält kalt 2 Tage.
### Andere Ideen
- **Spinat-Pfannkuchen** – mit Käse gefüllt
- Tomatensuppe: in 25 Minuten
`;

test('Vorrat für den Koch: dringendes zuerst, Verbrauchsdatum deutlich, Angebotenes nicht', () => {
  const text = pantryForChef([
    item('Kartoffeln', 20),
    item('Hackfleisch', -1),
    item('Spinat', 0),
    item('Joghurt', 5, { offered: T }),
  ], T);
  const lines = text.split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^- Hackfleisch: seit gestern drüber, Verbrauchsdatum überschritten – nicht mehr verwenden/);
  assert.match(lines[1], /^- Spinat: muss heute weg/);
  assert.match(lines[2], /^- Kartoffeln/);
});

test('Erste Nachricht enthält Vorrat, Wunsch und Rahmen', () => {
  const msg = firstMessage({ text: 'Lust auf was Warmes', pantry: '- Spinat: muss heute weg', persons: 1, minutes: 15, veg: true }, T);
  assert.match(msg, /10\.10\.2026/);
  assert.match(msg, /Spinat: muss heute weg/);
  assert.match(msg, /Lust auf was Warmes/);
  assert.match(msg, /1 Person, höchstens 15 Minuten, vegetarisch/);
  assert.match(firstMessage({ text: 'Reis', minutes: 0 }, T), /Das habe ich.*Reis[\s\S]*Zeit spielt keine Rolle/);
});

test('Anfrage: aktuelles Modell, Streaming-tauglich, Fallback eingeschaltet', () => {
  const r = chefRequest([{ role: 'user', content: 'Hallo' }]);
  assert.equal(r.model, 'claude-opus-5-5');
  assert.equal(r.output_config.effort, 'medium');
  assert.equal(r.fallbacks, 'default');
  assert.deepEqual(r.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(r.thinking, undefined); // Opus 5.5 denkt immer adaptiv – ein „disabled“ wäre ein Fehler
});

test('Markdown wird sicher dargestellt', () => {
  const html = renderMarkdown(ANSWER);
  assert.match(html, /<h2>Spinat-Frittata mit Tomaten<\/h2>/);
  assert.match(html, /<i>20 Min\. · 2 Portionen · leicht<\/i>/);
  assert.match(html, /<ol><li>Pfanne auf <b>mittlere Hitze<\/b> stellen\.<\/li>/);
  assert.match(html, /<ul><li>4 Eier<\/li>/);
  const evil = renderMarkdown('## <img src=x onerror=alert(1)>\n- <script>x</script>');
  assert.doesNotMatch(evil, /<img|<script/);
  assert.match(evil, /&lt;img/);
});

test('Andere Ideen werden zu Vorschlägen, verwendete Vorratssachen werden erkannt', () => {
  assert.deepEqual(ideas(ANSWER), ['Spinat-Pfannkuchen', 'Tomatensuppe']);
  const items = [item('Spinat', 0), item('Tomaten', 1), item('Eier', 10), item('Bananen', 2)];
  assert.deepEqual(usedItems(ANSWER, items).map((i) => i.name), ['Spinat', 'Tomaten', 'Eier']);
});

test('API-Schlüssel landet nicht in der Sicherung und überlebt das Laden einer Sicherung', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const store = createStore(storage);
  store.setting('aiKey', 'sk-ant-geheim');
  const backup = store.exportJson();
  assert.doesNotMatch(backup, /sk-ant/);
  store.importJson(backup);
  assert.equal(store.state.settings.aiKey, 'sk-ant-geheim');
});

// Spielt die echte Claude-Bibliothek gegen eine simulierte Streaming-Antwort durch.
const sse = (events) => events.map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`).join('');
function fakeFetch(body, status = 200, seen = {}) {
  return async (url, init) => {
    seen.url = String(url);
    seen.headers = Object.fromEntries(new Headers(init.headers).entries());
    seen.body = JSON.parse(init.body);
    const headers = { 'content-type': status === 200 ? 'text/event-stream' : 'application/json', 'request-id': 'req_test' };
    return new Response(body, { status, headers });
  };
}

test('Koch streamt die Antwort Stück für Stück', async () => {
  const seen = {};
  const stream = sse([
    ['message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: MODEL, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
    ['content_block_start', { index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: '## Frittata' } }],
    ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: '\n- 4 Eier' } }],
    ['content_block_stop', { index: 0 }],
    ['message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 8 } }],
    ['message_stop', {}],
  ]);
  const parts = [];
  const res = await askChef({ apiKey: 'sk-ant-test', messages: [{ role: 'user', content: 'Eier' }], onText: (t) => parts.push(t), fetch: fakeFetch(stream, 200, seen) });
  assert.equal(res.text, '## Frittata\n- 4 Eier');
  assert.equal(res.stop, 'end_turn');
  assert.deepEqual(parts, ['## Frittata', '## Frittata\n- 4 Eier']);
  assert.match(seen.url, /\/v1\/messages\?beta=true$/);
  assert.equal(seen.headers['x-api-key'], 'sk-ant-test');
  assert.equal(seen.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.match(seen.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(seen.body.stream, true);
  assert.equal(seen.body.model, 'claude-opus-5-5');
  assert.equal(seen.body.betas, undefined); // betas wandern in den Header
});

test('Falscher Schlüssel ergibt eine verständliche Meldung', async () => {
  const body = JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
  await assert.rejects(
    askChef({ apiKey: 'falsch', messages: [{ role: 'user', content: 'Eier' }], fetch: fakeFetch(body, 401) }),
    /API-Schlüssel stimmt nicht/,
  );
});
