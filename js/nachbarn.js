// Oberfläche der Nachbarschafts-Börse (#/nachbarn): Essen verschenken und offen darüber schreiben.
// Freiwillig, öffentlich für die eigene Stadt, nach Straße geordnet, ohne Telefonnummern.
// Ist keine Datenbank eingerichtet (config.js), läuft eine Vorschau, die nur auf diesem Gerät speichert.
import { checkText, problemText, cleanNickname, normCity, normStreet, visible, byStreet, ago, askModerator, STATUS, LIMITS, OFFER_DAYS, MESSAGE_DAYS } from './neighbors.js';
import { supabaseBackend, localBackend } from './neighborapi.js';

const PREFS = 'restlos:nachbarn';
const REFRESH_MS = 20_000;

let ctx; // { view, esc, toast, openSheet, closeSheet, aiConn, offerable, active }
let api;
const st = { posts: [], cities: [], loading: false, error: '', street: '', city: '', timer: null, busy: false, loadedFor: '' };

const readPrefs = () => { try { return { blocked: [], ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { return { blocked: [] }; } };
let prefs = readPrefs();
const savePrefs = (p) => { prefs = { ...prefs, ...p }; try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* privat */ } };

export const neighborsLive = (config) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.neighborUrl || '') && !!config.neighborKey;

export function initNachbarn(c) {
  ctx = c;
  api = neighborsLive(c.config) ? supabaseBackend({ url: c.config.neighborUrl, key: c.config.neighborKey }) : localBackend();
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ctx.active()) load(); });
}

// ---------- Laden ----------
async function load(quiet = true) {
  if (!prefs.city) return;
  if (!quiet) { st.loading = true; draw(); }
  try {
    const [posts, cities] = await Promise.all([api.list(prefs.city), st.cities.length ? st.cities : api.cities().catch(() => [])]);
    Object.assign(st, { posts, cities, error: '', loadedFor: prefs.city });
  } catch (e) {
    st.error = e.message;
  } finally {
    st.loading = false;
    if (ctx.active()) draw();
  }
  clearTimeout(st.timer);
  if (ctx.active()) st.timer = setTimeout(() => document.visibilityState === 'visible' && ctx.active() && load(), REFRESH_MS);
}

const shown = () => visible(st.posts, { blocked: prefs.blocked });
const mine = (p) => p.user_id === api.me();

// ---------- Anzeige ----------
export function renderNachbarn() {
  if (!prefs.joined || !prefs.city) { ctx.view.innerHTML = joinHtml(); return; }
  if (st.loadedFor !== prefs.city && !st.loading) { st.posts = []; load(false); }
  draw();
}

function draw() {
  if (!ctx.active() || !prefs.joined) return;
  const { esc } = ctx;
  // Beim Neuzeichnen nicht den angefangenen Text verlieren.
  const draft = document.getElementById('nb-chat')?.value ?? '';
  const focused = document.activeElement?.id === 'nb-chat';
  const posts = shown();
  const offers = posts.filter((p) => p.kind === 'angebot');
  const streets = byStreet(offers);
  const filtered = st.street ? streets.filter((g) => g.street === st.street) : streets;
  const chat = posts.filter((p) => p.kind === 'nachricht' && !p.reply_to).slice(-60);
  const replies = (id) => posts.filter((p) => p.reply_to === id).length;
  ctx.view.innerHTML = `
    <section class="hero"><h1>🏘️ Nachbarn</h1><p>Essen verschenken in <b>${esc(prefs.city)}</b> · <button class="link" data-nb="city">Stadt ändern</button></p></section>
    ${api.live ? '' : '<p class="hint">Vorschau: Hier ist noch niemand sonst. Was du schreibst, bleibt nur auf diesem Gerät.</p>'}
    <button class="btn primary block" data-nb="new-offer">🎁 Etwas verschenken</button>
    ${streets.length > 1 ? `<div class="chips nb-streets" role="group" aria-label="Straße">
      <button class="chip ${st.street ? '' : 'on'}" data-nb="street" data-street="" aria-pressed="${!st.street}">Alle Straßen</button>
      ${streets.map((g) => `<button class="chip ${st.street === g.street ? 'on' : ''}" data-nb="street" data-street="${esc(g.street)}" aria-pressed="${st.street === g.street}">${esc(g.street)} <small>${g.offers.length}</small></button>`).join('')}
    </div>` : ''}
    ${st.error ? `<p class="hint danger">${esc(st.error)} <button class="link" data-nb="reload">Nochmal</button></p>` : ''}
    ${st.loading && !posts.length ? '<p class="muted center">Lädt…</p>' : ''}
    ${filtered.length ? filtered.map((g) => `
      <h3 class="group">📍 ${esc(g.street)}</h3>
      <ul class="list">${g.offers.map((o) => `<li class="item nb-offer ${o.status}">
        <button class="item-main" data-nb="offer" data-id="${esc(o.id)}">
          <span class="emoji">🎁</span>
          <span class="item-text"><b>${esc(o.title)}</b>
            <small class="sub">${esc(o.nickname)} · ${ago(o.created_at)}${replies(o.id) ? ` · 💬 ${replies(o.id)}` : ''}</small></span>
          ${o.status !== 'offen' ? `<span class="badge ${o.status === 'vergeben' ? 'week' : 'soon'}">${STATUS[o.status]}</span>` : ''}
        </button></li>`).join('')}</ul>`).join('')
    : st.loading ? '' : `<div class="card empty"><div class="big">🧺</div><p>In ${esc(prefs.city)} wird gerade nichts verschenkt.<br>Mach den Anfang!</p></div>`}

    <h3 class="group">💬 Chat in ${esc(prefs.city)}</h3>
    <section class="card nb-chat" aria-live="polite">
      ${chat.length ? chat.map((m) => msgHtml(m)).join('') : '<p class="muted small center">Noch keine Nachrichten. Sag Hallo oder frag, wer etwas braucht.</p>'}
      <form class="input-row" data-nb-form="chat">
        <input id="nb-chat" type="text" autocomplete="off" enterkeyhint="send" maxlength="${LIMITS.body}" placeholder="Schreib an alle in ${esc(prefs.city)}…" aria-label="Nachricht an alle" value="${esc(draft)}">
        <button class="icon-btn" aria-label="Senden" ${st.busy ? 'disabled' : ''}>➤</button>
      </form>
    </section>
    <p class="muted small center">Alles hier sehen alle in ${esc(prefs.city)}. Angebote verschwinden nach ${OFFER_DAYS} Tagen, Nachrichten nach ${MESSAGE_DAYS}.
      <br><button class="link" data-nb="rules">Regeln & Datenschutz</button> · <button class="link" data-nb="profile">Mein Name</button> · <button class="link" data-nb="wipe">Alles von mir löschen</button></p>
  `;
  if (focused) { const el = document.getElementById('nb-chat'); el?.focus(); el?.setSelectionRange(draft.length, draft.length); }
}

function msgHtml(m) {
  const { esc } = ctx;
  return `<div class="nb-msg ${mine(m) ? 'me' : ''}">
    <div class="nb-meta"><b>${esc(m.nickname)}</b>${m.street ? ` · ${esc(m.street)}` : ''} · ${ago(m.created_at)}
      <button class="nb-more" data-nb="msg" data-id="${esc(m.id)}" aria-label="${mine(m) ? 'Löschen' : 'Melden oder blockieren'}">⋯</button></div>
    <p>${esc(m.body)}</p></div>`;
}

const RULES = `
  <ul class="nb-rules">
    <li>🙋 <b>Freiwillig.</b> Kein Konto, keine E-Mail. Dein Gerät bekommt nur eine zufällige Kennung.</li>
    <li>👀 <b>Offen.</b> Alles hier sehen alle in deiner Stadt. Private Nachrichten gibt es nicht – das schützt vor Belästigung.</li>
    <li>📍 <b>Nur Stadt und Straße.</b> Keine Hausnummer. Zur Übergabe trefft ihr euch an einem Ort, den ihr hier ausmacht (z. B. vor dem Bäcker).</li>
    <li>📵 <b>Keine Telefonnummern</b>, E-Mails, Links oder Kontodaten. Die App lässt sie gar nicht durch.</li>
    <li>👨‍🍳 <b>Der KI-Koch liest mit</b>, bevor etwas rausgeht, und bremst freundlich, wenn der Ton kippt.</li>
    <li>🚩 <b>Melden & Blockieren</b> bei jeder Nachricht. Nach 3 Meldungen ist ein Beitrag sofort weg.</li>
    <li>🧹 <b>Alles verschwindet von selbst:</b> Angebote nach ${OFFER_DAYS} Tagen, Nachrichten nach ${MESSAGE_DAYS}. Eigenes kannst du jederzeit löschen.</li>
    <li>🥩 Kein rohes Fleisch, Fisch oder Geflügel nach Verbrauchsdatum, nichts Selbstgekochtes von gestern ohne Kühlung, kein Alkohol.</li>
  </ul>`;

function joinHtml() {
  const { esc } = ctx;
  const cities = st.cities.slice(0, 8);
  return `
    <section class="hero"><h1>🏘️ Nachbarn</h1><p>Essen, das du nicht mehr schaffst, an Leute in deiner Straße verschenken – und offen darüber schreiben.</p></section>
    ${api.live ? '' : '<p class="hint">Vorschau: Noch nicht öffentlich. Was du hier schreibst, bleibt nur auf diesem Gerät.</p>'}
    <section class="card">${RULES}</section>
    <form class="card" data-nb-form="join">
      <label class="field">Stadt <input id="nb-city" type="text" required autocomplete="address-level2" maxlength="${LIMITS.city}" value="${esc(prefs.city || '')}" placeholder="z. B. Berlin" list="nb-cities"></label>
      ${cities.length ? `<datalist id="nb-cities">${cities.map((c) => `<option value="${esc(c.stadt)}">`).join('')}</datalist>` : ''}
      <label class="field">Deine Straße <small class="muted">(ohne Hausnummer, freiwillig)</small> <input id="nb-street" type="text" maxlength="${LIMITS.street}" value="${esc(prefs.street || '')}" placeholder="z. B. Hauptstraße"></label>
      <label class="field">Name im Chat <small class="muted">(freiwillig, gern ein Spitzname)</small> <input id="nb-nick" type="text" maxlength="${LIMITS.nickname}" value="${esc(prefs.nickname || '')}" placeholder="Nachbar:in"></label>
      <label class="nb-agree"><input type="checkbox" id="nb-agree" required ${prefs.joined ? 'checked' : ''}> Ich halte mich an die Regeln und bin freundlich.</label>
      <button class="btn primary block">Mitmachen</button>
    </form>
    ${prefs.joined ? '<button class="link center-link" data-nb="cancel-city">Abbrechen</button>' : ''}
  `;
}

// ---------- Angebote ----------
function newOfferSheet(prefill = {}) {
  const { esc } = ctx;
  const items = ctx.offerable();
  ctx.openSheet(`
    <h2 id="sheet-title">🎁 Etwas verschenken</h2>
    ${items.length ? `<p class="muted small">Aus deinem Vorrat:</p><div class="chips wrap">${items.slice(0, 10).map((i) => `<button type="button" class="chip" data-nb="pick" data-title="${esc(i.title)}" data-body="${esc(i.body)}">${i.emoji} ${esc(i.name)}</button>`).join('')}</div>` : ''}
    <form data-nb-form="offer">
      <label class="field">Was? <input id="nb-title" type="text" required maxlength="${LIMITS.title}" value="${esc(prefill.title || '')}" placeholder="z. B. 2 Brote vom Bäcker"></label>
      <label class="field">Beschreibung <textarea id="nb-body" rows="3" required maxlength="${LIMITS.body}" placeholder="z. B. gut bis Sonntag, abholen heute ab 18 Uhr – Treffpunkt machen wir hier aus">${esc(prefill.body || '')}</textarea></label>
      <label class="field">Straße <small class="muted">(ohne Hausnummer)</small> <input id="nb-offer-street" type="text" required maxlength="${LIMITS.street}" value="${esc(prefs.street || '')}" placeholder="z. B. Hauptstraße"></label>
      <p class="hint" id="nb-offer-hint" hidden></p>
      <button class="btn primary block">Anbieten</button>
      <p class="muted small">Sichtbar für alle in ${esc(prefs.city)}, ${OFFER_DAYS} Tage lang. Keine Telefonnummer – ihr schreibt hier.</p>
    </form>`);
}

function offerSheet(id) {
  const { esc } = ctx;
  const o = st.posts.find((p) => p.id === id);
  if (!o) return ctx.toast('Das Angebot ist nicht mehr da');
  const thread = shown().filter((p) => p.reply_to === id);
  const own = mine(o);
  ctx.openSheet(`
    <h2 id="sheet-title">🎁 ${esc(o.title)}</h2>
    <p class="muted small">📍 ${esc(o.street || prefs.city)} · ${esc(o.nickname)} · ${ago(o.created_at)}${o.status !== 'offen' ? ` · <b>${STATUS[o.status]}</b>` : ''}</p>
    <p class="nb-body">${esc(o.body)}</p>
    ${own ? `<div class="chips wrap" role="group" aria-label="Status">${Object.entries(STATUS).map(([k, label]) => `<button class="chip ${o.status === k ? 'on' : ''}" data-nb="status" data-id="${esc(id)}" data-status="${k}" aria-pressed="${o.status === k}">${label}</button>`).join('')}</div>` : ''}
    <h3 class="group">💬 Fragen & Absprachen</h3>
    <div class="nb-chat">${thread.length ? thread.map((m) => msgHtml(m)).join('') : `<p class="muted small">${own ? 'Noch niemand hat geschrieben.' : 'Schreib, dass du es gern hättest, und macht hier einen Treffpunkt aus.'}</p>`}</div>
    ${o.status === 'vergeben' ? '' : `<form class="input-row" data-nb-form="reply" data-id="${esc(id)}">
      <input id="nb-reply" type="text" autocomplete="off" enterkeyhint="send" maxlength="${LIMITS.body}" placeholder="${own ? 'Antworten…' : 'z. B. Hätte ich gern! Treffpunkt?'}" aria-label="Antwort">
      <button class="icon-btn" aria-label="Senden">➤</button></form>`}
    ${own
    ? `<button class="link danger" data-nb="delete" data-id="${esc(id)}">Angebot löschen</button>`
    : `<div class="row-btns"><button class="btn small" data-nb="report" data-id="${esc(id)}">🚩 Melden</button><button class="btn small" data-nb="block" data-id="${esc(id)}">🚫 Blockieren</button></div>`}
  `);
}

function msgSheet(id) {
  const m = st.posts.find((p) => p.id === id);
  if (!m) return;
  const { esc } = ctx;
  ctx.openSheet(`
    <h2 id="sheet-title">${mine(m) ? 'Deine Nachricht' : `Nachricht von ${esc(m.nickname)}`}</h2>
    <p class="nb-body">${esc(m.body)}</p>
    ${mine(m)
    ? `<button class="btn block" data-nb="delete" data-id="${esc(id)}">🗑 Löschen</button>`
    : `<button class="btn block" data-nb="report" data-id="${esc(id)}">🚩 Melden</button>
       <button class="btn block" data-nb="block" data-id="${esc(id)}">🚫 ${esc(m.nickname)} blockieren</button>
       <p class="muted small">Blockieren: Du siehst von dieser Person nichts mehr. Sie erfährt davon nichts.</p>`}`);
}

// ---------- Senden mit Aufpasser ----------
// 1. Feste Regeln (keine Telefonnummer usw.) – sofort, auf dem Gerät. Die Datenbank prüft dasselbe noch einmal.
// 2. Der KI-Koch liest mit und bremst bei Streit oder Beleidigungen.
// 3. Erst dann geht es raus.
async function send(post, { context = [], force = false } = {}) {
  const texts = [post.title, post.body].filter(Boolean).join('\n');
  const problems = checkText(post.body).concat(post.title ? checkText(post.title, { max: LIMITS.title }) : []);
  if (problems.length) { ctx.toast(problemText([...new Set(problems)])); return false; }
  if (st.busy) return false;
  st.busy = true;
  try {
    if (!force) {
      const { apiKey, server, sample } = ctx.aiConn();
      if (!sample && (apiKey || server)) {
        ctx.toast('👨‍🍳 Der Koch liest kurz mit…');
        const v = await askModerator({ apiKey, server, text: texts, recent: context });
        document.getElementById('toast')?.classList.remove('show');
        if (v && v.verdict !== 'ok') { st.busy = false; chefSheet(v, post, context); return false; }
      }
    }
    const row = await api.post({ ...post, city: prefs.city, nickname: cleanNickname(prefs.nickname) });
    st.posts.push(row);
    return true;
  } catch (e) {
    ctx.toast(e.message);
    return false;
  } finally {
    st.busy = false;
  }
}

let pending = null;
function chefSheet(v, post, context) {
  const { esc } = ctx;
  pending = { post, context };
  ctx.openSheet(`
    <h2 id="sheet-title">👨‍🍳 Kurz durchatmen</h2>
    <p>${esc(v.grund || (v.verdict === 'stopp' ? 'So kann die Nachricht nicht in den Chat.' : 'Das könnte falsch ankommen.'))}</p>
    ${v.vorschlag ? `<p class="muted small">Vorschlag vom Koch:</p><p class="bubble nb-suggest">${esc(v.vorschlag)}</p>
      <button class="btn primary block" data-nb="use-suggestion" data-text="${esc(v.vorschlag)}">Vorschlag senden</button>` : ''}
    <button class="btn block" data-nb="edit-again">Selbst ändern</button>
    ${v.verdict === 'hinweis' ? '<button class="link center-link" data-nb="send-anyway">Trotzdem so senden</button>' : ''}`);
}

// ---------- Ereignisse ----------
async function onClick(e) {
  const el = e.target.closest('[data-nb]');
  if (!el) return;
  e.preventDefault();
  const id = el.dataset.id;
  const a = el.dataset.nb;
  if (a === 'city') { prefs.joined = false; savePrefs({ joined: false, wasJoined: true }); ctx.view.innerHTML = joinHtml(); }
  if (a === 'cancel-city') { savePrefs({ joined: true }); renderNachbarn(); }
  if (a === 'street') { st.street = el.dataset.street; draw(); }
  if (a === 'reload') load(false);
  if (a === 'new-offer') newOfferSheet();
  if (a === 'pick') { document.getElementById('nb-title').value = el.dataset.title; document.getElementById('nb-body').value = el.dataset.body; }
  if (a === 'offer') offerSheet(id);
  if (a === 'msg') msgSheet(id);
  if (a === 'rules') ctx.openSheet(`<h2 id="sheet-title">Regeln & Datenschutz</h2>${RULES}
    <p class="muted small">Gespeichert wird nur, was du hier schreibst, mit Stadt, Straße, Name im Chat und Uhrzeit – in einer Datenbank in der EU (Frankfurt). Vor dem Senden geht der Text kurz an die KI (Google Gemini) zur Prüfung.</p>`);
  if (a === 'profile') {
    ctx.openSheet(`<h2 id="sheet-title">Mein Name im Chat</h2>
      <form data-nb-form="profile"><label class="field">Name <input id="nb-nick2" type="text" maxlength="${LIMITS.nickname}" value="${ctx.esc(prefs.nickname || '')}" placeholder="Nachbar:in"></label>
      <label class="field">Meine Straße <input id="nb-street2" type="text" maxlength="${LIMITS.street}" value="${ctx.esc(prefs.street || '')}" placeholder="ohne Hausnummer"></label>
      <button class="btn primary block">Speichern</button></form>
      ${prefs.blocked.length ? `<button class="link center-link" data-nb="unblock">Blockierte wieder zeigen (${prefs.blocked.length})</button>` : ''}`);
  }
  if (a === 'unblock') { savePrefs({ blocked: [] }); ctx.closeSheet(); draw(); ctx.toast('Alle wieder sichtbar'); }
  if (a === 'status') {
    try { await api.setStatus(id, el.dataset.status); const o = st.posts.find((p) => p.id === id); if (o) o.status = el.dataset.status; offerSheet(id); draw(); } catch (err) { ctx.toast(err.message); }
  }
  if (a === 'delete') {
    if (!confirm('Wirklich löschen?')) return;
    try { await api.remove(id); st.posts = st.posts.filter((p) => p.id !== id && p.reply_to !== id); ctx.closeSheet(); draw(); ctx.toast('Gelöscht'); } catch (err) { ctx.toast(err.message); }
  }
  if (a === 'wipe') {
    if (!confirm('Alle deine Angebote und Nachrichten jetzt endgültig löschen?')) return;
    try { await api.removeAll(); st.posts = st.posts.filter((p) => !mine(p)); draw(); ctx.toast('Alles von dir ist gelöscht'); } catch (err) { ctx.toast(err.message); }
  }
  if (a === 'report') {
    const reason = prompt('Was stimmt nicht? (freiwillig)', '') ?? null;
    if (reason === null) return;
    try { await api.report(id, reason.slice(0, 200) || null); ctx.closeSheet(); ctx.toast('Danke! Wir schauen hin. Nach 3 Meldungen ist es sofort weg.'); load(); } catch (err) { ctx.toast(err.message); }
  }
  if (a === 'block') {
    const p = st.posts.find((x) => x.id === id);
    if (!p) return;
    savePrefs({ blocked: [...new Set([...prefs.blocked, p.user_id])] });
    ctx.closeSheet(); draw(); ctx.toast(`${p.nickname} ist blockiert`);
  }
  if (a === 'use-suggestion' && pending) { const { post, context } = pending; pending = null; ctx.closeSheet(); if (await send({ ...post, body: el.dataset.text }, { context, force: true })) afterSend(post); }
  if (a === 'send-anyway' && pending) { const { post, context } = pending; pending = null; ctx.closeSheet(); if (await send(post, { context, force: true })) afterSend(post); }
  if (a === 'edit-again' && pending) {
    const { post } = pending; pending = null; ctx.closeSheet();
    if (post.kind === 'angebot') newOfferSheet(post);
    else if (post.reply_to) { offerSheet(post.reply_to); const r = document.getElementById('nb-reply'); if (r) { r.value = post.body; r.focus(); } }
    else { const c = document.getElementById('nb-chat'); if (c) { c.value = post.body; c.focus(); } }
  }
}

function afterSend(post) {
  if (post.kind === 'angebot') { ctx.closeSheet(); ctx.toast('Angeboten! Nachbarn können jetzt schreiben.'); }
  if (post.reply_to) offerSheet(post.reply_to);
  else { const c = document.getElementById('nb-chat'); if (c && post.kind !== 'angebot') c.value = ''; }
  draw();
}

async function onSubmit(e) {
  const form = e.target.dataset.nbForm;
  if (!form) return;
  e.preventDefault();
  const val = (id) => document.getElementById(id)?.value ?? '';
  if (form === 'join') {
    const city = normCity(val('nb-city'));
    if (city.length < 2 || /\d/.test(city)) return ctx.toast('Bitte eine Stadt eintragen');
    if (!document.getElementById('nb-agree')?.checked) return ctx.toast('Bitte die Regeln bestätigen');
    const nick = val('nb-nick').trim();
    if (nick && checkText(nick).some((r) => r !== 'long')) return ctx.toast('Bitte einen Namen ohne Zahlen oder Kontaktdaten');
    if (city !== prefs.city) st.street = '';
    savePrefs({ city, street: normStreet(val('nb-street')), nickname: nick ? cleanNickname(nick) : '', joined: true });
    st.loadedFor = '';
    renderNachbarn();
  }
  if (form === 'profile') {
    const nick = val('nb-nick2').trim();
    if (nick && checkText(nick).some((r) => r !== 'long')) return ctx.toast('Bitte einen Namen ohne Zahlen oder Kontaktdaten');
    savePrefs({ nickname: nick ? cleanNickname(nick) : '', street: normStreet(val('nb-street2')) });
    ctx.closeSheet(); ctx.toast('Gespeichert');
  }
  if (form === 'offer') {
    const street = normStreet(val('nb-offer-street'));
    if (street.length < 2) return ctx.toast('Bitte die Straße eintragen (ohne Hausnummer)');
    const post = { kind: 'angebot', title: val('nb-title').trim(), body: val('nb-body').trim(), street };
    if (await send(post, { context: [] })) { savePrefs({ street }); afterSend(post); }
  }
  if (form === 'reply') {
    const id = e.target.dataset.id;
    const body = val('nb-reply').trim();
    if (!body) return;
    const post = { kind: 'nachricht', body, reply_to: id, street: prefs.street || null };
    const context = shown().filter((p) => p.id === id || p.reply_to === id).map((p) => ({ nickname: p.nickname, body: p.title ? `${p.title}: ${p.body}` : p.body }));
    if (await send(post, { context })) afterSend(post);
  }
  if (form === 'chat') {
    const body = val('nb-chat').trim();
    if (!body) return;
    const post = { kind: 'nachricht', body, street: prefs.street || null };
    const context = shown().filter((p) => p.kind === 'nachricht' && !p.reply_to);
    if (await send(post, { context })) afterSend(post);
  }
}
