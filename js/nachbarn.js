// Oberfläche der Nachbarschafts-Börse (#/nachbarn): Essen verschenken und offen darüber schreiben.
// Freiwillig, öffentlich für die eigene Stadt, nach Straße geordnet, ohne Telefonnummern.
// Ist keine Datenbank eingerichtet (config.js), läuft eine Vorschau, die nur auf diesem Gerät speichert.
import { checkText, problemText, cleanNickname, normCity, normStreet, visible, byStreet, ago, askModerator, STATUS, LIMITS, OFFER_DAYS, MESSAGE_DAYS } from './neighbors.js';
import { supabaseBackend, localBackend } from './neighborapi.js';
import { t } from './i18n.js';

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
const streetName = (s) => (s === 'Ohne Straße' ? t('Ohne Straße') : s);
const status = (k) => t(STATUS[k]);

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
    <section class="hero"><h1>🏘️ ${t('Nachbarn')}</h1><p>${t('Essen verschenken in <b>{city}</b>', { city: esc(prefs.city) })} · <button class="link" data-nb="city">${t('Stadt ändern')}</button></p></section>
    ${api.live ? '' : `<p class="hint">${t('Vorschau: Hier ist noch niemand sonst. Was du schreibst, bleibt nur auf diesem Gerät.')}</p>`}
    <button class="btn primary block" data-nb="new-offer">🎁 ${t('Etwas verschenken')}</button>
    ${streets.length > 1 ? `<div class="chips nb-streets" role="group" aria-label="${t('Straße')}">
      <button class="chip ${st.street ? '' : 'on'}" data-nb="street" data-street="" aria-pressed="${!st.street}">${t('Alle Straßen')}</button>
      ${streets.map((g) => `<button class="chip ${st.street === g.street ? 'on' : ''}" data-nb="street" data-street="${esc(g.street)}" aria-pressed="${st.street === g.street}">${esc(streetName(g.street))} <small>${g.offers.length}</small></button>`).join('')}
    </div>` : ''}
    ${st.error ? `<p class="hint danger">${esc(st.error)} <button class="link" data-nb="reload">${t('Nochmal')}</button></p>` : ''}
    ${st.loading && !posts.length ? `<p class="muted center">${t('Lädt…')}</p>` : ''}
    ${filtered.length ? filtered.map((g) => `
      <h3 class="group">📍 ${esc(streetName(g.street))}</h3>
      <ul class="list">${g.offers.map((o) => `<li class="item nb-offer ${o.status}">
        <button class="item-main" data-nb="offer" data-id="${esc(o.id)}">
          <span class="emoji">🎁</span>
          <span class="item-text"><b>${esc(o.title)}</b>
            <small class="sub">${esc(o.nickname)} · ${ago(o.created_at)}${replies(o.id) ? ` · 💬 ${replies(o.id)}` : ''}</small></span>
          ${o.status !== 'offen' ? `<span class="badge ${o.status === 'vergeben' ? 'week' : 'soon'}">${status(o.status)}</span>` : ''}
        </button></li>`).join('')}</ul>`).join('')
    : st.loading ? '' : `<div class="card empty"><div class="big">🧺</div><p>${t('In {city} wird gerade nichts verschenkt.', { city: esc(prefs.city) })}<br>${t('Mach den Anfang!')}</p></div>`}

    <h3 class="group">💬 ${t('Chat in {city}', { city: esc(prefs.city) })}</h3>
    <section class="card nb-chat" aria-live="polite">
      ${chat.length ? chat.map((m) => msgHtml(m)).join('') : `<p class="muted small center">${t('Noch keine Nachrichten. Sag Hallo oder frag, wer etwas braucht.')}</p>`}
      <form class="input-row" data-nb-form="chat">
        <input id="nb-chat" type="text" autocomplete="off" enterkeyhint="send" maxlength="${LIMITS.body}" placeholder="${t('Schreib an alle in {city}…', { city: esc(prefs.city) })}" aria-label="${t('Nachricht an alle')}" value="${esc(draft)}">
        <button class="icon-btn flip" aria-label="${t('Senden')}" ${st.busy ? 'disabled' : ''}>➤</button>
      </form>
    </section>
    <p class="muted small center">${t('Alles hier sehen alle in {city}. Angebote verschwinden nach {offer} Tagen, Nachrichten nach {msg}.', { city: esc(prefs.city), offer: OFFER_DAYS, msg: MESSAGE_DAYS })}
      <br><button class="link" data-nb="rules">${t('Regeln & Datenschutz')}</button> · <button class="link" data-nb="profile">${t('Mein Name')}</button> · <button class="link" data-nb="wipe">${t('Alles von mir löschen')}</button></p>
  `;
  if (focused) { const el = document.getElementById('nb-chat'); el?.focus(); el?.setSelectionRange(draft.length, draft.length); }
}

function msgHtml(m) {
  const { esc } = ctx;
  return `<div class="nb-msg ${mine(m) ? 'me' : ''}">
    <div class="nb-meta"><b>${esc(m.nickname)}</b>${m.street ? ` · ${esc(m.street)}` : ''} · ${ago(m.created_at)}
      <button class="nb-more" data-nb="msg" data-id="${esc(m.id)}" aria-label="${t(mine(m) ? 'Löschen' : 'Melden oder blockieren')}">⋯</button></div>
    <p>${esc(m.body)}</p></div>`;
}

const RULES = () => `
  <ul class="nb-rules">
    <li>🙋 ${t('<b>Freiwillig.</b> Kein Konto, keine E-Mail. Dein Gerät bekommt nur eine zufällige Kennung.')}</li>
    <li>👀 ${t('<b>Offen.</b> Alles hier sehen alle in deiner Stadt. Private Nachrichten gibt es nicht – das schützt vor Belästigung.')}</li>
    <li>📍 ${t('<b>Nur Stadt und Straße.</b> Keine Hausnummer. Zur Übergabe trefft ihr euch an einem Ort, den ihr hier ausmacht (z. B. vor dem Bäcker).')}</li>
    <li>📵 ${t('<b>Keine Telefonnummern</b>, E-Mails, Links oder Kontodaten. Die App lässt sie gar nicht durch.')}</li>
    <li>👨‍🍳 ${t('<b>Der KI-Koch liest mit</b>, bevor etwas rausgeht, und bremst freundlich, wenn der Ton kippt.')}</li>
    <li>🚩 ${t('<b>Melden & Blockieren</b> bei jeder Nachricht. Nach 3 Meldungen ist ein Beitrag sofort weg.')}</li>
    <li>🧹 ${t('<b>Alles verschwindet von selbst:</b> Angebote nach {offer} Tagen, Nachrichten nach {msg}. Eigenes kannst du jederzeit löschen.', { offer: OFFER_DAYS, msg: MESSAGE_DAYS })}</li>
    <li>🥩 ${t('Kein rohes Fleisch, Fisch oder Geflügel nach Verbrauchsdatum, nichts Selbstgekochtes von gestern ohne Kühlung, kein Alkohol.')}</li>
  </ul>`;

function joinHtml() {
  const { esc } = ctx;
  const cities = st.cities.slice(0, 8);
  return `
    <section class="hero"><h1>🏘️ ${t('Nachbarn')}</h1><p>${t('Essen, das du nicht mehr schaffst, an Leute in deiner Straße verschenken – und offen darüber schreiben.')}</p></section>
    ${api.live ? '' : `<p class="hint">${t('Vorschau: Noch nicht öffentlich. Was du hier schreibst, bleibt nur auf diesem Gerät.')}</p>`}
    <section class="card">${RULES()}</section>
    <form class="card" data-nb-form="join">
      <label class="field">${t('Stadt')} <input id="nb-city" type="text" required autocomplete="address-level2" maxlength="${LIMITS.city}" value="${esc(prefs.city || '')}" placeholder="${esc(t('z. B. Berlin'))}" list="nb-cities"></label>
      ${cities.length ? `<datalist id="nb-cities">${cities.map((c) => `<option value="${esc(c.stadt)}">`).join('')}</datalist>` : ''}
      <label class="field">${t('Deine Straße')} <small class="muted">${t('(ohne Hausnummer, freiwillig)')}</small> <input id="nb-street" type="text" maxlength="${LIMITS.street}" value="${esc(prefs.street || '')}" placeholder="${esc(t('z. B. Hauptstraße'))}"></label>
      <label class="field">${t('Name im Chat')} <small class="muted">${t('(freiwillig, gern ein Spitzname)')}</small> <input id="nb-nick" type="text" maxlength="${LIMITS.nickname}" value="${esc(prefs.nickname || '')}" placeholder="${esc(t('Nachbar:in'))}"></label>
      <label class="nb-agree"><input type="checkbox" id="nb-agree" required ${prefs.joined ? 'checked' : ''}> ${t('Ich halte mich an die Regeln und bin freundlich.')}</label>
      <button class="btn primary block">${t('Mitmachen')}</button>
    </form>
    ${prefs.joined ? `<button class="link center-link" data-nb="cancel-city">${t('Abbrechen')}</button>` : ''}
  `;
}

// ---------- Angebote ----------
function newOfferSheet(prefill = {}) {
  const { esc } = ctx;
  const items = ctx.offerable();
  ctx.openSheet(`
    <h2 id="sheet-title">🎁 ${t('Etwas verschenken')}</h2>
    ${items.length ? `<p class="muted small">${t('Aus deinem Vorrat:')}</p><div class="chips wrap">${items.slice(0, 10).map((i) => `<button type="button" class="chip" data-nb="pick" data-title="${esc(i.title)}" data-body="${esc(i.body)}">${i.emoji} ${esc(i.name)}</button>`).join('')}</div>` : ''}
    <form data-nb-form="offer">
      <label class="field">${t('Was?')} <input id="nb-title" type="text" required maxlength="${LIMITS.title}" value="${esc(prefill.title || '')}" placeholder="${esc(t('z. B. 2 Brote vom Bäcker'))}"></label>
      <label class="field">${t('Beschreibung')} <textarea id="nb-body" rows="3" required maxlength="${LIMITS.body}" placeholder="${esc(t('z. B. gut bis Sonntag, abholen heute ab 18 Uhr – Treffpunkt machen wir hier aus'))}">${esc(prefill.body || '')}</textarea></label>
      <label class="field">${t('Straße')} <small class="muted">${t('(ohne Hausnummer)')}</small> <input id="nb-offer-street" type="text" required maxlength="${LIMITS.street}" value="${esc(prefs.street || '')}" placeholder="${esc(t('z. B. Hauptstraße'))}"></label>
      <p class="hint" id="nb-offer-hint" hidden></p>
      <button class="btn primary block">${t('Anbieten')}</button>
      <p class="muted small">${t('Sichtbar für alle in {city}, {n} Tage lang. Keine Telefonnummer – ihr schreibt hier.', { city: esc(prefs.city), n: OFFER_DAYS })}</p>
    </form>`);
}

function offerSheet(id) {
  const { esc } = ctx;
  const o = st.posts.find((p) => p.id === id);
  if (!o) return ctx.toast(t('Das Angebot ist nicht mehr da'));
  const thread = shown().filter((p) => p.reply_to === id);
  const own = mine(o);
  ctx.openSheet(`
    <h2 id="sheet-title">🎁 ${esc(o.title)}</h2>
    <p class="muted small">📍 ${esc(o.street || prefs.city)} · ${esc(o.nickname)} · ${ago(o.created_at)}${o.status !== 'offen' ? ` · <b>${status(o.status)}</b>` : ''}</p>
    <p class="nb-body">${esc(o.body)}</p>
    ${own ? `<div class="chips wrap" role="group" aria-label="${t('Status')}">${Object.keys(STATUS).map((k) => `<button class="chip ${o.status === k ? 'on' : ''}" data-nb="status" data-id="${esc(id)}" data-status="${k}" aria-pressed="${o.status === k}">${status(k)}</button>`).join('')}</div>` : ''}
    <h3 class="group">💬 ${t('Fragen & Absprachen')}</h3>
    <div class="nb-chat">${thread.length ? thread.map((m) => msgHtml(m)).join('') : `<p class="muted small">${t(own ? 'Noch niemand hat geschrieben.' : 'Schreib, dass du es gern hättest, und macht hier einen Treffpunkt aus.')}</p>`}</div>
    ${o.status === 'vergeben' ? '' : `<form class="input-row" data-nb-form="reply" data-id="${esc(id)}">
      <input id="nb-reply" type="text" autocomplete="off" enterkeyhint="send" maxlength="${LIMITS.body}" placeholder="${esc(t(own ? 'Antworten…' : 'z. B. Hätte ich gern! Treffpunkt?'))}" aria-label="${t('Antwort')}">
      <button class="icon-btn flip" aria-label="${t('Senden')}">➤</button></form>`}
    ${own
    ? `<button class="link danger" data-nb="delete" data-id="${esc(id)}">${t('Angebot löschen')}</button>`
    : `<div class="row-btns"><button class="btn small" data-nb="report" data-id="${esc(id)}">🚩 ${t('Melden')}</button><button class="btn small" data-nb="block" data-id="${esc(id)}">🚫 ${t('Blockieren')}</button></div>`}
  `);
}

function msgSheet(id) {
  const m = st.posts.find((p) => p.id === id);
  if (!m) return;
  const { esc } = ctx;
  ctx.openSheet(`
    <h2 id="sheet-title">${mine(m) ? t('Deine Nachricht') : t('Nachricht von {name}', { name: esc(m.nickname) })}</h2>
    <p class="nb-body">${esc(m.body)}</p>
    ${mine(m)
    ? `<button class="btn block" data-nb="delete" data-id="${esc(id)}">🗑 ${t('Löschen')}</button>`
    : `<button class="btn block" data-nb="report" data-id="${esc(id)}">🚩 ${t('Melden')}</button>
       <button class="btn block" data-nb="block" data-id="${esc(id)}">🚫 ${t('{name} blockieren', { name: esc(m.nickname) })}</button>
       <p class="muted small">${t('Blockieren: Du siehst von dieser Person nichts mehr. Sie erfährt davon nichts.')}</p>`}`);
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
        ctx.toast(`👨‍🍳 ${t('Der Koch liest kurz mit…')}`);
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
    <h2 id="sheet-title">👨‍🍳 ${t('Kurz durchatmen')}</h2>
    <p>${esc(v.grund || t(v.verdict === 'stopp' ? 'So kann die Nachricht nicht in den Chat.' : 'Das könnte falsch ankommen.'))}</p>
    ${v.vorschlag ? `<p class="muted small">${t('Vorschlag vom Koch:')}</p><p class="bubble nb-suggest">${esc(v.vorschlag)}</p>
      <button class="btn primary block" data-nb="use-suggestion" data-text="${esc(v.vorschlag)}">${t('Vorschlag senden')}</button>` : ''}
    <button class="btn block" data-nb="edit-again">${t('Selbst ändern')}</button>
    ${v.verdict === 'hinweis' ? `<button class="link center-link" data-nb="send-anyway">${t('Trotzdem so senden')}</button>` : ''}`);
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
  if (a === 'rules') ctx.openSheet(`<h2 id="sheet-title">${t('Regeln & Datenschutz')}</h2>${RULES()}
    <p class="muted small">${t('Gespeichert wird nur, was du hier schreibst, mit Stadt, Straße, Name im Chat und Uhrzeit – in einer Datenbank in der EU (Frankfurt). Vor dem Senden geht der Text kurz an die KI (Google Gemini) zur Prüfung.')}</p>`);
  if (a === 'profile') {
    ctx.openSheet(`<h2 id="sheet-title">${t('Mein Name im Chat')}</h2>
      <form data-nb-form="profile"><label class="field">${t('Name')} <input id="nb-nick2" type="text" maxlength="${LIMITS.nickname}" value="${ctx.esc(prefs.nickname || '')}" placeholder="${ctx.esc(t('Nachbar:in'))}"></label>
      <label class="field">${t('Meine Straße')} <input id="nb-street2" type="text" maxlength="${LIMITS.street}" value="${ctx.esc(prefs.street || '')}" placeholder="${ctx.esc(t('ohne Hausnummer'))}"></label>
      <button class="btn primary block">${t('Speichern')}</button></form>
      ${prefs.blocked.length ? `<button class="link center-link" data-nb="unblock">${t('Blockierte wieder zeigen ({n})', { n: prefs.blocked.length })}</button>` : ''}`);
  }
  if (a === 'unblock') { savePrefs({ blocked: [] }); ctx.closeSheet(); draw(); ctx.toast(t('Alle wieder sichtbar')); }
  if (a === 'status') {
    try { await api.setStatus(id, el.dataset.status); const o = st.posts.find((p) => p.id === id); if (o) o.status = el.dataset.status; offerSheet(id); draw(); } catch (err) { ctx.toast(err.message); }
  }
  if (a === 'delete') {
    if (!confirm(t('Wirklich löschen?'))) return;
    try { await api.remove(id); st.posts = st.posts.filter((p) => p.id !== id && p.reply_to !== id); ctx.closeSheet(); draw(); ctx.toast(t('Gelöscht')); } catch (err) { ctx.toast(err.message); }
  }
  if (a === 'wipe') {
    if (!confirm(t('Alle deine Angebote und Nachrichten jetzt endgültig löschen?'))) return;
    try { await api.removeAll(); st.posts = st.posts.filter((p) => !mine(p)); draw(); ctx.toast(t('Alles von dir ist gelöscht')); } catch (err) { ctx.toast(err.message); }
  }
  if (a === 'report') {
    const reason = prompt(t('Was stimmt nicht? (freiwillig)'), '') ?? null;
    if (reason === null) return;
    try { await api.report(id, reason.slice(0, 200) || null); ctx.closeSheet(); ctx.toast(t('Danke! Wir schauen hin. Nach 3 Meldungen ist es sofort weg.')); load(); } catch (err) { ctx.toast(err.message); }
  }
  if (a === 'block') {
    const p = st.posts.find((x) => x.id === id);
    if (!p) return;
    savePrefs({ blocked: [...new Set([...prefs.blocked, p.user_id])] });
    ctx.closeSheet(); draw(); ctx.toast(t('{name} ist blockiert', { name: p.nickname }));
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
  if (post.kind === 'angebot') { ctx.closeSheet(); ctx.toast(t('Angeboten! Nachbarn können jetzt schreiben.')); }
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
    if (city.length < 2 || /\d/.test(city)) return ctx.toast(t('Bitte eine Stadt eintragen'));
    if (!document.getElementById('nb-agree')?.checked) return ctx.toast(t('Bitte die Regeln bestätigen'));
    const nick = val('nb-nick').trim();
    if (nick && checkText(nick).some((r) => r !== 'long')) return ctx.toast(t('Bitte einen Namen ohne Zahlen oder Kontaktdaten'));
    if (city !== prefs.city) st.street = '';
    savePrefs({ city, street: normStreet(val('nb-street')), nickname: nick ? cleanNickname(nick) : '', joined: true });
    st.loadedFor = '';
    renderNachbarn();
  }
  if (form === 'profile') {
    const nick = val('nb-nick2').trim();
    if (nick && checkText(nick).some((r) => r !== 'long')) return ctx.toast(t('Bitte einen Namen ohne Zahlen oder Kontaktdaten'));
    savePrefs({ nickname: nick ? cleanNickname(nick) : '', street: normStreet(val('nb-street2')) });
    ctx.closeSheet(); ctx.toast(t('Gespeichert'));
  }
  if (form === 'offer') {
    const street = normStreet(val('nb-offer-street'));
    if (street.length < 2) return ctx.toast(t('Bitte die Straße eintragen (ohne Hausnummer)'));
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
