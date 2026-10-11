// Restlos – Oberfläche. Ansichten: Vorrat, Rezepte (mit KI-Koch), Einkauf, Teilen, Bilanz.
import { createStore } from './store.js';
import { CATS, PLACES, PRODUCTS, byId, matchProduct, searchProducts } from './products.js';
import { iso, addDays, daysLeft, status, stats, openItem, parseFreeText, makeItem } from './pantry.js';
import { parseReceipt } from './receipt.js';
import { suggest } from './recipes.js';
import { shareItems, printPoster, calendarFile } from './share.js';
import { CONFIG } from './config.js';
import { scanCamera, cameraSupported, MAX_SHOTS } from './camera.js';
import { checkTotal } from './receiptai.js';
import { askChef, chefProvider, firstMessage, pantryForChef, renderMarkdown, ideas, usedItems, ideasMessage, parseIdeas, pantryKey, rescueText } from './chef.js';
import { rescueTips, reminderPlan, reminderSchedule, remember, emptyMemo } from './rescue.js';

const store = createStore();
const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const sheet = $('#sheet');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = (n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const kg = (n) => `${n.toLocaleString('de-DE', { maximumFractionDigits: n < 10 ? 1 : 0 })} kg`;
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dateLabel = (s) => { const [y, m, d] = s.split('-').map(Number); return `${WD[new Date(y, m - 1, d).getDay()]}. ${d}.${m}.`; };

// ---------- kleine Helfer ----------
let toastTimer;
function toast(msg, undo, label = 'Rückgängig') {
  const t = $('#toast');
  // Ein offenes Sheet liegt in der obersten Ebene – der Hinweis muss mit hinein, sonst ist er verdeckt.
  (sheet.open ? sheet : document.body).append(t);
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button data-action="undo">${esc(label)}</button>` : ''}`;
  t.classList.add('show');
  toast.undo = undo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 6000 : 3000);
}

function openSheet(html, onReady) {
  sheet.innerHTML = `<div class="sheet-inner"><button class="sheet-close" data-action="close" aria-label="Schließen">✕</button>${html}</div>`;
  if (!sheet.open) sheet.showModal();
  onReady?.(sheet);
}
const closeSheet = () => sheet.open && sheet.close();
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
// Beim Schließen gibt der Browser den Fokus an den Knopf zurück, der das Fenster geöffnet hat. Nach „Zurück“
// zeigt er dann einen Rahmen um den Knopf – den wollen wir nicht stehen lassen.
sheet.addEventListener('close', () => document.activeElement?.blur());

// „Restlos unterstützen“ – nur sichtbar, wenn in config.js ein PayPal-Link steht.
const supportUrl = /^https:\/\//.test(CONFIG.paypal) ? CONFIG.paypal : '';
const supportLink = (text, cls = 'link') => (supportUrl ? `<a class="${cls}" href="${esc(supportUrl)}" target="_blank" rel="noopener">${text}</a>` : '');

// Warum es Restlos gibt: kostenlos, aus Überzeugung – und was jede gerettete Sache bringt.
function missionCard(s) {
  const mine = s && s.saved ? `<p class="mission-mine">Du hast in den letzten 30 Tagen <b>${s.saved} Lebensmittel</b> gerettet – das sind rund <b>${euro(s.savedEuro)}</b> und <b>${kg(s.savedCo2)} CO₂</b>.</p>` : '';
  return `<section class="card mission" id="mission">
    <span class="mission-badge">Kostenlos · ohne Werbung · ohne Abo</span>
    <h2>Gemacht, damit weniger im Müll landet</h2>
    <p>Restlos ist kein Geschäftsmodell, sondern ein Herzensprojekt. Die App ist kostenlos und bleibt es – für alle, die beim ganz normalen Einkaufen etwas für ihren Geldbeutel und für unsere Umwelt tun möchten.</p>
    <ul class="mission-points">
      <li><span>🥕</span><span><b>Weniger wegwerfen</b>In Deutschland landen pro Person rund 78 kg Lebensmittel im Jahr im Müll – oft nur, weil man sie vergessen hat. Restlos erinnert dich rechtzeitig und zeigt, was du daraus kochen kannst.</span></li>
      <li><span>🌍</span><span><b>Die Umwelt schützen</b>In jedem Lebensmittel stecken Wasser, Energie und CO₂. Was du isst statt wegwirfst, war nicht umsonst produziert.</span></li>
      <li><span>💶</span><span><b>Geld sparen</b>Weggeworfene Lebensmittel kosten einen Haushalt im Schnitt mehrere hundert Euro im Jahr. Was du rettest, bleibt in deinem Geldbeutel.</span></li>
    </ul>
    ${mine}
    <div class="mission-support">
      <b>💚 Restlos unterstützen</b>
      <p>Damit Restlos bald auch im App Store und bei Google Play erscheint und der KI-Koch weiter kostenlos kocht, freuen wir uns über eine freiwillige Unterstützung. Jeder Betrag hilft – keiner ist Pflicht. Alle Funktionen bleiben für alle frei.</p>
      ${supportUrl ? supportLink('💚 Restlos unterstützen', 'btn primary block') : '<p class="muted small">Die Möglichkeit zum Unterstützen kommt in Kürze.</p>'}
    </div>
  </section>`;
}

// Kleiner Dank an Meilensteinen (10, 50, 100 … gerettete Sachen) – jeweils nur einmal.
const MILESTONES = [10, 50, 100, 250, 500];
function milestoneCard() {
  const saved = stats(store.state.log, iso(), 3650).saved;
  const m = [...MILESTONES].reverse().find((x) => saved >= x);
  if (!m || (store.state.settings.milestone || 0) >= m) return '';
  return `<section class="card mission-nudge">
    <button class="sheet-close" data-action="milestone-ok" data-m="${m}" aria-label="Schließen">✕</button>
    <b>🎉 Schon ${m} Lebensmittel gerettet!</b>
    <p class="small">Danke, dass du mitmachst. Restlos ist kostenlos und aus Überzeugung entstanden – damit weniger im Müll landet.</p>
    <a class="link small" href="#/bilanz?mission=1" data-action="mission" data-m="${m}">Warum es Restlos gibt${supportUrl ? ' · unterstützen' : ''}</a>
  </section>`;
}

const badge = (item) => {
  const s = status(item);
  return `<span class="badge ${s.level}">${s.label}</span>`;
};

// ---------- Vorrat ----------
let placeFilter = 'alle';

function renderVorrat() {
  const items = store.items();
  const urgent = items.filter((i) => daysLeft(i) <= 2 && !i.offered);
  const hour = new Date().getHours();
  const hello = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const counts = { alle: items.length };
  for (const i of items) counts[i.place] = (counts[i.place] || 0) + 1;
  const shown = placeFilter === 'alle' ? items : items.filter((i) => i.place === placeFilter);

  const groups = [
    ['Drüber – erst prüfen', (d) => d < 0],
    ['Heute & morgen', (d) => d >= 0 && d <= 1],
    ['Diese Woche', (d) => d > 1 && d <= 7],
    ['Später', (d) => d > 7],
  ];
  const list = groups.map(([title, test]) => {
    const g = shown.filter((i) => test(daysLeft(i)));
    if (!g.length) return '';
    return `<section class="grp"><h3 class="group">${title}</h3><ul class="list">${g.map(row).join('')}</ul></section>`;
  }).join('');

  view.innerHTML = `
    <section class="hero">
      <h1>${hello}!</h1>
      <p>${items.length ? `${items.length} ${items.length === 1 ? 'Sache' : 'Sachen'} im Vorrat${urgent.length ? ` · <b>${urgent.length} ${urgent.length === 1 ? 'muss' : 'müssen'} bald weg</b>` : ' · alles im grünen Bereich'}` : 'Dein Vorrat ist noch leer.'}</p>
    </section>
    ${urgent.length ? `
    <section class="card alert">
      <div class="alert-head">⏰ Bald weg: ${urgent.slice(0, 4).map((i) => esc(i.name)).join(', ')}${urgent.length > 4 ? ' …' : ''}</div>
      <div class="row-btns">
        <button class="btn primary" data-action="rescue">💡 Retten</button>
        <a class="btn" href="#/koch">👨‍🍳 Koch fragen</a>
      </div>
      ${remindAsk() ? '<button class="link small" data-action="notify">🔔 Rechtzeitig erinnern lassen</button>' : ''}
    </section>` : ''}
    ${milestoneCard()}
    <section class="quick">
      <button class="quick-btn" data-action="scan"><span>📷</span>Kassenbon</button>
      <button class="quick-btn" data-action="add" data-voice="1"><span>🎤</span>Sprechen</button>
      <button class="quick-btn" data-action="add"><span>⌨️</span>Eintippen</button>
    </section>
    ${items.length ? `
    <div class="chips" role="tablist">
      ${['alle', 'kuehl', 'vorrat', 'tk'].map((p) => `<button class="chip ${placeFilter === p ? 'on' : ''}" data-action="place" data-place="${p}">${p === 'alle' ? 'Alle' : PLACES[p]} <small>${counts[p] || 0}</small></button>`).join('')}
    </div>
    ${list ? `<div class="groups">${list}</div>` : '<p class="muted center">Hier liegt gerade nichts.</p>'}` : `
    <section class="empty">
      <div class="big">🧺</div>
      <p><b>Kein Eintippen von Ablaufdaten.</b> Fotografiere einfach deinen Kassenbon – Restlos erkennt die Lebensmittel und schätzt, wie lange sie halten.</p>
      <button class="btn primary" data-action="scan">📷 Ersten Kassenbon scannen</button>
      <button class="btn ghost" data-action="demo">Erst mal mit Beispiel-Vorrat ausprobieren</button>
    </section>`}
  `;
}

function row(i) {
  return `<li class="item ${i.offered ? 'offered' : ''}">
    <button class="item-main" data-action="item" data-id="${i.id}">
      <span class="emoji">${i.emoji}</span>
      <span class="item-text"><b>${esc(i.name)}</b>${i.qty > 1 ? ` <small>× ${i.qty}</small>` : ''}
        <small class="sub">${i.offered ? '🤝 angeboten · ' : ''}${i.opened ? 'angebrochen · ' : ''}${PLACES[i.place]}</small></span>
      ${badge(i)}
    </button>
    <button class="done-btn" data-action="used" data-id="${i.id}" aria-label="${esc(i.name)} aufgebraucht">✓</button>
  </li>`;
}

function itemSheet(id) {
  const i = store.find(id);
  if (!i) return closeSheet();
  const s = status(i);
  const p = i.pid && byId[i.pid];
  let hint = '';
  if (s.d < 0 && s.vd) hint = '<p class="hint danger">Verbrauchsdatum überschritten – bitte nicht mehr essen.</p>';
  else if (s.d < 0) hint = '<p class="hint">Mindesthaltbarkeit heißt nicht „schlecht ab“. Ansehen, riechen, probieren – oft ist es noch gut.</p>';
  else if (!i.dateSet) hint = '<p class="hint muted">Datum geschätzt. Steht etwas anderes auf der Packung? Einfach unten ändern.</p>';
  openSheet(`
    <div class="sheet-head"><span class="emoji xl">${i.emoji}</span><div><h2 id="sheet-title">${esc(i.name)}${i.qty > 1 ? ` × ${i.qty}` : ''}</h2>
      <p>${badge(i)} <span class="muted">bis ${dateLabel(i.expires)}</span></p></div></div>
    ${hint}
    ${s.d <= 3 ? rescueBox(i) : ''}
    <div class="actions">
      <button class="act good" data-action="consume" data-id="${i.id}" data-how="used">✓<span>Aufgebraucht</span></button>
      ${i.qty > 1 ? `<button class="act" data-action="consume" data-id="${i.id}" data-how="used" data-qty="1">½<span>1 Stück weg</span></button>` : ''}
      ${!i.opened ? `<button class="act" data-action="open" data-id="${i.id}">🔓<span>Angebrochen</span></button>` : ''}
      ${i.place !== 'tk' ? `<button class="act" data-action="freeze" data-id="${i.id}">❄️<span>Einfrieren</span></button>` : ''}
      <button class="act" data-action="offer" data-id="${i.id}">🤝<span>${i.offered ? 'Nicht mehr anbieten' : 'Verschenken'}</span></button>
      <button class="act bad" data-action="consume" data-id="${i.id}" data-how="wasted">🗑<span>Weggeworfen</span></button>
    </div>
    <div class="form">
      <label>Gut bis <input type="date" value="${i.expires}" data-change="expires" data-id="${i.id}"></label>
      <label>Ort <select data-change="place" data-id="${i.id}">${Object.entries(PLACES).map(([k, v]) => `<option value="${k}" ${k === i.place ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Menge <input type="number" min="1" max="99" value="${i.qty}" data-change="qty" data-id="${i.id}"></label>
      <label>Preis (Stück) <input type="number" min="0" step="0.01" value="${i.price ?? ''}" data-change="price" data-id="${i.id}"></label>
    </div>
    <p class="muted small">Gekauft ${dateLabel(i.bought)}${i.raw ? ` · auf dem Bon: „${esc(i.raw)}“` : ''}${p ? ` · ${CATS[p.cat].name}` : ''}</p>
    <button class="link danger" data-action="consume" data-id="${i.id}" data-how="removed">Falsch eingetragen – löschen</button>
  `);
}

// ---------- Retten statt wegwerfen ----------
// Kurze Tipps je Sache (ohne Internet), dazu der Koch für ein Rezept rund um genau diese Sache.
function rescueBox(i, compact = false) {
  const tips = rescueTips(i);
  if (!tips.length) return '';
  const vdOver = status(i).d < 0 && status(i).vd;
  return `<div class="rescue ${compact ? 'compact' : ''}">
    ${compact ? '' : '<b class="rescue-head">💡 So rettest du es</b>'}
    <ul>${tips.map((t) => `<li><span>${t.icon}</span>${esc(t.text)}</li>`).join('')}</ul>
    ${!vdOver && aiChefReady() ? `<button class="btn small" data-action="rescue-chef" data-id="${i.id}">👨‍🍳 Rezept mit ${esc(i.name)}</button>` : ''}
  </div>`;
}

function rescueSheet() {
  const items = store.items().filter((i) => !i.offered && daysLeft(i) <= 2 && !(daysLeft(i) < 0 && status(i).vd));
  if (!items.length) return toast('Gerade muss nichts gerettet werden 🌱');
  lastSuggestions = suggest(store.items().filter((i) => !i.offered), { vegOnly: store.state.settings.veg, limit: 5 });
  const n = lastSuggestions.findIndex((r) => r.urgent.length);
  const recipe = lastSuggestions[n];
  openSheet(`
    <h2 id="sheet-title">Retten statt wegwerfen</h2>
    <p class="muted small">${items.length === 1 ? 'Diese Sache muss' : `Diese ${items.length} Sachen müssen`} bald weg. So wird noch was draus:</p>
    ${recipe ? `<button class="card recipe rescue-recipe" data-action="recipe" data-n="${n}"><span class="emoji xl">${recipe.emoji}</span>
      <span class="recipe-text"><b>${esc(recipe.title)}</b><small>${recipe.time} Min. · rettet ${recipe.urgent.map((i) => esc(i.name)).join(', ')}</small></span></button>` : ''}
    <ul class="rescue-list">${items.map((i) => `<li class="card">
      <div class="rescue-item"><span class="emoji">${i.emoji}</span><b>${esc(i.name)}</b>${badge(i)}</div>
      ${rescueBox(i, true)}</li>`).join('')}</ul>
    <a class="btn block" href="#/teilen" data-action="close-go">🤝 Lieber verschenken</a>
  `);
}

// ---------- Hinzufügen: Tippen oder Sprechen ----------
const QUICK = ['milch', 'eier', 'brot', 'bananen', 'tomaten', 'joghurt', 'kaese', 'aepfel', 'salat', 'butter', 'hackfleisch', 'gurke'];

function addSheet(voice) {
  openSheet(`
    <h2 id="sheet-title">Was ist neu im Vorrat?</h2>
    <p class="muted small">Mehrere Sachen mit Komma trennen – z. B. „Milch, 6 Eier, Brot“. Ablaufdaten schätzt Restlos.</p>
    <div class="input-row">
      <input id="add-text" type="text" autocomplete="off" enterkeyhint="done" placeholder="Milch, 6 Eier, Brot …" aria-label="Lebensmittel">
      <button class="icon-btn mic" data-action="listen" aria-label="Sprechen">🎤</button>
    </div>
    <div id="add-suggest" class="chips"></div>
    <div class="chips wrap">${QUICK.map((id) => `<button class="chip" data-action="quick-add" data-name="${byId[id].name}">${byId[id].emoji} ${byId[id].name}</button>`).join('')}</div>
    <ul id="add-preview" class="list compact"></ul>
    <button class="btn primary block" data-action="add-confirm" disabled>Hinzufügen</button>
  `, () => {
    const input = $('#add-text');
    input.addEventListener('input', updateAddPreview);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('[data-action="add-confirm"]').click(); } });
    if (voice) listen(); else setTimeout(() => input.focus(), 50);
  });
}

function addPreviewItems() {
  return parseFreeText($('#add-text')?.value || '').map((x) => makeItem({ name: x.name, qty: x.qty }));
}

function updateAddPreview() {
  const input = $('#add-text');
  const items = addPreviewItems();
  $('#add-preview').innerHTML = items.map((i) => `<li class="item"><span class="emoji">${i.emoji}</span>
    <span class="item-text"><b>${esc(i.name)}</b>${i.qty > 1 ? ` <small>× ${i.qty}</small>` : ''}<small class="sub">${i.pid ? `hält ca. bis ${dateLabel(i.expires)}` : 'unbekannt – ca. 1 Woche'} · ${PLACES[i.place]}</small></span></li>`).join('');
  $('[data-action="add-confirm"]').disabled = !items.length;
  $('[data-action="add-confirm"]').textContent = items.length > 1 ? `${items.length} Sachen hinzufügen` : 'Hinzufügen';
  // Vorschläge zum letzten angefangenen Wort
  const last = input.value.split(/,|\bund\b/).pop().trim().replace(/^\d+\s*/, '');
  const hits = last.length >= 2 ? searchProducts(last, 4).filter((p) => p.name.toLowerCase() !== last.toLowerCase()) : [];
  $('#add-suggest').innerHTML = hits.map((p) => `<button class="chip" data-action="complete" data-name="${p.name}">${p.emoji} ${p.name}</button>`).join('');
}

function listen(input = $('#add-text'), onUpdate = updateAddPreview, mic = $('.mic')) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast('Spracheingabe kann dieser Browser nicht – nutze das Mikrofon der Tastatur.');
  const rec = new SR();
  rec.lang = 'de-DE';
  rec.interimResults = true;
  const before = input.value ? `${input.value.replace(/,\s*$/, '')}, ` : '';
  mic?.classList.add('on');
  rec.onresult = (e) => {
    input.value = before + [...e.results].map((r) => r[0].transcript).join(' ');
    onUpdate();
  };
  rec.onend = () => mic?.classList.remove('on');
  rec.onerror = (e) => { mic?.classList.remove('on'); if (e.error === 'not-allowed') toast('Bitte Mikrofon erlauben.'); };
  rec.start();
}

// ---------- Kassenbon ----------
// Ablauf: Kamera (mehrere Fotos für lange Bons) → KI liest jede Zeile (sonst Texterkennung auf dem Gerät)
// → Übersicht mit Summen-Abgleich, Stückzahlen zum Korrigieren → in den Vorrat.
let shots = [];
let scan = null;

async function startScan(more = false) {
  closeSheet();
  if (!more) shots = [];
  if (!cameraSupported()) return scanSheet();
  try {
    const res = await scanCamera({ existing: shots });
    if (res?.length) { shots = res; return handlePhotos(shots); }
    if (more && scan) reviewSheet();
  } catch (e) {
    scanSheet(e.message);
  }
}

function scanSheet(problem) {
  const ai = aiReady();
  openSheet(`
    <h2 id="sheet-title">Kassenbon scannen</h2>
    ${problem ? `<p class="scan-check warn">${esc(problem)}</p>` : ''}
    <p class="muted">Bon glatt hinlegen, gut beleuchten, ganz aufs Foto. Bei langen Bons einfach mehrere Fotos auswählen. ${ai ? 'Die KI liest jede Zeile – das Foto geht dafür an Google Gemini.' : 'Die Erkennung läuft auf deinem Gerät – das Foto wird nicht hochgeladen.'}</p>
    ${!problem && cameraSupported() ? '<button class="btn primary block" data-action="scan">📷 Kamera öffnen</button>' : ''}
    <button class="btn ${problem || !cameraSupported() ? 'primary' : ''} block" data-action="photo">🖼️ Foto aufnehmen oder auswählen</button>
    <details class="paste">
      <summary>Digitalen Kassenbon einfügen (eBon aus REWE-, Lidl-Plus-App …)</summary>
      <textarea id="bon-text" rows="7" placeholder="Bon-Text hier einfügen …"></textarea>
      <button class="btn block" data-action="bon-text">Bon auswerten</button>
    </details>
  `);
}

const aiReady = () => {
  const conn = aiConn();
  return !!chefProvider(conn.apiKey, conn.server, conn.sample) && !conn.apiKey?.startsWith('sk-ant-');
};

async function handlePhotos(files) {
  const n = files.length;
  openSheet(`<h2 id="sheet-title">${n > 1 ? `${n} Fotos werden gelesen …` : 'Bon wird gelesen …'}</h2>
    <div class="progress"><div id="bar"></div></div><p id="progress-text" class="muted center">Einen Moment …</p>`);
  const step = (p, msg) => {
    $('#bar') && ($('#bar').style.width = `${Math.round(p * 100)}%`);
    $('#progress-text') && ($('#progress-text').textContent = msg);
  };
  // Mit KI (Gemini bzw. Claude in der Vorschau) – viel genauer. Klappt das nicht, liest das Gerät selbst.
  if (aiReady()) {
    $('#bar')?.classList.add('busy');
    step(0.4, 'KI liest jede Zeile und zählt nach …');
    try {
      const { readReceiptAI } = await import('./receiptai.js');
      return reviewReceipt(await readReceiptAI(files, aiConn()));
    } catch {
      toast('KI gerade nicht erreichbar – das Gerät liest den Bon selbst');
      $('#bar')?.classList.remove('busy');
    }
  }
  try {
    const { recognize } = await import('./ocr.js');
    reviewReceipt(fromText(await recognize(files, step)));
  } catch (e) {
    openSheet(`<h2 id="sheet-title">Das hat nicht geklappt</h2><p>${esc(e.message)}</p>
      <button class="btn primary block" data-action="scan">Nochmal scannen</button>
      <button class="btn block" data-action="add">Lieber eintippen</button>`);
  }
}

// Ergebnis der Texterkennung bzw. eines eingefügten eBons ins selbe Format wie das der KI bringen.
function fromText(text) {
  const r = parseReceipt(text);
  return { type: 'bon', store: r.store, date: r.date, total: r.total, count: r.count, text,
    items: [...r.items.map((x) => ({ ...x, kind: 'essen' })), ...r.others] };
}

function reviewReceipt(result) {
  const ai = !result.text;
  const today = iso();
  const bought = result.type === 'bon' && result.date && result.date <= today && result.date >= addDays(today, -30) ? result.date : today;
  const rows = result.items.map((x) => {
    const line = x.line ?? x.price * x.qty;
    if (x.kind !== 'essen') return { name: x.name, raw: x.raw, kind: x.kind, qty: x.qty, line, emoji: x.kind === 'pfand' ? '♻️' : '🧴' };
    // Kennt Restlos das Produkt nicht, nehmen wir die Haltbarkeit, die die KI geschätzt hat.
    const pid = x.pid ?? matchProduct(x.name)?.id;
    const expires = !pid && x.days ? addDays(bought, x.days) : undefined;
    const price = result.type === 'produkte' ? undefined : x.price;
    // Die KI liefert schon verständliche Namen („Gouda“) – nur kryptische Bon-Texte ersetzt Restlos durch den eigenen Produktnamen.
    const source = ai ? 'ki' : 'bon';
    const item = makeItem({ name: x.name, pid, qty: x.qty, price, bought, expires, source, raw: x.raw });
    return { ...item, kind: 'essen', line, given: item.name, checked: ai || !!x.known };
  });
  scan = { result, rows, bought };
  if (!rows.some((r) => r.kind === 'essen')) {
    return openSheet(`<h2 id="sheet-title">Keine Lebensmittel gefunden</h2>
      <p class="muted">${rows.length ? `Auf dem Bon stehen nur Sachen, die nicht in den Vorrat gehören (${rows.map((r) => esc(r.name)).join(', ')}).` : 'Der Bon war schwer zu lesen. Tipp: flach hinlegen, ohne Schatten, näher ran, Lampe an. Oder einfach eintippen.'}</p>
      <button class="btn primary block" data-action="scan">📷 Nochmal scannen</button>
      <button class="btn block" data-action="add">Eintippen</button>
      ${result.text ? `<details class="paste"><summary>Erkannter Text</summary><pre>${esc(result.text)}</pre></details>` : ''}`);
  }
  reviewSheet();
}

// Abgleich mit dem Bon: Summe aller Zeilen gegen den Endbetrag, Stückzahl gegen die gedruckte Artikelanzahl.
function scanCheck() {
  const { result, rows } = scan;
  if (result.type === 'produkte') return { html: '', more: false };
  const c = checkTotal({ total: result.total, count: result.count, items: rows });
  const more = shots.length < MAX_SHOTS && cameraSupported() ? '<button class="btn small" data-action="scan-more">📷 Weiteres Foto aufnehmen</button>' : '';
  const count = c.countOk === false ? ` Laut Bon ${result.count} Artikel, gezählt ${c.pieces} – die Stückzahl kannst du unten mit − und + anpassen.` : '';
  if (c.ok) return { html: `<div class="scan-check ok">✓ <b>Alles erfasst.</b> Die Summe ${euro(c.sum)} stimmt mit dem Bon überein.${count}</div>`, more: false };
  if (c.diff > 0) return { html: `<div class="scan-check warn"><b>Es fehlen ${euro(c.diff)}.</b> Auf dem Bon stehen ${euro(c.total)}, erkannt sind ${euro(c.sum)}. Vielleicht ist ein Stück vom Bon nicht auf dem Foto.${count} ${more}</div>`, more: !!more };
  if (c.diff < 0) return { html: `<div class="scan-check warn"><b>${euro(-c.diff)} zu viel erkannt.</b> Auf dem Bon stehen ${euro(c.total)}. Ist etwas doppelt drin? Dann einfach den Haken wegnehmen.${count}</div>`, more: false };
  return { html: `<div class="scan-check">Die Endsumme war nicht lesbar – kurz prüfen, ob alles da ist (erkannt: ${euro(c.sum)}).${count} ${more}</div>`, more: !!more };
}

function reviewSheet() {
  const { result, rows, bought } = scan;
  const food = rows.map((r, n) => [r, n]).filter(([r]) => r.kind === 'essen');
  const other = rows.filter((r) => r.kind !== 'essen');
  const picked = food.filter(([r]) => r.checked);
  const pieces = picked.reduce((s, [r]) => s + r.qty, 0);
  const products = result.type === 'produkte';
  const top = sheet.scrollTop;
  const check = scanCheck();
  openSheet(`
    <h2 id="sheet-title">${products ? `${food.length} ${food.length === 1 ? 'Produkt' : 'Produkte'} gezählt` : `${rows.length} Artikel erkannt`}</h2>
    <p class="muted small">${result.store ? `${esc(result.store)} · ` : ''}${dateLabel(bought)} · ${food.reduce((s, [r]) => s + r.qty, 0)} Stück Lebensmittel${products ? '' : ` · ${euro(rows.reduce((s, r) => s + r.line, 0))}`}</p>
    ${check.html}
    <h3 class="group">Kommt in den Vorrat</h3>
    <ul class="list compact checks scan-list">${food.map(([r, n]) => `<li class="item">
      <input type="checkbox" data-pick="${n}" aria-label="${esc(r.name)} übernehmen" ${r.checked ? 'checked' : ''}>
      <span class="emoji">${r.emoji}</span>
      <span class="item-text"><input class="name-edit" data-name="${n}" value="${esc(r.name)}" aria-label="Name"><small class="sub">bis ca. ${dateLabel(r.expires)}${r.raw && r.raw !== r.name ? ` · „${esc(r.raw)}“` : ''}</small></span>
      <span class="stepper"><button data-action="bon-qty" data-n="${n}" data-d="-1" aria-label="weniger" ${r.qty <= 1 ? 'disabled' : ''}>−</button><b aria-label="Anzahl">${r.qty}</b><button data-action="bon-qty" data-n="${n}" data-d="1" aria-label="mehr">+</button></span>
      ${products ? '' : `<span class="price">${euro(r.line)}</span>`}</li>`).join('')}</ul>
    ${other.length ? `<h3 class="group">Auch auf dem Bon</h3>
    <ul class="list compact scan-list other">${other.map((r) => `<li class="item"><span class="emoji">${r.emoji}</span>
      <span class="item-text"><b>${esc(r.name)}</b>${r.qty > 1 ? ` <small>× ${r.qty}</small>` : ''}<small class="sub">${r.kind === 'pfand' ? (r.raw && r.raw !== r.name ? `„${esc(r.raw)}“` : 'Pfand') : 'kein Lebensmittel – kommt nicht in den Vorrat'}</small></span>
      <span class="price">${euro(r.line)}</span></li>`).join('')}</ul>` : ''}
    <button class="btn primary block" data-action="bon-confirm" ${picked.length ? '' : 'disabled'}>${picked.length ? `${pieces} ${pieces === 1 ? 'Sache' : 'Sachen'} in den Vorrat` : 'Nichts ausgewählt'}</button>
    ${!check.more && shots.length && cameraSupported() && shots.length < MAX_SHOTS ? '<button class="btn block" data-action="scan-more">📷 Weiteres Foto vom selben Bon</button>' : ''}
    <button class="btn ghost block" data-action="add">Fehlendes eintippen</button>
    ${result.text ? `<details class="paste"><summary>Erkannten Text ansehen</summary><pre>${esc(result.text)}</pre></details>` : ''}
  `);
  sheet.scrollTop = top;
}

sheet.addEventListener('change', (e) => {
  const n = e.target.dataset.pick;
  if (n === undefined || !scan) return;
  scan.rows[n].checked = e.target.checked;
  reviewSheet();
});
sheet.addEventListener('input', (e) => {
  const n = e.target.dataset.name;
  if (n !== undefined && scan) scan.rows[n].name = e.target.value;
});

function confirmScan() {
  const { rows, bought } = scan;
  const picked = rows.filter((r) => r.kind === 'essen' && r.checked && r.name.trim());
  const added = store.add(picked.map((r) => {
    const name = r.name.trim();
    const price = scan.result.type === 'produkte' ? r.price : Math.round((r.line / r.qty) * 100) / 100;
    // Selbst umbenannt: Produkt neu zuordnen, der eigene Name bleibt.
    if (name !== r.given) return { name, qty: r.qty, price, bought, raw: r.raw, source: 'hand' };
    return { name, pid: r.pid, qty: r.qty, price, bought, expires: r.expires, raw: r.raw, source: r.source };
  }));
  scan = null;
  shots = [];
  closeSheet();
  location.hash = '#/vorrat';
  toast(`${added.length} ${added.length === 1 ? 'Sache' : 'Sachen'} im Vorrat`, () => added.forEach((i) => store.consume(i.id, 'removed')));
}

// ---------- Rezepte ----------
let lastSuggestions = [];
function renderRezepte() {
  const items = store.items();
  const veg = store.state.settings.veg;
  lastSuggestions = suggest(items.filter((i) => !i.offered), { vegOnly: veg, limit: 10 });
  view.innerHTML = `
    <section class="hero"><h1>Reste-Rezepte</h1><p>Sortiert nach dem, was zuerst weg muss.</p></section>
    <a class="card chef-entry" href="#/koch"><span class="emoji xl">👨‍🍳</span>
      <span><b>KI-Koch fragen</b><small>Schreib, was du hast – ein Profikoch macht daraus ein Rezept, das auch Anfängern gelingt.</small></span></a>
    ${chefIdeasHtml(items)}
    <div class="chips"><button class="chip ${veg ? 'on' : ''}" data-action="veg">🥦 Nur vegetarisch</button></div>
    ${lastSuggestions.length ? `<div class="grid">${lastSuggestions.map((r, n) => `
      <button class="card recipe" data-action="recipe" data-n="${n}">
        <span class="emoji xl">${r.emoji}</span>
        <span class="recipe-text"><b>${esc(r.title)}</b>
          <small>${r.time} Min. · nutzt ${r.uses.length} ${r.uses.length === 1 ? 'Sache' : 'Sachen'} aus dem Vorrat</small>
          ${r.urgent.length ? `<small class="save">🌱 rettet ${r.urgent.map((i) => esc(i.name)).join(', ')}</small>` : ''}
          ${r.missing.length ? `<small class="miss">fehlt: ${r.missing.map(esc).join(', ')}</small>` : ''}</span>
      </button>`).join('')}</div>` : `
      <section class="empty"><div class="big">🍳</div><p>Sobald etwas im Vorrat ist, schlägt Restlos hier Gerichte vor – zuerst die, die Ablaufendes aufbrauchen.</p>
      <button class="btn primary" data-action="scan">📷 Kassenbon scannen</button></section>`}
  `;
}

function recipeSheet(n) {
  const r = lastSuggestions[n];
  if (!r) return;
  openSheet(`
    <div class="sheet-head"><span class="emoji xl">${r.emoji}</span><div><h2 id="sheet-title">${esc(r.title)}</h2><p class="muted">${r.time} Minuten${r.veg ? ' · vegetarisch' : ''}</p></div></div>
    <h3>Aus deinem Vorrat</h3>
    <ul class="list compact checks">${r.uses.map((i) => `<li class="item"><label><input type="checkbox" data-use="${i.id}" checked>
      <span class="emoji">${i.emoji}</span><span class="item-text"><b>${esc(i.name)}</b></span>${badge(i)}</label></li>`).join('')}</ul>
    ${r.missing.length ? `<p>Fehlt noch: <b>${r.missing.map(esc).join(', ')}</b> <button class="link" data-action="to-list" data-names="${esc(r.missing.join('|'))}">→ auf die Einkaufsliste</button></p>` : ''}
    <p class="muted small">Dazu aus dem Schrank: Salz, Pfeffer, Öl, ggf. Mehl, Zucker, Gewürze.</p>
    <h3>So geht's</h3>
    <ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <button class="btn primary block" data-action="cooked">Gekocht! Zutaten austragen</button>
  `);
}

// ---------- Neue Ideen vom Koch ----------
// Der Koch schaut selbst in den Vorrat und schlägt drei Gerichte vor. Neu gefragt wird nur, wenn sich geändert hat,
// was bald weg muss (höchstens alle 30 Minuten von allein) – so bleibt das kostenlose Tageslimit unberührt.
const IDEAS_KEY = 'restlos:ideen';
const chefIdeas = (() => {
  try { return { busy: false, error: '', ...JSON.parse(localStorage.getItem(IDEAS_KEY)) }; } catch { return { busy: false, error: '' }; }
})();
const aiChefReady = () => { const c = aiConn(); return !!chefProvider(c.apiKey, c.server, c.sample); };

function chefIdeasHtml(items) {
  const pantry = items.filter((i) => !i.offered);
  if (!pantry.length || !aiChefReady()) return '';
  const key = pantryKey(pantry);
  if (!chefIdeas.busy && chefIdeas.key !== key && (!chefIdeas.list?.length || Date.now() - (chefIdeas.at || 0) > 30 * 60e3)) {
    setTimeout(() => loadIdeas(), 0);
    chefIdeas.busy = true;
  }
  const list = chefIdeas.list || [];
  const cards = chefIdeas.busy
    ? [0, 1, 2].map((k) => `<div class="card idea skeleton" style="--k:${k}"><span></span><span></span><span></span></div>`).join('')
    : list.map((x, n) => `<button class="card idea" data-action="idea-cook" data-n="${n}" style="--k:${n}">
        <b>${esc(x.name)}</b>
        ${x.saves.length ? `<small class="save">🌱 rettet ${x.saves.map(esc).join(', ')}</small>` : ''}
        ${x.why ? `<small>${esc(x.why)}</small>` : ''}
        <small class="idea-meta">${x.minutes ? `⏱ ${x.minutes} Min. · ` : ''}Rezept ansehen →</small>
      </button>`).join('');
  return `<section class="ideas" aria-live="polite">
    <div class="ideas-head"><h3 class="group">👨‍🍳 Neu vom Koch</h3>
      ${chefIdeas.busy ? '' : `<button class="link small" data-action="ideas-more">${list.length ? 'Andere Ideen' : 'Ideen holen'}</button>`}</div>
    ${chefIdeas.error ? `<p class="muted small">${esc(chefIdeas.error)}</p>` : ''}
    ${cards ? `<div class="idea-grid">${cards}</div>` : ''}
  </section>`;
}

async function loadIdeas(avoid = []) {
  const pantry = store.items().filter((i) => !i.offered);
  if (!pantry.length) return;
  Object.assign(chefIdeas, { busy: true, error: '' });
  if (current() === 'rezepte') render();
  const key = pantryKey(pantry);
  try {
    const { text } = await askChef({
      ...aiConn(),
      messages: [{ role: 'user', content: ideasMessage({ pantry: pantryForChef(pantry), veg: store.state.settings.veg, avoid }) }],
    });
    const list = parseIdeas(text);
    if (!list.length) throw new Error('Der Koch hatte gerade keine Idee. Tipp auf „Ideen holen“.');
    Object.assign(chefIdeas, { list, key, at: Date.now() });
    try { localStorage.setItem(IDEAS_KEY, JSON.stringify({ list, key, at: chefIdeas.at })); } catch { /* egal */ }
  } catch (e) {
    // Fehler merken, damit nicht bei jedem Öffnen neu gefragt wird – „Ideen holen“ versucht es wieder.
    Object.assign(chefIdeas, { error: e.message, key, at: Date.now() });
  } finally {
    chefIdeas.busy = false;
    if (current() === 'rezepte') render();
  }
}

// Ein Gericht aus den Ideen oder eine Sache retten: frisches Gespräch mit dem Koch, Vorrat dabei.
function chefWith(text, show) {
  chat.ctrl?.abort();
  Object.assign(chat, { messages: [], error: '', draft: '' });
  const items = store.items().filter((i) => !i.offered);
  const content = firstMessage({ text, pantry: pantryForChef(items), persons: chat.persons, minutes: chat.minutes, veg: store.state.settings.veg });
  closeSheet();
  location.hash = '#/koch';
  chefSend(content, show);
}

// ---------- KI-Koch ----------
// Das Gespräch lebt nur im Speicher: messages geht an Claude, show ist die kurze Fassung für die Anzeige.
const chat = { messages: [], live: '', busy: false, error: '', draft: '', pantry: true, persons: 2, minutes: 30, ctrl: null };
// In der Vorschau auf claude.ai kocht Claude über das Konto des Betrachters (dort ist das Netz gesperrt).
let previewChef = null;
// Eigener Schlüssel geht vor, sonst der Schlüssel der App (config.js), sonst Koch-Server bzw. Vorschau.
const aiConn = () => ({ apiKey: store.state.settings.aiKey || CONFIG.appKey, server: CONFIG.chefServer, sample: previewChef });
globalThis.claude?.use?.('sample').then((sm) => { previewChef = sm; if (sm && current() === 'koch') render(); }).catch(() => {});
const lastAnswer = () => [...chat.messages].reverse().find((m) => m.role === 'assistant')?.content || '';

function renderKoch() {
  const { apiKey, server, sample } = aiConn();
  const ready = !!chefProvider(apiKey, server, sample);
  view.innerHTML = `
    <section class="hero"><h1>👨‍🍳 Dein KI-Koch</h1><p>Schreib, was du hast – der Koch macht das Beste daraus. Auch wenn du noch nie gekocht hast.</p></section>
    ${previewChef ? '<p class="hint">Vorschau: Hier kocht Claude über dein Claude-Konto. In der echten App kocht Gemini mit deinem Schlüssel.</p>' : ''}
    ${ready ? '' : `
    <section class="card">
      <b>Einmal einrichten: kostenloser Schlüssel</b>
      <p class="small muted">Der Koch nutzt Gemini von Google – kostenlos. Auf <b>aistudio.google.com</b> mit dem Google-Konto anmelden → „Get API key“ → „Create API key“ und hier einfügen. Der Schlüssel bleibt nur auf diesem Gerät.</p>
      <form class="input-row" data-form="ai-key"><input id="ai-key" type="password" autocomplete="off" placeholder="AIza…" aria-label="API-Schlüssel"><button class="btn primary">Speichern</button></form>
    </section>`}
    ${chat.messages.length ? chefConversation() : chefForm(ready)}
    <p class="muted small center">Lieber ohne KI? <a href="#/rezepte">Fertige Reste-Rezepte</a></p>
  `;
}

function chefForm(ready) {
  const items = store.items().filter((i) => !i.offered);
  const urgent = items.filter((i) => daysLeft(i) <= 3).length;
  const veg = store.state.settings.veg;
  const seg = (action, list, value, label) => list.map(([v, text]) => `<button class="chip ${value === v ? 'on' : ''}" data-action="${action}" data-v="${v}" aria-label="${label} ${text}" aria-pressed="${value === v}">${text}</button>`).join('');
  return `
    <section class="card">
      <label class="field" for="chef-text">Was hast du da, worauf hast du Lust?</label>
      <div class="input-row start">
        <textarea id="chef-text" rows="3" placeholder="z. B. 2 Zucchini, halbe Packung Feta, Reis von gestern – gern was Warmes">${esc(chat.draft)}</textarea>
        <button class="icon-btn mic" data-action="chef-listen" aria-label="Sprechen">🎤</button>
      </div>
      <div class="chips wrap">
        ${items.length ? `<button class="chip ${chat.pantry ? 'on' : ''}" data-action="chef-pantry">📦 Vorrat nutzen <small>${items.length}${urgent ? `, ${urgent} bald weg` : ''}</small></button>` : ''}
        <button class="chip ${veg ? 'on' : ''}" data-action="veg">🥦 Vegetarisch</button>
      </div>
      <div class="chips wrap">${seg('chef-persons', [[1, '1 Person'], [2, '2 Personen'], [4, '4 Personen']], chat.persons, 'Für')}</div>
      <div class="chips wrap">${seg('chef-minutes', [[15, '15 Min.'], [30, '30 Min.'], [60, '1 Std.'], [0, '⏱ egal']], chat.minutes, 'Zeit:')}</div>
      <button class="btn primary block" data-action="chef-go" ${ready ? '' : 'disabled'}>👨‍🍳 Koch, leg los!</button>
    </section>`;
}

function chefConversation() {
  const last = chat.messages.at(-1);
  const answer = lastAnswer();
  const done = !chat.busy && last?.role === 'assistant';
  const used = done ? usedItems(answer, store.items()) : [];
  return `
    ${chat.messages.map((m) => (m.role === 'user'
      ? `<p class="bubble">${esc(m.show || m.content)}</p>`
      : `<article class="card chef-answer">${renderMarkdown(m.content)}</article>`)).join('')}
    ${chat.busy ? `<article class="card chef-answer" id="chef-live" aria-live="polite">${chat.live ? renderMarkdown(chat.live) : '<p class="thinking">Der Koch überlegt<span class="dots"></span></p>'}</article>
      <button class="btn block" data-action="chef-stop">Stopp</button>` : ''}
    ${chat.error ? `<p class="hint danger">${esc(chat.error)}</p>${last?.role === 'user' ? '<button class="btn primary block" data-action="chef-retry">Nochmal versuchen</button>' : ''}` : ''}
    ${done ? `
      ${used.length ? '<button class="btn primary block" data-action="chef-cooked">✓ Gekocht! Zutaten austragen</button>' : ''}
      ${ideas(answer).length ? `<div class="chips wrap idea-chips">${ideas(answer).map((x) => `<button class="chip" data-action="chef-idea" data-idea="${esc(x)}">Lieber: ${esc(x)}</button>`).join('')}</div>` : ''}` : ''}
    ${chat.busy ? '' : `
      <form class="input-row" data-form="chef">
        <input id="chef-ask" type="text" autocomplete="off" enterkeyhint="send" placeholder="Frag nach: „ohne Ofen?“, „was statt Sahne?“" aria-label="Frage an den Koch">
        <button class="icon-btn" aria-label="Senden">➤</button>
      </form>
      <button class="link center-link" data-action="chef-reset">Neu anfangen</button>
      ${done ? `<p class="muted small center">Schmeckt's? Restlos und der Koch sind kostenlos – aus Überzeugung. ${supportUrl ? supportLink('Restlos unterstützen') : '<a class="link" href="#/bilanz?mission=1">Warum?</a>'} 💚</p>` : ''}`}`;
}

async function chefSend(content, show) {
  const conn = aiConn();
  if (!chefProvider(conn.apiKey, conn.server, conn.sample)) return toast('Erst den Schlüssel eintragen');
  if (chat.busy) return;
  if (content) chat.messages.push({ role: 'user', content, show });
  Object.assign(chat, { busy: true, live: '', error: '', ctrl: new AbortController() });
  render();
  $('#chef-live')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  try {
    const { text, stop } = await askChef({
      ...conn,
      messages: chat.messages.map(({ role, content: c }) => ({ role, content: c })),
      signal: chat.ctrl.signal,
      onText: (t) => { chat.live = t; const el = $('#chef-live'); if (el) el.innerHTML = renderMarkdown(t); },
    });
    chat.messages.push({ role: 'assistant', content: stop === 'max_tokens' ? `${text}\n\n_(Die Antwort war zu lang und wurde abgeschnitten.)_` : text });
  } catch (e) {
    // Bei „Stopp“ bleibt das schon Geschriebene stehen.
    if (chat.ctrl?.signal.aborted && chat.live) chat.messages.push({ role: 'assistant', content: chat.live });
    else chat.error = e.message;
  } finally {
    Object.assign(chat, { busy: false, live: '', ctrl: null });
    if (current() === 'koch') render();
  }
}

function chefStart() {
  const text = $('#chef-text')?.value ?? chat.draft;
  chat.draft = text;
  const items = store.items().filter((i) => !i.offered);
  const usePantry = chat.pantry && items.length > 0;
  if (!text.trim() && !usePantry) return toast('Schreib kurz, was du da hast');
  const veg = store.state.settings.veg;
  const content = firstMessage({ text, pantry: usePantry ? pantryForChef(items) : '', persons: chat.persons, minutes: chat.minutes, veg });
  const show = [text.trim(), usePantry && '📦 mein Vorrat', `${chat.persons} ${chat.persons === 1 ? 'Person' : 'Personen'}`, chat.minutes ? `${chat.minutes} Min.` : 'Zeit egal', veg && 'vegetarisch'].filter(Boolean).join(' · ');
  chefSend(content, show);
}

function chefCookedSheet() {
  const used = usedItems(lastAnswer(), store.items());
  openSheet(`
    <h2 id="sheet-title">Guten Appetit! 👨‍🍳</h2>
    <p class="muted small">Was hast du aus dem Vorrat verbraucht? Haken weg bei allem, was noch da ist.</p>
    <ul class="list compact checks">${used.map((i) => `<li class="item"><label><input type="checkbox" data-use="${i.id}" checked>
      <span class="emoji">${i.emoji}</span><span class="item-text"><b>${esc(i.name)}</b>${i.qty > 1 ? ` <small>× ${i.qty}, 1 wird ausgetragen</small>` : ''}</span>${badge(i)}</label></li>`).join('')}</ul>
    <button class="btn primary block" data-action="cooked">Austragen</button>
  `);
}

// ---------- Einkauf ----------
const SHOP_BASICS = ['milch', 'eier', 'brot', 'butter', 'kaese', 'joghurt', 'bananen', 'aepfel', 'tomaten', 'gurke', 'nudeln', 'reis', 'kartoffeln', 'zwiebeln'];
function renderEinkauf() {
  const list = store.state.shopping;
  const items = store.items();
  const inStock = (name) => {
    const p = matchProduct(name);
    return items.filter((i) => (p ? i.pid === p.id : i.name.toLowerCase() === name.toLowerCase()));
  };
  const done = list.filter((s) => s.done).length;
  // Vorschläge: was zuletzt aufgebraucht wurde und gerade fehlt, dazu Grundnahrungsmittel.
  const onList = (n) => list.some((s) => !s.done && s.name.toLowerCase() === n.toLowerCase());
  const restock = [...new Set([...store.state.log].reverse().filter((e) => e.action === 'used').map((e) => e.name))]
    .filter((n) => !inStock(n).length && !onList(n)).slice(0, 8);
  const basics = SHOP_BASICS.map((id) => byId[id]).filter((p) => p && !onList(p.name) && !restock.includes(p.name) && !inStock(p.name).length).slice(0, 10);
  view.innerHTML = `
    <section class="hero"><h1>Einkaufsliste</h1><p>Restlos warnt, wenn du etwas schon zu Hause hast.</p></section>
    <form class="input-row" data-form="shop">
      <input id="shop-text" type="text" autocomplete="off" enterkeyhint="send" placeholder="Was brauchst du?" aria-label="Neuer Eintrag">
      <button class="icon-btn" aria-label="Hinzufügen">＋</button>
    </form>
    <p id="shop-warn" class="hint" hidden></p>
    ${list.length ? `<ul class="list">${list.map((s) => {
      const have = inStock(s.name);
      return `<li class="item ${s.done ? 'checked' : ''}">
        <label class="item-main"><input type="checkbox" data-action="shop-toggle" data-id="${s.id}" ${s.done ? 'checked' : ''}>
          <span class="item-text"><b>${esc(s.name)}</b>${s.qty > 1 ? ` <small>× ${s.qty}</small>` : ''}
          ${have.length && !s.done ? `<small class="sub warn">Noch da: ${have.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ''}${esc(i.name)} (${status(i).label})`).join(', ')}</small>` : ''}</span></label>
        <button class="done-btn ghost" data-action="shop-remove" data-id="${s.id}" aria-label="Entfernen">✕</button>
      </li>`;
    }).join('')}</ul>
    ${done ? `<button class="btn primary block" data-action="shop-to-pantry">${done} abgehakte Sachen in den Vorrat</button>` : ''}`
    : `<section class="empty small-empty"><div class="big">🛒</div><p>Noch nichts auf der Liste. Schreib oben, was du brauchst – oder tipp unten an.</p></section>`}
    ${restock.length ? `<h3 class="group">Nachkaufen? Zuletzt aufgebraucht</h3>
      <div class="chips wrap">${restock.map((n) => `<button class="chip" data-action="shop-quick" data-name="${esc(n)}">＋ ${esc(n)}</button>`).join('')}</div>` : ''}
    <h3 class="group">Oft gebraucht</h3>
    <div class="chips wrap">${basics.map((p) => `<button class="chip" data-action="shop-quick" data-name="${esc(p.name)}">${p.emoji} ${esc(p.name)}</button>`).join('')}</div>
  `;
  const input = $('#shop-text');
  input.addEventListener('input', () => {
    const have = input.value.trim().length > 2 ? inStock(input.value.trim()) : [];
    const warn = $('#shop-warn');
    warn.hidden = !have.length;
    warn.innerHTML = have.length ? `🤔 Hast du noch: ${have.map((i) => `<b>${i.qty > 1 ? `${i.qty}× ` : ''}${esc(i.name)}</b> (${status(i).label})`).join(', ')}` : '';
  });
}

// ---------- Teilen ----------
function renderTeilen() {
  const items = store.items();
  const offered = items.filter((i) => i.offered);
  // Rohes Fleisch, Geflügel und Fisch (Verbrauchsdatum) gibt man nicht weiter – wie bei foodsharing.
  const candidates = items.filter((i) => !i.offered && daysLeft(i) >= 0 && !(i.pid && byId[i.pid]?.vd));
  const flat = store.state.settings.flat;
  view.innerHTML = `
    <section class="hero"><h1>Im Hausflur teilen</h1><p>Was du nicht mehr schaffst, freut die Nachbarn. Teile es in der Haus-Gruppe oder häng einen Aushang auf.</p></section>
    <label class="field">Abholen bei (Name an der Klingel, Etage)
      <input type="text" value="${esc(flat)}" data-setting="flat" placeholder="z. B. Müller, 3. OG links"></label>
    ${offered.length ? `<h3 class="group">Angeboten</h3><ul class="list">${offered.map((i) => `<li class="item">
      <span class="item-main static"><span class="emoji">${i.emoji}</span><span class="item-text"><b>${esc(i.name)}</b>${i.qty > 1 ? ` <small>× ${i.qty}</small>` : ''}<small class="sub">gut bis ${dateLabel(i.expires)}</small></span></span>
      <button class="btn small primary" data-action="consume" data-id="${i.id}" data-how="shared">Abgeholt</button></li>`).join('')}</ul>
      <div class="row-btns"><button class="btn" data-action="share-offered">📲 Nochmal teilen</button><button class="btn" data-action="poster">🖨 Aushang drucken</button></div>` : ''}
    <h3 class="group">Was möchtest du anbieten?</h3>
    ${candidates.length ? `<ul class="list compact checks">${candidates.map((i) => `<li class="item"><label>
      <input type="checkbox" data-offer="${i.id}" ${daysLeft(i) <= 3 ? 'checked' : ''}>
      <span class="emoji">${i.emoji}</span><span class="item-text"><b>${esc(i.name)}</b>${i.qty > 1 ? ` <small>× ${i.qty}</small>` : ''}</span>${badge(i)}</label></li>`).join('')}</ul>
      <div class="row-btns"><button class="btn primary" data-action="share">📲 In Haus-Gruppe teilen</button><button class="btn" data-action="poster-new">🖨 Aushang</button></div>
      <p class="muted small">Fleisch, Fisch und Geflügel nach Verbrauchsdatum bitte nicht weitergeben. Angebrochenes nur, wenn du es selbst noch essen würdest.</p>`
    : '<p class="muted center">Gerade nichts zum Verschenken.</p>'}
  `;
}

const selectedOffers = () => [...view.querySelectorAll('[data-offer]:checked')].map((c) => store.find(c.dataset.offer)).filter(Boolean);

// ---------- Bilanz & Einstellungen ----------
function renderBilanz() {
  const s = stats(store.state.log);
  const all = stats(store.state.log, iso(), 3650);
  const rate = s.rate ?? 0;
  const notif = 'Notification' in window ? Notification.permission : 'unsupported';
  view.innerHTML = `
    <section class="hero"><h1>Deine Bilanz</h1><p>Letzte 30 Tage</p></section>
    ${s.rate === null ? '<p class="muted center">Sobald du Sachen als aufgebraucht, verschenkt oder weggeworfen markierst, siehst du hier, wie viel du rettest.</p>' : `
    <section class="card stat-hero">
      <div class="ring" style="--p:${rate}"><span>${rate}%</span></div>
      <div><b>gerettet statt weggeworfen</b><p class="muted small">${s.saved} gegessen oder verschenkt, ${s.wasted} im Müll</p></div>
    </section>
    <div class="stats">
      <div class="card stat"><b>${euro(s.wastedEuro)}</b><small>im Müll gelandet</small></div>
      <div class="card stat"><b>${kg(s.wastedCo2)}</b><small>CO₂ dadurch verschwendet</small></div>
      <div class="card stat"><b>${s.shared}</b><small>an Nachbarn verschenkt</small></div>
      <div class="card stat"><b>${kg(all.savedCo2)}</b><small>CO₂ insgesamt gerettet</small></div>
    </div>
    ${s.topWasted.length ? `<section class="card tip">💡 Am häufigsten weggeworfen: <b>${s.topWasted.map(([n, c]) => `${esc(n)} (${c}×)`).join(', ')}</b>. Kleinere Packungen kaufen oder direkt nach dem Einkauf einen Teil einfrieren?</section>` : ''}`}
    ${missionCard(s.rate === null ? null : s)}
    ${installed() ? '' : `
    <h3 class="group">App</h3>
    <div class="card settings">
      <button class="set" data-action="install"><span>📲</span><span><b>Restlos installieren</b><small>Auf Handy oder Computer – startet dann wie eine normale App, auch offline</small></span></button>
    </div>`}
    <h3 class="group">Erinnerungen</h3>
    <div class="card settings">
      <button class="set" data-action="calendar"><span>📅</span><span><b>In den Kalender eintragen</b><small>Erinnerung am Vorabend für alles, was in den nächsten 3 Wochen abläuft</small></span></button>
      ${notif !== 'unsupported' ? `<button class="set" data-action="notify"><span>🔔</span><span><b>${remindOn() ? 'Erinnerungen sind an' : 'Erinnerungen einschalten'}</b><small>${remindOn() ? 'Höchstens eine am Tag, 2 Tage bevor etwas abläuft · antippen zum Ausschalten' : notif === 'denied' ? 'Mitteilungen sind im Browser gesperrt – dort erlauben' : 'Höchstens eine Mitteilung am Tag, 2 Tage bevor etwas abläuft'}</small></span></button>` : ''}
    </div>
    <h3 class="group">KI-Koch</h3>
    <div class="card settings">
      ${store.state.settings.aiKey
    ? `<button class="set" data-action="chef-key-remove"><span>🔑</span><span><b>API-Schlüssel entfernen</b><small>Gespeichert: …${esc(store.state.settings.aiKey.slice(-4))} · nur auf diesem Gerät, nicht in der Sicherung</small></span></button>`
    : CONFIG.chefServer || CONFIG.appKey ? '<a class="set" href="#/koch"><span>👨‍🍳</span><span><b>KI-Koch ist an</b><small>Kostenlos, ohne Einrichtung – Koch und Bon-Erkennung</small></span></a>'
      : '<a class="set" href="#/koch"><span>🔑</span><span><b>KI-Koch einrichten</b><small>Kostenlosen Gemini-Schlüssel eintragen</small></span></a>'}
    </div>
    <h3 class="group">Daten</h3>
    <div class="card settings">
      <button class="set" data-action="export"><span>💾</span><span><b>Sicherung speichern</b><small>Alles bleibt auf diesem Gerät – hier als Datei sichern</small></span></button>
      <button class="set" data-action="import"><span>📂</span><span><b>Sicherung laden</b><small>z. B. auf einem neuen Handy</small></span></button>
      <button class="set" data-action="demo"><span>🧪</span><span><b>Beispiel-Vorrat laden</b><small>Zum Ausprobieren</small></span></button>
      <button class="set danger" data-action="reset"><span>🗑</span><span><b>Alles löschen</b></span></button>
    </div>
    <p class="muted small center">Restlos · kostenlos und werbefrei · Haltbarkeiten und CO₂-Werte sind Schätzungen.</p>
  `;
}

// ---------- Installieren ----------
// Android und Chrome/Edge am Computer bieten einen eigenen Dialog an; iPhone und Safari nur über das Teilen-Menü.
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('Restlos ist installiert 🎉'); render(); });
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

async function install() {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    return;
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  openSheet(`
    <h2 id="sheet-title">Restlos installieren</h2>
    ${ios ? `<ol class="steps">
      <li>Diese Seite in <b>Safari</b> öffnen.</li>
      <li>Unten auf <b>Teilen</b> tippen (Quadrat mit Pfeil nach oben).</li>
      <li><b>„Zum Home-Bildschirm“</b> wählen und <b>Hinzufügen</b> tippen.</li></ol>`
    : `<h3>Android</h3><ol class="steps"><li>In <b>Chrome</b> oben rechts auf <b>⋮</b> tippen.</li><li><b>„App installieren“</b> oder „Zum Startbildschirm hinzufügen“ wählen.</li></ol>
      <h3>Computer</h3><ol class="steps"><li>In <b>Chrome</b> oder <b>Edge</b> rechts in der Adressleiste auf das Installieren-Symbol (Bildschirm mit Pfeil) klicken.</li><li>Oder im Menü <b>⋮ → „Restlos installieren“</b>. Am Mac in Safari: <b>Ablage → „Zum Dock hinzufügen“</b>.</li></ol>`}
    <p class="muted small">Danach startet Restlos wie eine normale App, auch ohne Internet. Deine Daten bleiben auf dem Gerät.</p>
  `);
}

// ---------- Beispiel-Vorrat ----------
function loadDemo() {
  const t = iso();
  const demo = [['Joghurt', 1, 0], ['Milch', 1, 2], ['Brot', 1, 1], ['Bananen', 4, 1], ['Zucchini', 2, 3], ['Paprika', 2, 4], ['Eier', 6, 12],
    ['Gouda', 1, 9], ['Hackfleisch', 1, 1], ['Spinat', 1, 0], ['Nudeln', 2, 300], ['Kartoffeln', 1, 20], ['Zwiebeln', 1, 25], ['Äpfel', 6, 14], ['Tomaten', 4, 2], ['Kidney Bohnen', 1, 400]];
  store.add(demo.map(([name, qty, d]) => ({ name, qty, expires: addDays(t, d), bought: addDays(t, -2) })), 'demo');
  const log = [['Salat', 'gemuese', 'wasted', 1.29, 3], ['Joghurt', 'milch', 'used', 0.89, 5], ['Brot', 'brot', 'used', 2.49, 6], ['Bananen', 'obst', 'shared', 1.49, 8], ['Milch', 'milch', 'used', 1.19, 9], ['Salat', 'gemuese', 'wasted', 1.29, 12], ['Käse', 'kaese', 'used', 2.29, 15]];
  for (const [name, cat, action, price, ago] of log) store.state.log.push({ id: `d${ago}`, name, pid: matchProduct(name)?.id, cat, qty: 1, price, action, date: addDays(t, -ago) });
  store.setting('demo', true);
  toast('Beispiel-Vorrat geladen');
}

// ---------- Aktionen ----------
const actions = {
  add: (el) => addSheet(!!el.dataset.voice),
  scan: () => startScan(),
  demo: () => { closeSheet(); loadDemo(); location.hash = '#/vorrat'; },
  close: closeSheet,
  undo: () => { toast.undo?.(); toast.undo = null; $('#toast').classList.remove('show'); },
  place: (el) => { placeFilter = el.dataset.place; render(); },
  item: (el) => itemSheet(el.dataset.id),
  used: (el) => consume(el.dataset.id, 'used'),
  consume: (el) => { closeSheet(); consume(el.dataset.id, el.dataset.how, el.dataset.qty ? +el.dataset.qty : undefined); },
  open: (el) => { const i = store.find(el.dataset.id); store.update(i.id, openItem(i)); itemSheet(i.id); },
  freeze: (el) => {
    const i = store.find(el.dataset.id);
    store.update(i.id, { place: 'tk', expires: addDays(iso(), i.cat === 'fleisch' ? 90 : 60) });
    closeSheet();
    toast(`${i.name} eingefroren – hält jetzt bis ${dateLabel(store.find(i.id).expires)}`);
  },
  offer: (el) => {
    const i = store.find(el.dataset.id);
    store.update(i.id, { offered: i.offered ? null : iso() });
    closeSheet();
    if (!i.offered) location.hash = '#/teilen';
  },
  // Hinzufügen
  listen: () => listen(),
  'quick-add': (el) => {
    const input = $('#add-text');
    input.value = input.value.trim() ? `${input.value.replace(/,\s*$/, '')}, ${el.dataset.name}` : el.dataset.name;
    updateAddPreview();
  },
  complete: (el) => {
    const input = $('#add-text');
    const parts = input.value.split(',');
    const last = parts.pop();
    const num = last.trim().match(/^\d+\s*/)?.[0] || '';
    parts.push(`${parts.length ? ' ' : ''}${num}${el.dataset.name}`);
    input.value = `${parts.join(',')}, `;
    input.focus();
    updateAddPreview();
  },
  'add-confirm': () => {
    const items = parseFreeText($('#add-text').value);
    if (!items.length) return;
    const added = store.add(items, 'hand');
    closeSheet();
    toast(added.length === 1 ? `${added[0].name} hinzugefügt` : `${added.length} Sachen hinzugefügt`, () => added.forEach((i) => store.consume(i.id, 'removed')));
  },
  // Kassenbon
  photo: () => $('#photo').click(),
  'scan-more': () => startScan(true),
  'bon-text': () => { shots = []; reviewReceipt(fromText($('#bon-text').value)); },
  'bon-qty': (el) => {
    const r = scan.rows[el.dataset.n];
    r.qty = Math.max(1, Math.min(99, r.qty + +el.dataset.d));
    reviewSheet();
  },
  'bon-confirm': confirmScan,
  // Rezepte
  veg: () => { store.setting('veg', !store.state.settings.veg); },
  recipe: (el) => recipeSheet(+el.dataset.n),
  'to-list': (el) => { el.dataset.names.split('|').forEach((n) => store.addShopping(n)); toast('Auf der Einkaufsliste'); el.remove(); },
  cooked: () => {
    const ids = [...sheet.querySelectorAll('[data-use]:checked')].map((c) => c.dataset.use);
    const undos = ids.map((id) => store.consume(id, 'used', 1)).filter(Boolean);
    closeSheet();
    toast(`Guten Appetit! ${ids.length} ${ids.length === 1 ? 'Sache' : 'Sachen'} gerettet 🌱`, () => undos.reverse().forEach((u) => u()));
  },
  install,
  'milestone-ok': (el) => store.setting('milestone', +el.dataset.m),
  mission: (el) => { store.setting('milestone', Math.max(store.state.settings.milestone || 0, +el.dataset.m)); location.hash = '#/bilanz?mission=1'; },
  // Retten & neue Ideen
  rescue: () => rescueSheet(),
  'rescue-chef': (el) => { const i = store.find(el.dataset.id); if (i) chefWith(rescueText(i), `🌱 ${i.name} retten`); },
  'close-go': (el) => { closeSheet(); location.hash = el.getAttribute('href'); },
  'ideas-more': () => loadIdeas((chefIdeas.list || []).map((x) => x.name)),
  'idea-cook': (el) => {
    const x = chefIdeas.list?.[+el.dataset.n];
    if (x) chefWith(`Ich möchte „${x.name}“ kochen${x.saves.length ? ` – damit ${x.saves.join(', ')} weg${x.saves.length === 1 ? 'kommt' : 'kommen'}` : ''}.`, `💡 ${x.name}`);
  },
  // KI-Koch
  'chef-go': chefStart,
  'chef-retry': () => chefSend(),
  'chef-stop': () => chat.ctrl?.abort(),
  'chef-reset': () => { chat.ctrl?.abort(); Object.assign(chat, { messages: [], error: '' }); render(); window.scrollTo(0, 0); },
  'chef-idea': (el) => chefSend(`Mach mir lieber „${el.dataset.idea}“ – bitte als vollständiges Rezept.`, `Lieber: ${el.dataset.idea}`),
  'chef-cooked': chefCookedSheet,
  'chef-pantry': () => { chat.pantry = !chat.pantry; render(); },
  'chef-persons': (el) => { chat.persons = +el.dataset.v; render(); },
  'chef-minutes': (el) => { chat.minutes = +el.dataset.v; render(); },
  'chef-listen': (el) => listen($('#chef-text'), () => { chat.draft = $('#chef-text').value; }, el),
  'chef-key-remove': () => { if (confirm('API-Schlüssel von diesem Gerät entfernen?')) { store.setting('aiKey', ''); toast('Schlüssel entfernt'); } },
  // Einkauf
  'shop-toggle': (el) => store.toggleShopping(el.dataset.id),
  'shop-remove': (el) => store.removeShopping(el.dataset.id),
  'shop-quick': (el) => { store.addShopping(el.dataset.name); toast(`${el.dataset.name} auf der Liste`); },
  'shop-to-pantry': () => { const added = store.shoppingToPantry(); toast(`${added.length} Sachen in den Vorrat übernommen`); },
  // Teilen
  share: async () => {
    const items = selectedOffers();
    if (!items.length) return toast('Erst etwas auswählen');
    items.forEach((i) => store.update(i.id, { offered: iso() }));
    const how = await shareItems(items, store.state.settings.flat);
    if (how === 'copied') toast('Text kopiert – jetzt in die Haus-Gruppe einfügen');
  },
  'share-offered': async () => {
    const how = await shareItems(store.items().filter((i) => i.offered), store.state.settings.flat);
    if (how === 'copied') toast('Text kopiert');
  },
  poster: () => printPoster(store.items().filter((i) => i.offered), store.state.settings.flat) || toast('Bitte Pop-ups erlauben'),
  'poster-new': () => {
    const items = selectedOffers();
    if (!items.length) return toast('Erst etwas auswählen');
    items.forEach((i) => store.update(i.id, { offered: iso() }));
    printPoster(items, store.state.settings.flat) || toast('Bitte Pop-ups erlauben');
  },
  // Einstellungen
  calendar: () => {
    const ics = calendarFile(store.items());
    if (!ics) return toast('In den nächsten 3 Wochen läuft nichts ab');
    download(ics, 'restlos-erinnerungen.ics', 'text/calendar');
  },
  notify: async () => {
    if (!('Notification' in window)) return toast('Dieser Browser kann keine Mitteilungen – nutze den Kalender');
    if (Notification.permission === 'granted' && store.state.settings.remind !== false) {
      store.setting('remind', false);
      syncReminders();
      return toast('Erinnerungen aus');
    }
    const r = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (r !== 'granted') { render(); return toast('Mitteilungen wurden nicht erlaubt – in den Einstellungen des Browsers änderbar'); }
    store.setting('remind', true);
    syncReminders();
    const bg = await backgroundReminders();
    toast(bg ? 'Erinnerungen an – höchstens eine am Tag' : 'Erinnerungen an – kommen, wenn du Restlos öffnest');
  },
  export: () => download(store.exportJson(), `restlos-sicherung-${iso()}.json`, 'application/json'),
  import: () => $('#backup').click(),
  reset: () => { if (confirm('Wirklich alles löschen? Vorrat, Einkaufsliste und Bilanz.')) { store.reset(); toast('Alles gelöscht'); } },
};

function consume(id, how, qty) {
  const i = store.find(id);
  if (!i) return;
  const undo = store.consume(id, how, qty);
  const msg = { used: `${i.name} aufgebraucht 👍`, wasted: `${i.name} weggeworfen`, shared: `${i.name} verschenkt – danke! 🤝`, removed: `${i.name} gelöscht` }[how];
  toast(msg, undo);
}

function download(text, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  if (el.tagName === 'INPUT') { actions[el.dataset.action](el); return; }
  e.preventDefault();
  actions[el.dataset.action](el);
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.change) {
    let v = el.value;
    if (el.dataset.change === 'qty') v = Math.max(1, Math.min(99, +v || 1));
    if (el.dataset.change === 'price') v = Math.max(0, +v || 0);
    if (el.dataset.change === 'expires' && !v) return;
    store.update(el.dataset.id, { [el.dataset.change]: v, ...(el.dataset.change === 'expires' ? { dateSet: true } : {}) });
    if (el.dataset.change === 'expires') itemSheet(el.dataset.id);
  }
  if (el.dataset.setting) store.setting(el.dataset.setting, el.value.trim());
});

document.addEventListener('submit', (e) => {
  const form = e.target.dataset.form;
  if (form === 'chef') {
    e.preventDefault();
    const q = $('#chef-ask').value.trim();
    if (q) chefSend(q, q);
    return;
  }
  if (form === 'ai-key') {
    e.preventDefault();
    const key = $('#ai-key').value.trim();
    if (!key) return toast('Bitte den Schlüssel einfügen');
    store.setting('aiKey', key);
    toast('Gespeichert – der Koch ist bereit');
    return;
  }
  if (form !== 'shop') return;
  e.preventDefault();
  const input = $('#shop-text');
  const text = input.value;
  input.value = '';
  for (const x of parseFreeText(text)) store.addShopping(x.name, x.qty);
  $('#shop-text')?.focus();
});

// Entwurf für den Koch nicht verlieren, wenn die Ansicht neu gezeichnet wird.
document.addEventListener('input', (e) => { if (e.target.id === 'chef-text') chat.draft = e.target.value; });

$('#photo').addEventListener('change', (e) => {
  const files = [...e.target.files].slice(0, MAX_SHOTS);
  e.target.value = '';
  if (files.length) { shots = files; handlePhotos(files); }
});

$('#backup').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { store.importJson(await f.text()); toast('Sicherung geladen'); } catch (err) { toast(`Konnte die Datei nicht lesen: ${err.message}`); }
});

// ---------- Navigation ----------
const ROUTES = { vorrat: renderVorrat, rezepte: renderRezepte, koch: renderKoch, einkauf: renderEinkauf, teilen: renderTeilen, bilanz: renderBilanz };
const current = () => location.hash.replace('#/', '').split('?')[0] || 'vorrat';

function render() {
  const route = ROUTES[current()] ? current() : 'vorrat';
  // Eingaben nicht beim Tippen wegrendern (z. B. Klingelschild)
  const active = document.activeElement;
  const keep = active?.dataset?.setting ? active.dataset.setting : null;
  view.dataset.route = route;
  ROUTES[route]();
  if (keep) view.querySelector(`[data-setting="${keep}"]`)?.focus();
  const tab = route === 'koch' ? 'rezepte' : route;
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  const shopCount = store.state.shopping.filter((s) => !s.done).length;
  $('#tabs [data-tab="einkauf"]').dataset.count = shopCount || '';
  // Link „Warum es Restlos gibt“ (…#/bilanz?mission=1): sanft zur Karte scrollen.
  if (location.hash.includes('mission=1')) {
    history.replaceState(null, '', '#/bilanz');
    setTimeout(() => $('#mission')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }
}

let lastRoute = current();
window.addEventListener('hashchange', () => {
  render();
  if (current() !== lastRoute) { window.scrollTo(0, 0); lastRoute = current(); }
});
store.subscribe(render);
render();

// ---------- Erinnerungen ----------
// Sparsam: höchstens eine am Tag, gebündelt, jede Sache nur einmal (rescue.js).
// Im Hintergrund verschickt sie der Service Worker (sw.js) – dafür legt die App einen fertigen Fahrplan
// in den Cache, denn localStorage kann der Service Worker nicht lesen. Das klappt nur, wo der Browser
// regelmäßige Hintergrund-Aufgaben erlaubt (installierte App in Chrome/Edge). Sonst erinnert Restlos beim Öffnen.
const REMIND_CACHE = 'restlos-erinnerung';
const REMIND_FILE = 'erinnerung.json';
const remindOn = () => 'Notification' in window && Notification.permission === 'granted' && store.state.settings.remind !== false;
const remindAsk = () => 'Notification' in window && Notification.permission === 'default' && store.state.settings.remind !== false;

async function readRemindCache() {
  try { return await (await (await caches.open(REMIND_CACHE)).match(REMIND_FILE))?.json() ?? null; } catch { return null; }
}

// Das Gedächtnis liegt doppelt: in den Einstellungen (sicher) und im Cache (für den Service Worker).
async function reminderMemo() {
  const a = store.state.settings.reminder || emptyMemo();
  const b = (await readRemindCache())?.memo || emptyMemo();
  return { day: a.day > b.day ? a.day : b.day, seen: { ...a.seen, ...b.seen } };
}

// Rezeptidee für die Mitteilung: das beste Reste-Rezept, das etwas davon aufbraucht.
const ideaFor = (due) => suggest(store.items().filter((i) => !i.offered), { vegOnly: store.state.settings.veg, limit: 6 })
  .find((r) => r.uses.some((u) => due.some((d) => d.id === u.id)))?.title;

let syncTimer;
function syncReminders() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    if (!('caches' in window)) return;
    const memo = await reminderMemo();
    const items = store.items();
    const data = { on: remindOn(), memo, schedule: remindOn() ? reminderSchedule(items, memo, iso(), ideaFor) : [] };
    try { await (await caches.open(REMIND_CACHE)).put(REMIND_FILE, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })); } catch { /* egal */ }
  }, 400);
}

async function backgroundReminders() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg?.periodicSync) return false;
    const perm = await navigator.permissions?.query({ name: 'periodic-background-sync' }).catch(() => null);
    if (perm && perm.state !== 'granted') return false;
    await reg.periodicSync.register('restlos-erinnerung', { minInterval: 12 * 3600e3 });
    return true;
  } catch { return false; }
}

// Beim Öffnen: Ist heute etwas Neues fällig, sagt die App es selbst – ohne extra Mitteilung, du schaust ja gerade drauf.
async function remindInApp() {
  if (store.state.settings.remind === false || document.visibilityState !== 'visible') return;
  const memo = await reminderMemo();
  const items = store.items();
  const plan = reminderPlan(items, memo, iso(), ideaFor);
  if (!plan) return;
  store.setting('reminder', remember(memo, plan, iso(), items));
  syncReminders();
  if (sheet.open) return;
  toast(`⏰ ${plan.title}`, () => rescueSheet(), 'Retten-Ideen');
}

// Tipp auf die Mitteilung (…#/vorrat?retten=1) öffnet die Retten-Ideen.
function openFromLink() {
  if (!location.hash.includes('retten=1')) return;
  history.replaceState(null, '', '#/vorrat');
  render();
  setTimeout(rescueSheet, 200);
}
window.addEventListener('hashchange', openFromLink);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
store.subscribe(syncReminders);
syncReminders();
if (remindOn()) backgroundReminders();
openFromLink();
setTimeout(remindInApp, 1500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') remindInApp(); });
// Schnellzugriff vom Startbildschirm („Kassenbon scannen“)
if (location.hash.includes('scan=1')) { history.replaceState(null, '', '#/vorrat'); startScan(); }

// Für Tests und Entwickler-Konsole
window.restlos = { store, PRODUCTS };
