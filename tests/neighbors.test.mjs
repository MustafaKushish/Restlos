import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkText, normCity, normStreet, cleanNickname, visible, byStreet, ago, parseVerdict, askModerator, moderationMessages, moderationRequest, expiresFor } from '../js/neighbors.js';
import { supabaseBackend, localBackend, apiError } from '../js/neighborapi.js';
import worker from '../worker/koch.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('Datenschutz: keine Telefonnummern, E-Mails, Links, Kontodaten, Messenger, Preise', () => {
  assert.deepEqual(checkText('Hab 2 Brote übrig, wer mag?'), []);
  assert.deepEqual(checkText('Gut bis 12.10.2026, abholen ab 18:30'), []); // Datum und Uhrzeit sind keine Telefonnummer
  assert.deepEqual(checkText('6 Eier, 3 Joghurt, 1 Liter Milch'), []);
  assert.deepEqual(checkText('Ruf an: 0171 2345678'), ['phone']);
  assert.deepEqual(checkText('+49 (30) 123-45-67'), ['phone']);
  assert.deepEqual(checkText('0 1 7 1 2 3 4 5 6'), ['phone']);
  assert.deepEqual(checkText('mail an mia@web.de'), ['email']);
  assert.deepEqual(checkText('siehe www.beispiel.com'), ['link']);
  assert.deepEqual(checkText('schau auf essen.de'), ['link']);
  assert.deepEqual(checkText('DE89 3704 0044 0532 0130 00'), ['iban']);
  assert.deepEqual(checkText('schreib mir bei WhatsApp'), ['messenger']);
  assert.deepEqual(checkText('Für 5 € abzugeben'), ['money']);
  assert.deepEqual(checkText('   '), ['empty']);
  assert.deepEqual(checkText('x'.repeat(501)), ['long']);
});

test('Stadt und Straße: ordentlich geschrieben, ohne Hausnummer', () => {
  assert.equal(normCity('  berlin '), 'Berlin');
  assert.equal(normCity('frankfurt am main'), 'Frankfurt am Main');
  assert.equal(normCity('halle (saale)'), 'Halle (saale)');
  assert.equal(normStreet('hauptstr. 12'), 'Hauptstraße');
  assert.equal(normStreet('Karl-marx-allee 3a'), 'Karl-Marx-Allee');
  assert.equal(normStreet('am  markt 4/2'), 'Am Markt');
  assert.equal(normStreet('straße des 17. juni'), 'Straße des 17. Juni');
  assert.equal(normStreet('Am Hang 5-7'), 'Am Hang');
  assert.equal(normStreet(''), '');
});

test('Spitzname: ohne Ziffernfolgen und Zeichen für Kontakte', () => {
  assert.equal(cleanNickname(''), 'Nachbar:in');
  assert.equal(cleanNickname('Mia 01712345'), 'Mia');
  assert.equal(cleanNickname('<b>Tom@</b>'), 'bTom/b');
  assert.equal(cleanNickname('x'.repeat(50)).length, 30);
});

test('Sichtbar: nichts Abgelaufenes, Ausgeblendetes oder von Blockierten', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  const p = (id, extra) => ({ id, user_id: 'a', hidden: false, expires_at: '2026-10-12T00:00:00Z', ...extra });
  const out = visible([p(1), p(2, { hidden: true }), p(3, { expires_at: '2026-10-11T11:00:00Z' }), p(4, { user_id: 'boese' })], { blocked: ['boese'], now });
  assert.deepEqual(out.map((x) => x.id), [1]);
  assert.equal(expiresFor('angebot', now), '2026-10-14T12:00:00.000Z');
  assert.equal(expiresFor('nachricht', now), '2026-10-18T12:00:00.000Z');
});

test('Nach Straße geordnet, darin Offenes und Neues zuerst', () => {
  const o = (street, created_at, status = 'offen') => ({ street, created_at, status, title: `${street}-${created_at}` });
  const groups = byStreet([o('Zollstraße', '1'), o('Ahornweg', '1'), o('Ahornweg', '3', 'vergeben'), o('Ahornweg', '2'), o('', '1')]);
  assert.deepEqual(groups.map((g) => g.street), ['Ahornweg', 'Ohne Straße', 'Zollstraße']);
  assert.deepEqual(groups[0].offers.map((x) => x.created_at), ['2', '1', '3']);
});

test('Zeitangaben', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  assert.equal(ago('2026-10-11T11:59:50Z', now), 'gerade eben');
  assert.equal(ago('2026-10-11T11:45:00Z', now), 'vor 15 Min.');
  assert.equal(ago('2026-10-11T09:00:00Z', now), 'vor 3 Std.');
  assert.equal(ago('2026-10-10T10:00:00Z', now), 'gestern');
});

test('KI-Koch als Aufpasser: Anfrage und Antwort', () => {
  const msgs = moderationMessages('Du Idiot', [{ nickname: 'Mia', body: 'Brot ist weg, sorry' }]);
  assert.match(msgs[0].content, /Mia: Brot ist weg[\s\S]*NEUE Nachricht:\nDu Idiot/);
  const r = moderationRequest(msgs);
  assert.match(r.systemInstruction.parts[0].text, /Nachbarschafts-Chat/);
  assert.equal(r.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(parseVerdict('{"verdict":"stopp","grund":"Bitte freundlich","vorschlag":"Schade!"}'), { verdict: 'stopp', grund: 'Bitte freundlich', vorschlag: 'Schade!' });
  assert.equal(parseVerdict('```json\n{"verdict":"hinweis"}\n```').verdict, 'hinweis');
  assert.equal(parseVerdict('kaputt').verdict, 'ok'); // unklar → nicht blockieren
  assert.equal(parseVerdict('{"verdict":"löschen"}').verdict, 'ok');
});

const gemini = (obj) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

test('Aufpasser direkt bei Gemini: weicht bei Limit aufs nächste Modell aus', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, key: init.headers['x-goog-api-key'] });
    return calls.length === 1 ? new Response('{}', { status: 429 }) : Response.json(gemini({ verdict: 'hinweis', grund: 'Ruhig bleiben', vorschlag: 'Schade, beim nächsten Mal!' }));
  };
  const v = await askModerator({ apiKey: 'AIzaTest', text: 'Immer bist du zu spät!!', fetch });
  assert.equal(v.verdict, 'hinweis');
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(calls[1].key, 'AIzaTest');
});

test('Aufpasser: Googles eigene Sperre zählt als „stopp“, Ausfall blockiert nicht', async () => {
  const blocked = await askModerator({ apiKey: 'AIza', text: 'x', fetch: async () => Response.json({ promptFeedback: { blockReason: 'SAFETY' } }) });
  assert.equal(blocked.verdict, 'stopp');
  assert.equal(await askModerator({ apiKey: 'AIza', text: 'x', fetch: async () => { throw new Error('offline'); } }), null);
  assert.equal(await askModerator({ apiKey: 'sk-ant-x', text: 'x', fetch: async () => assert.fail('kein Aufruf') }), null);
});

test('Aufpasser über den Koch-Server', async () => {
  let sent;
  const fetch = async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return Response.json(gemini({ verdict: 'ok' })); };
  const v = await askModerator({ server: 'https://koch.example/', text: 'Ist das Brot noch da?', fetch });
  assert.equal(v.verdict, 'ok');
  assert.equal(sent.url, 'https://koch.example/');
  assert.equal(sent.body.moderate.length, 1);
  assert.match(sent.body.moderate[0].content, /Ist das Brot noch da\?/);
});

test('Koch-Server nimmt Prüfungen an und baut die Anfrage selbst', async () => {
  const env = { GEMINI_API_KEY: 'AIzaGeheim', ALLOWED_ORIGIN: 'https://mustafakushish.github.io' };
  const req = (body) => new Request('https://koch.example/', { method: 'POST', headers: { origin: 'https://mustafakushish.github.io', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const orig = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return Response.json(gemini({ verdict: 'ok' })); };
  try {
    const res = await worker.fetch(req({ moderate: [{ role: 'user', content: 'NEUE Nachricht:\nHallo' }] }), env);
    assert.equal(res.status, 200);
    assert.match(sent.url, /:generateContent$/);
    assert.match(sent.body.systemInstruction.parts[0].text, /Nachbarschafts-Chat/);
    assert.equal(res.headers.get('content-type'), 'application/json');
    assert.equal((await worker.fetch(req({ moderate: [{ role: 'user', content: 'x' }, { role: 'user', content: 'y' }] }), env)).status, 400);
    assert.equal((await worker.fetch(req({ moderate: [{ role: 'model', content: 'x' }] }), env)).status, 400);
  } finally {
    globalThis.fetch = orig;
  }
});

test('Datenbank: meldet sich anonym an und liest nur die eigene Stadt', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/signup')) return Response.json({ access_token: 'tok1', refresh_token: 'r1', expires_in: 3600, user: { id: 'u1' } });
    if (url.includes('/rest/v1/posts?select')) return Response.json([{ id: 'p1' }]);
    if (url.endsWith('/rest/v1/posts')) return Response.json([{ id: 'p2', ...JSON.parse(init.body) }], { status: 201 });
    return new Response('', { status: 204 });
  };
  const storage = memory();
  const api = supabaseBackend({ url: 'https://abc.supabase.co/', key: 'sb_publishable_x', fetch, storage });
  assert.deepEqual(await api.list('Frankfurt am Main'), [{ id: 'p1' }]);
  assert.equal(calls[0].init.headers.apikey, 'sb_publishable_x');
  assert.deepEqual(JSON.parse(calls[0].init.body), {}); // keine E-Mail, keine Telefonnummer
  assert.match(calls[1].url, /city=eq\.Frankfurt%20am%20Main/);
  assert.equal(calls[1].init.headers.authorization, 'Bearer tok1');
  assert.equal(api.me(), 'u1');
  const row = await api.post({ kind: 'nachricht', city: 'Berlin', body: 'Hallo' });
  assert.equal(row.id, 'p2');
  assert.equal(calls.filter((c) => c.url.endsWith('/signup')).length, 1); // Anmeldung wird weiterverwendet
  // Neues Laden der App: Sitzung kommt aus dem Speicher
  const again = supabaseBackend({ url: 'https://abc.supabase.co', key: 'k', fetch, storage });
  assert.equal(again.me(), 'u1');
});

test('Datenbank: abgelaufene Anmeldung wird verlängert, Melden doppelt ist kein Fehler', async () => {
  const storage = memory();
  storage.setItem('restlos:nachbarn-sitzung', JSON.stringify({ access_token: 'alt', refresh_token: 'r1', expires_at: Date.now() - 1, user: 'u1' }));
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    if (url.includes('grant_type=refresh_token')) return Response.json({ access_token: 'neu', refresh_token: 'r2', expires_in: 3600, user: { id: 'u1' } });
    if (url.endsWith('/rest/v1/reports')) return Response.json({ code: '23505' }, { status: 409 });
    return Response.json([]);
  };
  const api = supabaseBackend({ url: 'https://abc.supabase.co', key: 'k', fetch, storage });
  await api.report('p1', 'Werbung');
  assert.match(urls[0], /grant_type=refresh_token/);
  assert.equal(JSON.parse(storage.getItem('restlos:nachbarn-sitzung')).access_token, 'neu');
});

test('Fehler der Datenbank verständlich', () => {
  assert.equal(apiError(400, { message: 'restlos:telefon' }), 'Bitte keine Telefonnummern.');
  assert.equal(apiError(400, { message: 'restlos:hausnummer' }), 'Bitte nur die Straße, ohne Hausnummer.');
  assert.equal(apiError(400, { message: 'restlos:zu-viel' }), 'Du hast gerade viel geschrieben. Bitte etwas später wieder.');
  assert.equal(apiError(422, { msg: 'Anonymous sign-ins are disabled' }), 'Die Nachbarschafts-Börse ist noch nicht freigeschaltet.');
  assert.match(apiError(500, ''), /Fehler 500/);
});

test('Vorschau ohne Datenbank: speichert nur auf dem Gerät', async () => {
  let now = new Date('2026-10-11T12:00:00Z');
  const api = localBackend({ storage: memory(), now: () => now });
  assert.equal(api.live, false);
  const offer = await api.post({ kind: 'angebot', city: 'Berlin', street: 'Hauptstraße', title: 'Brot', body: 'Gut bis morgen' });
  await api.post({ kind: 'nachricht', city: 'Berlin', body: 'Hätte ich gern', reply_to: offer.id });
  await api.post({ kind: 'nachricht', city: 'Hamburg', body: 'Moin' });
  assert.equal((await api.list('Berlin')).length, 2);
  assert.deepEqual(await api.cities(), [{ stadt: 'Berlin', angebote: 1 }]);
  await api.setStatus(offer.id, 'reserviert');
  assert.equal((await api.list('Berlin')).find((p) => p.id === offer.id).status, 'reserviert');
  await api.remove(offer.id); // Antworten gehen mit
  assert.equal((await api.list('Berlin')).length, 0);
  now = new Date('2026-10-30T12:00:00Z');
  assert.equal((await api.list('Hamburg')).length, 0); // nach 7 Tagen weg
});
