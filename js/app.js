// Restlos – Oberfläche. Ansichten: Vorrat, Rezepte (mit KI-Koch), Einkauf, Teilen, Bilanz.
import { initWaterlevel } from './waterlevel.js';
import { createStore } from './store.js';
import { CATS, PLACES, PRODUCTS, byId, matchProduct, searchProducts, correctProduct } from './products.js';
import { iso, addDays, daysLeft, status, stats, openItem, parseFreeText, makeItem } from './pantry.js';
import { parseReceipt } from './receipt.js';
import { suggest } from './recipes.js';
import { shareItems, printPoster, calendarFile } from './share.js';
import { CONFIG } from './config.js';
import { scanCamera, cameraSupported, MAX_SHOTS } from './camera.js';
import { checkTotal } from './receiptai.js';
import { askChef, chefProvider, firstMessage, pantryForChef, renderMarkdown, ideas, usedItems, ideasMessage, parseIdeas, pantryKey, rescueText } from './chef.js';
import { rescueTips, reminderPlan, reminderSchedule, remember, emptyMemo } from './rescue.js';
import { initNachbarn, renderNachbarn, neighborsLive } from './nachbarn.js';
import { healthTips } from './health.js';
import { t, tn, lang, LANGS, locale, dir, saveLang, pname, productName, euro, num, dateLabel } from './i18n.js';

const store = createStore();

// Sprache der Seite: Richtung (Arabisch von rechts), feste Texte aus index.html übersetzen.
document.documentElement.lang = lang;
document.documentElement.dir = dir();
document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.textContent.trim()); });
document.querySelectorAll('[data-i18n-label]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nLabel)));
document.getElementById('lang-code').textContent = lang.toUpperCase();
document.querySelector('meta[name="description"]')?.setAttribute('content', t('Restlos – Vorrat ohne Tipparbeit: Kassenbon scannen, vor Verfall gewarnt werden, Reste verkochen oder im Hausflur verschenken.'));
const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const sheet = $('#sheet');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kg = (n) => `${num(n, { maximumFractionDigits: n < 10 ? 1 : 0 })} kg`;
// Name in der gewählten Sprache, fertig für HTML
const nm = (i) => esc(pname(i));
const place = (p) => t(PLACES[p] ?? p);

// ---------- kleine Helfer ----------
let toastTimer;
function toast(msg, undo, label = t('Rückgängig')) {
  const el = $('#toast');
  // Ein offenes Sheet liegt in der obersten Ebene – der Hinweis muss mit hinein, sonst ist er verdeckt.
  (sheet.open ? sheet : document.body).append(el);
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button data-action="undo">${esc(label)}</button>` : ''}`;
  el.classList.add('show');
  toast.undo = undo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 6000 : 3000);
}

function openSheet(html, onReady) {
  sheet.innerHTML = `<div class="sheet-inner"><button class="sheet-close" data-action="close" aria-label="${t('Schließen')}">✕</button>${html}</div>`;
  if (!sheet.open) sheet.showModal();
  onReady?.(sheet);
}
const closeSheet = () => sheet.open && sheet.close();
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
// Beim Schließen gibt der Browser den Fokus an den Knopf zurück, der das Fenster geöffnet hat. Nach „Zurück“
// zeigt er dann einen Rahmen um den Knopf – den wollen wir nicht stehen lassen.
sheet.addEventListener('close', () => document.activeElement?.blur());

// „Restlos unterstützen“ – nur sichtbar, wenn in config.js ein PayPal- oder Stripe-Link steht.
const paypalUrl = /^https:\/\//.test(CONFIG.paypal) ? CONFIG.paypal : '';
const cardUrl = /^https:\/\//.test(CONFIG.cardPay || '') ? CONFIG.cardPay : '';
const supportUrl = paypalUrl || cardUrl;
const supportLink = (text, cls = 'link') => (supportUrl ? `<a class="${cls}" href="#/bilanz?mission=1">${text}</a>` : '');
const DONATE = [3, 5, 10, 20];
let donateAmount = 5;
const euroShort = (n) => n.toLocaleString(locale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 });

// Betrag wählen (Vorschläge oder eigener Betrag), dann PayPal oder – falls eingerichtet – Apple Pay / Google Pay / Karte.
function donateBox() {
  if (!supportUrl) return `<p class="muted small">${t('Die Möglichkeit zum Unterstützen kommt in Kürze.')}</p>`;
  const custom = !DONATE.includes(donateAmount);
  return `<div class="donate">
    <span class="field">${t('Betrag wählen')}</span>
    <div class="donate-amounts" role="group" aria-label="${t('Betrag wählen')}">
      ${DONATE.map((v) => `<button class="chip ${v === donateAmount ? 'on' : ''}" data-action="donate-amount" data-v="${v}" aria-pressed="${v === donateAmount}">${euroShort(v)}</button>`).join('')}
      <label class="donate-free ${custom ? 'on' : ''}"><input id="donate-free" type="text" inputmode="decimal" autocomplete="off" maxlength="6" placeholder="${t('Eigener Betrag')}" value="${custom ? donateAmount : ''}" aria-label="${t('Eigener Betrag')}"><span>€</span></label>
    </div>
    ${paypalUrl ? `<button class="btn primary block" data-action="donate-paypal">${t('{euro} mit PayPal geben', { euro: `<b class="donate-sum">${euroShort(donateAmount)}</b>` })}</button>` : ''}
    ${cardUrl ? `<button class="btn block pay-btn" data-action="donate-card"><span>${t('Apple Pay · Google Pay · Karte')}</span></button>
      <p class="muted small center">${t('Den Betrag gibst du dort noch einmal ein.')}</p>` : ''}
  </div>`;
}

function setDonate(v) {
  donateAmount = v;
  document.querySelectorAll('[data-action="donate-amount"]').forEach((b) => { const on = +b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  document.querySelector('.donate-free')?.classList.toggle('on', !DONATE.includes(v));
  document.querySelectorAll('.donate-sum').forEach((el) => { el.textContent = euroShort(v); });
}

// Warum es Restlos gibt: kostenlos, aus Überzeugung – und was jede gerettete Sache bringt.
function missionCard(s) {
  const mine = s && s.saved ? `<p class="mission-mine">${t('Du hast in den letzten 30 Tagen <b>{n} Lebensmittel</b> gerettet – das sind rund <b>{euro}</b> und <b>{co2} CO₂</b>.', { n: s.saved, euro: euro(s.savedEuro), co2: kg(s.savedCo2) })}</p>` : '';
  return `<section class="card mission" id="mission">
    <span class="mission-badge">${t('Kostenlos · ohne Werbung · ohne Abo')}</span>
    <h2>${t('Gemacht, damit weniger im Müll landet')}</h2>
    <p>${t('Restlos ist kein Geschäftsmodell, sondern ein Herzensprojekt. Die App ist kostenlos und bleibt es – für alle, die beim ganz normalen Einkaufen etwas für ihren Geldbeutel und für unsere Umwelt tun möchten.')}</p>
    <ul class="mission-points">
      <li><span>🥕</span><span><b>${t('Weniger wegwerfen')}</b>${t('In Deutschland landen pro Person rund 78 kg Lebensmittel im Jahr im Müll – oft nur, weil man sie vergessen hat. Restlos erinnert dich rechtzeitig und zeigt, was du daraus kochen kannst.')}</span></li>
      <li><span>🌍</span><span><b>${t('Die Umwelt schützen')}</b>${t('In jedem Lebensmittel stecken Wasser, Energie und CO₂. Was du isst statt wegwirfst, war nicht umsonst produziert.')}</span></li>
      <li><span>💶</span><span><b>${t('Geld sparen')}</b>${t('Weggeworfene Lebensmittel kosten einen Haushalt im Schnitt mehrere hundert Euro im Jahr. Was du rettest, bleibt in deinem Geldbeutel.')}</span></li>
    </ul>
    ${mine}
    <div class="mission-support">
      <b>💚 ${t('Restlos unterstützen')}</b>
      <p>${t('Damit Restlos bald auch im App Store und bei Google Play erscheint und der KI-Koch weiter kostenlos kocht, freuen wir uns über eine freiwillige Unterstützung. Jeder Betrag hilft – keiner ist Pflicht. Alle Funktionen bleiben für alle frei.')}</p>
      ${donateBox()}
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
    <button class="sheet-close" data-action="milestone-ok" data-m="${m}" aria-label="${t('Schließen')}">✕</button>
    <b>🎉 ${t('Schon {n} Lebensmittel gerettet!', { n: m })}</b>
    <p class="small">${t('Danke, dass du mitmachst. Restlos ist kostenlos und aus Überzeugung entstanden – damit weniger im Müll landet.')}</p>
    <a class="link small" href="#/bilanz?mission=1" data-action="mission" data-m="${m}">${t('Warum es Restlos gibt')}${supportUrl ? ` · ${t('unterstützen')}` : ''}</a>
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
  const hello = t(hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend');
  const counts = { alle: items.length };
  for (const i of items) counts[i.place] = (counts[i.place] || 0) + 1;
  const shown = placeFilter === 'alle' ? items : items.filter((i) => i.place === placeFilter);

  const groups = [
    [t('Drüber – erst prüfen'), (d) => d < 0],
    [t('Heute & morgen'), (d) => d >= 0 && d <= 1],
    [t('Diese Woche'), (d) => d > 1 && d <= 7],
    [t('Später'), (d) => d > 7],
  ];
  const list = groups.map(([title, test]) => {
    const g = shown.filter((i) => test(daysLeft(i)));
    if (!g.length) return '';
    return `<section class="grp"><h3 class="group">${title}</h3><ul class="list">${g.map(row).join('')}</ul></section>`;
  }).join('');

  view.innerHTML = `
    <section class="hero">
      <h1>${hello}!</h1>
      <p>${items.length ? `${tn(items.length, '1 Sache im Vorrat', '{n} Sachen im Vorrat')}${urgent.length ? ` · <b>${tn(urgent.length, '1 muss bald weg', '{n} müssen bald weg')}</b>` : ` · ${t('alles im grünen Bereich')}`}` : t('Dein Vorrat ist noch leer.')}</p>
    </section>
    ${urgent.length ? `
    <section class="card alert">
      <div class="alert-head">⏰ ${t('Bald weg: {name}', { name: urgent.slice(0, 4).map(nm).join(', ') })}${urgent.length > 4 ? ' …' : ''}</div>
      <div class="row-btns">
        <button class="btn primary" data-action="rescue">💡 ${t('Retten')}</button>
        <a class="btn" href="#/koch">👨‍🍳 ${t('Koch fragen')}</a>
      </div>
      ${remindAsk() ? `<button class="link small" data-action="notify">🔔 ${t('Rechtzeitig erinnern lassen')}</button>` : ''}
    </section>` : ''}
    ${store.hasDemo() ? `<section class="card tip demo-note"><span>🧪 ${t('Das ist der Beispiel-Vorrat.')}</span><button class="btn small" data-action="demo-remove">${t('Beispiel-Vorrat entfernen')}</button></section>` : ''}
    ${milestoneCard()}
    ${afterShoppingCard()}
    <section class="quick">
      <button class="quick-btn" data-action="scan"><span>📷</span>${t('Kassenbon')}</button>
      <button class="quick-btn" data-action="add" data-voice="1"><span>🎤</span>${t('Sprechen')}</button>
      <button class="quick-btn" data-action="add"><span>⌨️</span>${t('Eintippen')}</button>
    </section>
    ${items.length ? `
    <div class="chips" role="tablist">
      ${['alle', 'kuehl', 'vorrat', 'tk'].map((p) => `<button class="chip ${placeFilter === p ? 'on' : ''}" data-action="place" data-place="${p}">${p === 'alle' ? t('Alle') : place(p)} <small>${counts[p] || 0}</small></button>`).join('')}
    </div>
    ${list ? `<div class="groups">${list}</div>` : `<p class="muted center">${t('Hier liegt gerade nichts.')}</p>`}` : `
    <section class="empty">
      <div class="big">🧺</div>
      <p><b>${t('Kein Eintippen von Ablaufdaten.')}</b> ${t('Fotografiere einfach deinen Kassenbon – Restlos erkennt die Lebensmittel und schätzt, wie lange sie halten.')}</p>
      <button class="btn primary" data-action="scan">📷 ${t('Ersten Kassenbon scannen')}</button>
    </section>`}
  `;
}

// Nach dem Einkauf: Wer etwas auf der Liste abgehakt hat, war wohl einkaufen – kurz an den Bon erinnern.
function afterShoppingCard() {
  const done = store.state.shopping.filter((s) => s.done).length;
  if (!done) return '';
  return `<section class="card tip after-shop">
    <p>🧾 <b>${t('Warst du einkaufen?')}</b> ${t('Fotografiere den Bon, den Bildschirm der SB-Kasse oder einfach deine Einkäufe – oder übernimm die abgehakten Sachen.')}</p>
    <div class="row-btns">
      <button class="btn primary" data-action="scan">📷 ${t('Fotografieren')}</button>
      <button class="btn" data-action="shop-to-pantry">✓ ${tn(done, '1 Sache übernehmen', '{n} Sachen übernehmen')}</button>
    </div>
  </section>`;
}

function row(i) {
  return `<li class="item ${i.offered ? 'offered' : ''}">
    <button class="item-main" data-action="item" data-id="${i.id}">
      <span class="emoji">${i.emoji}</span>
      <span class="item-text"><b>${nm(i)}</b>${i.qty > 1 ? ` <small>× ${i.qty}</small>` : ''}
        <small class="sub">${i.offered ? `🤝 ${t('angeboten')} · ` : ''}${i.opened ? `${t('angebrochen')} · ` : ''}${place(i.place)}</small></span>
      ${badge(i)}
    </button>
    <button class="done-btn" data-action="used" data-id="${i.id}" aria-label="${esc(t('{name} aufgebraucht', { name: pname(i) }))}">✓</button>
  </li>`;
}

function itemSheet(id) {
  const i = store.find(id);
  if (!i) return closeSheet();
  const s = status(i);
  const p = i.pid && byId[i.pid];
  let hint = '';
  if (s.d < 0 && s.vd) hint = `<p class="hint danger">${t('Verbrauchsdatum überschritten – bitte nicht mehr essen.')}</p>`;
  else if (s.d < 0) hint = `<p class="hint">${t('Mindesthaltbarkeit heißt nicht „schlecht ab“. Ansehen, riechen, probieren – oft ist es noch gut.')}</p>`;
  else if (!i.dateSet) hint = `<p class="hint muted">${t('Datum geschätzt. Steht etwas anderes auf der Packung? Einfach unten ändern.')}</p>`;
  openSheet(`
    <div class="sheet-head"><span class="emoji xl">${i.emoji}</span><div><h2 id="sheet-title">${nm(i)}${i.qty > 1 ? ` × ${i.qty}` : ''}</h2>
      <p>${badge(i)} <span class="muted">${t('bis {date}', { date: dateLabel(i.expires) })}</span></p></div></div>
    ${hint}
    ${s.d <= 3 ? rescueBox(i) : ''}
    <div class="actions">
      <button class="act good" data-action="consume" data-id="${i.id}" data-how="used">✓<span>${t('Aufgebraucht')}</span></button>
      ${i.qty > 1 ? `<button class="act" data-action="consume" data-id="${i.id}" data-how="used" data-qty="1">½<span>${t('1 Stück weg')}</span></button>` : ''}
      ${!i.opened ? `<button class="act" data-action="open" data-id="${i.id}">🔓<span>${t('Angebrochen')}</span></button>` : ''}
      ${i.place !== 'tk' ? `<button class="act" data-action="freeze" data-id="${i.id}">❄️<span>${t('Einfrieren')}</span></button>` : ''}
      <button class="act" data-action="offer" data-id="${i.id}">🤝<span>${t(i.offered ? 'Nicht mehr anbieten' : 'Verschenken')}</span></button>
      <button class="act bad" data-action="consume" data-id="${i.id}" data-how="wasted">🗑<span>${t('Weggeworfen')}</span></button>
    </div>
    <div class="form">
      <label>${t('Gut bis')} <input type="date" value="${i.expires}" data-change="expires" data-id="${i.id}"></label>
      <label>${t('Ort')} <select data-change="place" data-id="${i.id}">${Object.keys(PLACES).map((k) => `<option value="${k}" ${k === i.place ? 'selected' : ''}>${place(k)}</option>`).join('')}</select></label>
      <label>${t('Menge')} <input type="number" min="1" max="99" value="${i.qty}" data-change="qty" data-id="${i.id}"></label>
      <label>${t('Preis (Stück)')} <input type="number" min="0" step="0.01" value="${i.price ?? ''}" data-change="price" data-id="${i.id}"></label>
    </div>
    <p class="muted small">${t('Gekauft {date}', { date: dateLabel(i.bought) })}${i.raw ? ` · ${t('auf dem Bon: „{raw}“', { raw: esc(i.raw) })}` : ''}${p ? ` · ${t(CATS[p.cat].name)}` : ''}</p>
    <button class="link danger" data-action="consume" data-id="${i.id}" data-how="removed">${t('Falsch eingetragen – löschen')}</button>
  `);
}

// ---------- Retten statt wegwerfen ----------
// Kurze Tipps je Sache (ohne Internet), dazu der Koch für ein Rezept rund um genau diese Sache.
function rescueBox(i, compact = false) {
  const tips = rescueTips(i);
  if (!tips.length) return '';
  const vdOver = status(i).d < 0 && status(i).vd;
  return `<div class="rescue ${compact ? 'compact' : ''}">
    ${compact ? '' : `<b class="rescue-head">💡 ${t('So rettest du es')}</b>`}
    <ul>${tips.map((x) => `<li><span>${x.icon}</span>${esc(x.text)}</li>`).join('')}</ul>
    ${!vdOver && aiChefReady() ? `<button class="btn small" data-action="rescue-chef" data-id="${i.id}">👨‍🍳 ${t('Rezept mit {name}', { name: nm(i) })}</button>` : ''}
  </div>`;
}

function rescueSheet() {
  const items = store.items().filter((i) => !i.offered && daysLeft(i) <= 2 && !(daysLeft(i) < 0 && status(i).vd));
  if (!items.length) return toast(t('Gerade muss nichts gerettet werden 🌱'));
  lastSuggestions = suggest(store.items().filter((i) => !i.offered), { vegOnly: store.state.settings.veg, limit: 5 });
  const n = lastSuggestions.findIndex((r) => r.urgent.length);
  const recipe = lastSuggestions[n];
  openSheet(`
    <h2 id="sheet-title">${t('Retten statt wegwerfen')}</h2>
    <p class="muted small">${tn(items.length, 'Diese Sache muss bald weg. So wird noch was draus:', 'Diese {n} Sachen müssen bald weg. So wird noch was draus:')}</p>
    ${recipe ? `<button class="card recipe rescue-recipe" data-action="recipe" data-n="${n}"><span class="emoji xl">${recipe.emoji}</span>
      <span class="recipe-text"><b>${esc(recipe.title)}</b><small>${t('{n} Min.', { n: recipe.time })} · ${t('rettet {names}', { names: recipe.urgent.map(nm).join(', ') })}</small></span></button>` : ''}
    <ul class="rescue-list">${items.map((i) => `<li class="card">
      <div class="rescue-item"><span class="emoji">${i.emoji}</span><b>${nm(i)}</b>${badge(i)}</div>
      ${rescueBox(i, true)}</li>`).join('')}</ul>
    <a class="btn block" href="#/teilen" data-action="close-go">🤝 ${t('Lieber verschenken')}</a>
  `);
}

// ---------- Hinzufügen: Tippen oder Sprechen ----------
const QUICK = ['milch', 'eier', 'brot', 'bananen', 'tomaten', 'joghurt', 'kaese', 'aepfel', 'salat', 'butter', 'hackfleisch', 'gurke'];

function addSheet(voice) {
  openSheet(`
    <h2 id="sheet-title">${t('Was ist neu im Vorrat?')}</h2>
    <p class="muted small">${t('Mehrere Sachen mit Komma trennen – z. B. „Milch, 6 Eier, Brot“. Ablaufdaten schätzt Restlos.')}</p>
    <div class="input-row">
      <input id="add-text" type="text" autocomplete="off" enterkeyhint="done" placeholder="${esc(t('Milch, 6 Eier, Brot …'))}" aria-label="${t('Lebensmittel')}">
      <button class="icon-btn mic" data-action="listen" aria-label="${t('Sprechen')}">🎤</button>
    </div>
    <div id="add-suggest" class="chips"></div>
    <div class="chips wrap">${QUICK.map((id) => `<button class="chip" data-action="quick-add" data-name="${esc(productName(id))}">${byId[id].emoji} ${esc(productName(id))}</button>`).join('')}</div>
    <ul id="add-preview" class="list compact"></ul>
    <button class="btn primary block" data-action="add-confirm" disabled>${t('Hinzufügen')}</button>
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
    <span class="item-text"><b>${nm(i)}</b>${i.qty > 1 ? ` <small>× ${i.qty}</small>` : ''}<small class="sub">${i.pid ? t('hält ca. bis {date}', { date: dateLabel(i.expires) }) : t('unbekannt – ca. 1 Woche')} · ${place(i.place)}</small></span></li>`).join('');
  $('[data-action="add-confirm"]').disabled = !items.length;
  $('[data-action="add-confirm"]').textContent = items.length > 1 ? t('{n} Sachen hinzufügen', { n: items.length }) : t('Hinzufügen');
  // Vorschläge zum letzten angefangenen Wort
  const last = input.value.split(/,|،|\bund\b|\band\b/).pop().trim().replace(/^\d+\s*/, '');
  const hits = suggestFor(last, 4);
  $('#add-suggest').innerHTML = hits.map((p) => `<button class="chip" data-action="complete" data-name="${esc(productName(p.id))}">${p.emoji} ${esc(productName(p.id))}</button>`).join('');
}

// Vorschläge beim Tippen: passende Lebensmittel, sonst das wahrscheinlich gemeinte bei einem Tippfehler.
function suggestFor(text, limit) {
  if (text.length < 2) return [];
  const hits = searchProducts(text, limit);
  const fix = correctProduct(text);
  return [...new Set([...(fix ? [fix] : []), ...hits])].filter((p) => productName(p.id).toLowerCase() !== text.toLowerCase()).slice(0, limit);
}

// Einkaufsliste: beim Tippen mitschreiben (Vorschläge) und warnen, wenn es noch zu Hause ist.
function updateShopInput(inStock) {
  const input = $('#shop-text');
  if (!input) return;
  const last = input.value.split(/,|،|\bund\b|\band\b/).pop().trim().replace(/^\d+\s*/, '');
  const hits = suggestFor(last, 5);
  $('#shop-suggest').innerHTML = hits.map((p) => `<button type="button" class="chip" data-action="shop-complete" data-name="${esc(productName(p.id))}">${p.emoji} ${esc(productName(p.id))}</button>`).join('');
  const have = last.length > 2 ? inStock(last) : [];
  const warn = $('#shop-warn');
  warn.hidden = !have.length;
  warn.innerHTML = have.length ? `🤔 ${t('Hast du noch:')} ${have.map((i) => `<b>${i.qty > 1 ? `${i.qty}× ` : ''}${nm(i)}</b> (${status(i).label})`).join(', ')}` : '';
}

function listen(input = $('#add-text'), onUpdate = updateAddPreview, mic = $('.mic')) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast(t('Spracheingabe kann dieser Browser nicht – nutze das Mikrofon der Tastatur.'));
  const rec = new SR();
  rec.lang = locale().split('-u-')[0];
  rec.interimResults = true;
  const before = input.value ? `${input.value.replace(/,\s*$/, '')}, ` : '';
  mic?.classList.add('on');
  rec.onresult = (e) => {
    input.value = before + [...e.results].map((r) => r[0].transcript).join(' ');
    onUpdate();
  };
  rec.onend = () => mic?.classList.remove('on');
  rec.onerror = (e) => { mic?.classList.remove('on'); if (e.error === 'not-allowed') toast(t('Bitte Mikrofon erlauben.')); };
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
    <h2 id="sheet-title">${t('Kassenbon scannen')}</h2>
    ${problem ? `<p class="scan-check warn">${esc(problem)}</p>` : ''}
    <p class="muted">${t('Bon glatt hinlegen, gut beleuchten, ganz aufs Foto. Bei langen Bons einfach mehrere Fotos auswählen.')} ${t(ai ? 'Die KI liest jede Zeile – das Foto geht dafür an Google Gemini.' : 'Die Erkennung läuft auf deinem Gerät – das Foto wird nicht hochgeladen.')}</p>
    ${!problem && cameraSupported() ? `<button class="btn primary block" data-action="scan">📷 ${t('Kamera öffnen')}</button>` : ''}
    <button class="btn ${problem || !cameraSupported() ? 'primary' : ''} block" data-action="photo">🖼️ ${t('Foto aufnehmen oder auswählen')}</button>
    <details class="paste">
      <summary>${t('Digitalen Kassenbon einfügen (eBon aus REWE-, Lidl-Plus-App …)')}</summary>
      <textarea id="bon-text" rows="7" placeholder="${esc(t('Bon-Text hier einfügen …'))}"></textarea>
      <button class="btn block" data-action="bon-text">${t('Bon auswerten')}</button>
    </details>
  `);
}

const aiReady = () => {
  const conn = aiConn();
  return !!chefProvider(conn.apiKey, conn.server, conn.sample) && !conn.apiKey?.startsWith('sk-ant-');
};

async function handlePhotos(files) {
  const n = files.length;
  openSheet(`<h2 id="sheet-title">${n > 1 ? t('{n} Fotos werden gelesen …', { n }) : t('Bon wird gelesen …')}</h2>
    <div class="progress"><div id="bar"></div></div><p id="progress-text" class="muted center">${t('Einen Moment …')}</p>`);
  const step = (p, msg) => {
    $('#bar') && ($('#bar').style.width = `${Math.round(p * 100)}%`);
    $('#progress-text') && ($('#progress-text').textContent = msg);
  };
  // Mit KI (Gemini bzw. Claude in der Vorschau) – viel genauer. Klappt das nicht, liest das Gerät selbst.
  if (aiReady()) {
    $('#bar')?.classList.add('busy');
    step(0.4, t('KI liest jede Zeile und zählt nach …'));
    try {
      const { readReceiptAI } = await import('./receiptai.js');
      return reviewReceipt(await readReceiptAI(files, aiConn()));
    } catch {
      toast(t('KI gerade nicht erreichbar – das Gerät liest den Bon selbst'));
      $('#bar')?.classList.remove('busy');
    }
  }
  try {
    const { recognize } = await import('./ocr.js');
    reviewReceipt(fromText(await recognize(files, step)));
  } catch (e) {
    openSheet(`<h2 id="sheet-title">${t('Das hat nicht geklappt')}</h2><p>${esc(e.message)}</p>
      <button class="btn primary block" data-action="scan">${t('Nochmal scannen')}</button>
      <button class="btn block" data-action="add">${t('Lieber eintippen')}</button>`);
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
    return openSheet(`<h2 id="sheet-title">${t('Keine Lebensmittel gefunden')}</h2>
      <p class="muted">${rows.length ? t('Auf dem Bon stehen nur Sachen, die nicht in den Vorrat gehören ({names}).', { names: rows.map((r) => esc(r.name)).join(', ') }) : t('Der Bon war schwer zu lesen. Tipp: flach hinlegen, ohne Schatten, näher ran, Lampe an. Oder einfach eintippen.')}</p>
      <button class="btn primary block" data-action="scan">📷 ${t('Nochmal scannen')}</button>
      <button class="btn block" data-action="add">${t('Eintippen')}</button>
      ${result.text ? `<details class="paste"><summary>${t('Erkannter Text')}</summary><pre>${esc(result.text)}</pre></details>` : ''}`);
  }
  reviewSheet();
}

// Abgleich mit dem Bon: Summe aller Zeilen gegen den Endbetrag, Stückzahl gegen die gedruckte Artikelanzahl.
function scanCheck() {
  const { result, rows } = scan;
  if (result.type === 'produkte') return { html: '', more: false };
  const c = checkTotal({ total: result.total, count: result.count, items: rows });
  const more = shots.length < MAX_SHOTS && cameraSupported() ? `<button class="btn small" data-action="scan-more">📷 ${t('Weiteres Foto aufnehmen')}</button>` : '';
  const count = c.countOk === false ? ` ${t('Laut Bon {count} Artikel, gezählt {pieces} – die Stückzahl kannst du unten mit − und + anpassen.', { count: result.count, pieces: c.pieces })}` : '';
  if (c.ok) return { html: `<div class="scan-check ok">✓ <b>${t('Alles erfasst.')}</b> ${t('Die Summe {sum} stimmt mit dem Bon überein.', { sum: euro(c.sum) })}${count}</div>`, more: false };
  if (c.diff > 0) return { html: `<div class="scan-check warn"><b>${t('Es fehlen {diff}.', { diff: euro(c.diff) })}</b> ${t('Auf dem Bon stehen {total}, erkannt sind {sum}. Vielleicht ist ein Stück vom Bon nicht auf dem Foto.', { total: euro(c.total), sum: euro(c.sum) })}${count} ${more}</div>`, more: !!more };
  if (c.diff < 0) return { html: `<div class="scan-check warn"><b>${t('{diff} zu viel erkannt.', { diff: euro(-c.diff) })}</b> ${t('Auf dem Bon stehen {total}. Ist etwas doppelt drin? Dann einfach den Haken wegnehmen.', { total: euro(c.total) })}${count}</div>`, more: false };
  return { html: `<div class="scan-check">${t('Die Endsumme war nicht lesbar – kurz prüfen, ob alles da ist (erkannt: {sum}).', { sum: euro(c.sum) })}${count} ${more}</div>`, more: !!more };
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
    <h2 id="sheet-title">${products ? tn(food.length, '1 Produkt gezählt', '{n} Produkte gezählt') : t('{n} Artikel erkannt', { n: rows.length })}</h2>
    <p class="muted small">${result.store ? `${esc(result.store)} · ` : ''}${dateLabel(bought)} · ${t('{n} Stück Lebensmittel', { n: food.reduce((s, [r]) => s + r.qty, 0) })}${products ? '' : ` · ${euro(rows.reduce((s, r) => s + r.line, 0))}`}</p>
    ${check.html}
    <h3 class="group">${t('Kommt in den Vorrat')}</h3>
    <ul class="list compact checks scan-list">${food.map(([r, n]) => `<li class="item">
      <input type="checkbox" data-pick="${n}" aria-label="${esc(t('{name} übernehmen', { name: r.name }))}" ${r.checked ? 'checked' : ''}>
      <span class="emoji">${r.emoji}</span>
      <span class="item-text"><input class="name-edit" data-name="${n}" value="${esc(r.name)}" aria-label="${t('Name')}"><small class="sub">${t('bis ca. {date}', { date: dateLabel(r.expires) })}${r.raw && r.raw !== r.name ? ` · „${esc(r.raw)}“` : ''}</small></span>
      <span class="stepper"><button data-action="bon-qty" data-n="${n}" data-d="-1" aria-label="${t('weniger')}" ${r.qty <= 1 ? 'disabled' : ''}>−</button><b aria-label="${t('Anzahl')}">${r.qty}</b><button data-action="bon-qty" data-n="${n}" data-d="1" aria-label="${t('mehr')}">+</button></span>
      ${products ? '' : `<span class="price">${euro(r.line)}</span>`}</li>`).join('')}</ul>
    ${other.length ? `<h3 class="group">${t('Auch auf dem Bon')}</h3>
    <ul class="list compact scan-list other">${other.map((r) => `<li class="item"><span class="emoji">${r.emoji}</span>
      <span class="item-text"><b>${esc(r.name)}</b>${r.qty > 1 ? ` <small>× ${r.qty}</small>` : ''}<small class="sub">${r.kind === 'pfand' ? (r.raw && r.raw !== r.name ? `„${esc(r.raw)}“` : t('Pfand')) : t('kein Lebensmittel – kommt nicht in den Vorrat')}</small></span>
      <span class="price">${euro(r.line)}</span></li>`).join('')}</ul>` : ''}
    <button class="btn primary block" data-action="bon-confirm" ${picked.length ? '' : 'disabled'}>${picked.length ? tn(pieces, '1 Sache in den Vorrat', '{n} Sachen in den Vorrat') : t('Nichts ausgewählt')}</button>
    ${!check.more && shots.length && cameraSupported() && shots.length < MAX_SHOTS ? `<button class="btn block" data-action="scan-more">📷 ${t('Weiteres Foto vom selben Bon')}</button>` : ''}
    <button class="btn ghost block" data-action="add">${t('Fehlendes eintippen')}</button>
    ${result.text ? `<details class="paste"><summary>${t('Erkannten Text ansehen')}</summary><pre>${esc(result.text)}</pre></details>` : ''}
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
  // Erster echter Kassenbon: Der Beispiel-Vorrat hat ausgedient.
  if (store.hasDemo()) { store.removeDemo(); toast(t('Beispiel-Vorrat entfernt')); }
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
  toast(tn(added.length, '1 Sache im Vorrat', '{n} Sachen im Vorrat'), () => added.forEach((i) => store.consume(i.id, 'removed')));
}

// ---------- Rezepte ----------
let lastSuggestions = [];
function renderRezepte() {
  const items = store.items();
  const veg = store.state.settings.veg;
  lastSuggestions = suggest(items.filter((i) => !i.offered), { vegOnly: veg, limit: 10 });
  view.innerHTML = `
    <section class="hero"><h1>${t('Reste-Rezepte')}</h1><p>${t('Sortiert nach dem, was zuerst weg muss.')}</p></section>
    <a class="card chef-entry" href="#/koch"><span class="emoji xl">👨‍🍳</span>
      <span><b>${t('KI-Koch fragen')}</b><small>${t('Schreib, was du hast – ein Profikoch macht daraus ein Rezept, das auch Anfängern gelingt.')}</small></span></a>
    ${chefIdeasHtml(items)}
    <div class="chips"><button class="chip ${veg ? 'on' : ''}" data-action="veg">🥦 ${t('Nur vegetarisch')}</button></div>
    ${lastSuggestions.length ? `<div class="grid">${lastSuggestions.map((r, n) => `
      <button class="card recipe" data-action="recipe" data-n="${n}">
        <span class="emoji xl">${r.emoji}</span>
        <span class="recipe-text"><b>${esc(r.title)}</b>
          <small>${t('{n} Min.', { n: r.time })} · ${tn(r.uses.length, 'nutzt 1 Sache aus dem Vorrat', 'nutzt {n} Sachen aus dem Vorrat')}</small>
          ${r.urgent.length ? `<small class="save">🌱 ${t('rettet {names}', { names: r.urgent.map(nm).join(', ') })}</small>` : ''}
          ${r.missing.length ? `<small class="miss">${t('fehlt: {names}', { names: r.missing.map(esc).join(', ') })}</small>` : ''}</span>
      </button>`).join('')}</div>` : `
      <section class="empty"><div class="big">🍳</div><p>${t('Sobald etwas im Vorrat ist, schlägt Restlos hier Gerichte vor – zuerst die, die Ablaufendes aufbrauchen.')}</p>
      <button class="btn primary" data-action="scan">📷 ${t('Kassenbon scannen')}</button></section>`}
  `;
}

function recipeSheet(n) {
  const r = lastSuggestions[n];
  if (!r) return;
  openSheet(`
    <div class="sheet-head"><span class="emoji xl">${r.emoji}</span><div><h2 id="sheet-title">${esc(r.title)}</h2><p class="muted">${t('{n} Minuten', { n: r.time })}${r.veg ? ` · ${t('vegetarisch')}` : ''}</p></div></div>
    <h3>${t('Aus deinem Vorrat')}</h3>
    <ul class="list compact checks">${r.uses.map((i) => `<li class="item"><label><input type="checkbox" data-use="${i.id}" checked>
      <span class="emoji">${i.emoji}</span><span class="item-text"><b>${nm(i)}</b></span>${badge(i)}</label></li>`).join('')}</ul>
    ${r.missing.length ? `<p>${t('Fehlt noch:')} <b>${r.missing.map(esc).join(', ')}</b> <button class="link" data-action="to-list" data-names="${esc(r.missing.join('|'))}">→ ${t('auf die Einkaufsliste')}</button></p>` : ''}
    <p class="muted small">${t('Dazu aus dem Schrank: Salz, Pfeffer, Öl, ggf. Mehl, Zucker, Gewürze.')}</p>
    <h3>${t("So geht's")}</h3>
    <ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <button class="btn primary block" data-action="cooked">${t('Gekocht! Zutaten austragen')}</button>
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
  const key = `${lang}|${pantryKey(pantry)}`;
  if (!chefIdeas.busy && chefIdeas.key !== key && (!chefIdeas.list?.length || Date.now() - (chefIdeas.at || 0) > 30 * 60e3)) {
    setTimeout(() => loadIdeas(), 0);
    chefIdeas.busy = true;
  }
  const list = chefIdeas.list || [];
  const cards = chefIdeas.busy
    ? [0, 1, 2].map((k) => `<div class="card idea skeleton" style="--k:${k}"><span></span><span></span><span></span></div>`).join('')
    : list.map((x, n) => `<button class="card idea" data-action="idea-cook" data-n="${n}" style="--k:${n}">
        <b>${esc(x.name)}</b>
        ${x.saves.length ? `<small class="save">🌱 ${t('rettet {names}', { names: x.saves.map(esc).join(', ') })}</small>` : ''}
        ${x.why ? `<small>${esc(x.why)}</small>` : ''}
        <small class="idea-meta">${x.minutes ? `⏱ ${t('{n} Min.', { n: x.minutes })} · ` : ''}${t('Rezept ansehen')} ${dir() === 'rtl' ? '←' : '→'}</small>
      </button>`).join('');
  return `<section class="ideas" aria-live="polite">
    <div class="ideas-head"><h3 class="group">👨‍🍳 ${t('Neu vom Koch')}</h3>
      ${chefIdeas.busy ? '' : `<button class="link small" data-action="ideas-more">${t(list.length ? 'Andere Ideen' : 'Ideen holen')}</button>`}</div>
    ${chefIdeas.error ? `<p class="muted small">${esc(chefIdeas.error)}</p>` : ''}
    ${cards ? `<div class="idea-grid">${cards}</div>` : ''}
  </section>`;
}

async function loadIdeas(avoid = []) {
  const pantry = store.items().filter((i) => !i.offered);
  if (!pantry.length) return;
  Object.assign(chefIdeas, { busy: true, error: '' });
  if (current() === 'rezepte') render();
  const key = `${lang}|${pantryKey(pantry)}`;
  try {
    const { text } = await askChef({
      ...aiConn(),
      messages: [{ role: 'user', content: ideasMessage({ pantry: pantryForChef(pantry), veg: store.state.settings.veg, avoid }) }],
    });
    const list = parseIdeas(text);
    if (!list.length) throw new Error(t('Der Koch hatte gerade keine Idee. Tipp auf „Ideen holen“.'));
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
    <section class="hero"><h1>👨‍🍳 ${t('Dein KI-Koch')}</h1><p>${t('Schreib, was du hast – der Koch macht das Beste daraus. Auch wenn du noch nie gekocht hast.')}</p></section>
    ${previewChef ? `<p class="hint">${t('Vorschau: Hier kocht Claude über dein Claude-Konto. In der echten App kocht Gemini mit deinem Schlüssel.')}</p>` : ''}
    ${ready ? '' : `
    <section class="card">
      <b>${t('Einmal einrichten: kostenloser Schlüssel')}</b>
      <p class="small muted">${t('Der Koch nutzt Gemini von Google – kostenlos. Auf <b>aistudio.google.com</b> mit dem Google-Konto anmelden → „Get API key“ → „Create API key“ und hier einfügen. Der Schlüssel bleibt nur auf diesem Gerät.')}</p>
      <form class="input-row" data-form="ai-key"><input id="ai-key" type="password" autocomplete="off" placeholder="AIza…" aria-label="${t('API-Schlüssel')}"><button class="btn primary">${t('Speichern')}</button></form>
    </section>`}
    ${chat.messages.length ? chefConversation() : chefForm(ready)}
    <p class="muted small center">${t('Lieber ohne KI?')} <a href="#/rezepte">${t('Fertige Reste-Rezepte')}</a></p>
  `;
}

function chefForm(ready) {
  const items = store.items().filter((i) => !i.offered);
  const urgent = items.filter((i) => daysLeft(i) <= 3).length;
  const veg = store.state.settings.veg;
  const seg = (action, list, value, label) => list.map(([v, text]) => `<button class="chip ${value === v ? 'on' : ''}" data-action="${action}" data-v="${v}" aria-label="${label} ${text}" aria-pressed="${value === v}">${text}</button>`).join('');
  return `
    <section class="card">
      <label class="field" for="chef-text">${t('Was hast du da, worauf hast du Lust?')}</label>
      <div class="input-row start">
        <textarea id="chef-text" rows="3" placeholder="${esc(t('z. B. 2 Zucchini, halbe Packung Feta, Reis von gestern – gern was Warmes'))}">${esc(chat.draft)}</textarea>
        <button class="icon-btn mic" data-action="chef-listen" aria-label="${t('Sprechen')}">🎤</button>
      </div>
      <div class="chips wrap">
        ${items.length ? `<button class="chip ${chat.pantry ? 'on' : ''}" data-action="chef-pantry">📦 ${t('Vorrat nutzen')} <small>${items.length}${urgent ? `, ${t('{n} bald weg', { n: urgent })}` : ''}</small></button>` : ''}
        <button class="chip ${veg ? 'on' : ''}" data-action="veg">🥦 ${t('Vegetarisch')}</button>
      </div>
      <div class="chips wrap">${seg('chef-persons', [[1, t('1 Person')], [2, t('{n} Personen', { n: 2 })], [4, t('{n} Personen', { n: 4 })]], chat.persons, t('Für'))}</div>
      <div class="chips wrap">${seg('chef-minutes', [[15, t('{n} Min.', { n: 15 })], [30, t('{n} Min.', { n: 30 })], [60, t('1 Std.')], [0, `⏱ ${t('egal')}`]], chat.minutes, t('Zeit:'))}</div>
      <button class="btn primary block" data-action="chef-go" ${ready ? '' : 'disabled'}>👨‍🍳 ${t('Koch, leg los!')}</button>
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
    ${chat.busy ? `<article class="card chef-answer" id="chef-live" aria-live="polite">${chat.live ? renderMarkdown(chat.live) : `<p class="thinking">${t('Der Koch überlegt')}<span class="dots"></span></p>`}</article>
      <button class="btn block" data-action="chef-stop">${t('Stopp')}</button>` : ''}
    ${chat.error ? `<p class="hint danger">${esc(chat.error)}</p>${last?.role === 'user' ? `<button class="btn primary block" data-action="chef-retry">${t('Nochmal versuchen')}</button>` : ''}` : ''}
    ${done ? `
      ${used.length ? `<button class="btn primary block" data-action="chef-cooked">✓ ${t('Gekocht! Zutaten austragen')}</button>` : ''}
      ${ideas(answer).length ? `<div class="chips wrap idea-chips">${ideas(answer).map((x) => `<button class="chip" data-action="chef-idea" data-idea="${esc(x)}">${t('Lieber: {name}', { name: esc(x) })}</button>`).join('')}</div>` : ''}` : ''}
    ${chat.busy ? '' : `
      <form class="input-row" data-form="chef">
        <input id="chef-ask" type="text" autocomplete="off" enterkeyhint="send" placeholder="${esc(t('Frag nach: „ohne Ofen?“, „was statt Sahne?“'))}" aria-label="${t('Frage an den Koch')}">
        <button class="icon-btn flip" aria-label="${t('Senden')}">➤</button>
      </form>
      <button class="link center-link" data-action="chef-reset">${t('Neu anfangen')}</button>
      ${done ? `<p class="muted small center">${t("Schmeckt's? Restlos und der Koch sind kostenlos – aus Überzeugung.")} ${supportUrl ? supportLink(t('Restlos unterstützen')) : `<a class="link" href="#/bilanz?mission=1">${t('Warum?')}</a>`} 💚</p>` : ''}`}`;
}

async function chefSend(content, show) {
  const conn = aiConn();
  if (!chefProvider(conn.apiKey, conn.server, conn.sample)) return toast(t('Erst den Schlüssel eintragen'));
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
    chat.messages.push({ role: 'assistant', content: stop === 'max_tokens' ? `${text}\n\n_(${t('Die Antwort war zu lang und wurde abgeschnitten.')})_` : text });
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
  if (!text.trim() && !usePantry) return toast(t('Schreib kurz, was du da hast'));
  const veg = store.state.settings.veg;
  const content = firstMessage({ text, pantry: usePantry ? pantryForChef(items) : '', persons: chat.persons, minutes: chat.minutes, veg });
  const show = [text.trim(), usePantry && `📦 ${t('mein Vorrat')}`, tn(chat.persons, '1 Person', '{n} Personen'), chat.minutes ? t('{n} Min.', { n: chat.minutes }) : t('Zeit egal'), veg && t('vegetarisch')].filter(Boolean).join(' · ');
  chefSend(content, show);
}

function chefCookedSheet() {
  const used = usedItems(lastAnswer(), store.items());
  openSheet(`
    <h2 id="sheet-title">${t('Guten Appetit!')} 👨‍🍳</h2>
    <p class="muted small">${t('Was hast du aus dem Vorrat verbraucht? Haken weg bei allem, was noch da ist.')}</p>
    <ul class="list compact checks">${used.map((i) => `<li class="item"><label><input type="checkbox" data-use="${i.id}" checked>
      <span class="emoji">${i.emoji}</span><span class="item-text"><b>${nm(i)}</b>${i.qty > 1 ? ` <small>× ${i.qty}, ${t('1 wird ausgetragen')}</small>` : ''}</span>${badge(i)}</label></li>`).join('')}</ul>
    <button class="btn primary block" data-action="cooked">${t('Austragen')}</button>
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
  const basics = SHOP_BASICS.map((id) => byId[id]).filter((p) => p && !onList(productName(p.id)) && !restock.includes(p.name) && !inStock(p.name).length).slice(0, 10);
  view.innerHTML = `
    <section class="hero"><h1>${t('Einkaufsliste')}</h1><p>${t('Restlos warnt, wenn du etwas schon zu Hause hast.')}</p></section>
    <form class="input-row" data-form="shop">
      <input id="shop-text" type="text" autocomplete="off" autocorrect="on" spellcheck="true" enterkeyhint="send" placeholder="${esc(t('Was brauchst du?'))}" aria-label="${t('Neuer Eintrag')}">
      <button type="button" class="icon-btn mic" data-action="shop-listen" aria-label="${t('Sprechen')}">🎤</button>
      <button class="icon-btn" aria-label="${t('Hinzufügen')}">＋</button>
    </form>
    <div id="shop-suggest" class="chips"></div>
    <p id="shop-warn" class="hint" hidden></p>
    ${healthCard(list.filter((s) => !s.done).map((s) => s.name), items)}
    ${list.length ? `<ul class="list">${list.map((s) => {
      const have = inStock(s.name);
      return `<li class="item ${s.done ? 'checked' : ''}">
        <label class="item-main"><input type="checkbox" data-action="shop-toggle" data-id="${s.id}" ${s.done ? 'checked' : ''}>
          <span class="item-text"><b>${esc(s.name)}</b>${s.qty > 1 ? ` <small>× ${s.qty}</small>` : ''}
          ${have.length && !s.done ? `<small class="sub warn">${t('Noch da:')} ${have.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ''}${nm(i)} (${status(i).label})`).join(', ')}</small>` : ''}</span></label>
        <button class="done-btn ghost" data-action="shop-remove" data-id="${s.id}" aria-label="${t('Entfernen')}">✕</button>
      </li>`;
    }).join('')}</ul>
    ${done ? `<button class="btn primary block" data-action="shop-to-pantry">${tn(done, '1 abgehakte Sache in den Vorrat', '{n} abgehakte Sachen in den Vorrat')}</button>` : ''}`
    : `<section class="empty small-empty"><div class="big">🛒</div><p>${t('Noch nichts auf der Liste. Schreib oben, was du brauchst – oder tipp unten an.')}</p></section>`}
    ${restock.length ? `<h3 class="group">${t('Nachkaufen? Zuletzt aufgebraucht')}</h3>
      <div class="chips wrap">${restock.map((n) => `<button class="chip" data-action="shop-quick" data-name="${esc(n)}">＋ ${esc(pname({ name: n, pid: matchProduct(n)?.id }))}</button>`).join('')}</div>` : ''}
    <h3 class="group">${t('Oft gebraucht')}</h3>
    <div class="chips wrap">${basics.map((p) => `<button class="chip" data-action="shop-quick" data-name="${esc(productName(p.id))}">${p.emoji} ${esc(productName(p.id))}</button>`).join('')}</div>
  `;
  shopInStock = inStock;
  $('#shop-text').addEventListener('input', () => updateShopInput(inStock));
}
let shopInStock = () => [];

// Kleine Gesund-Tipps – nur Anregungen, nichts wird verboten. Ausblenden mit einem Tipp.
function healthCard(names, items) {
  if (store.state.settings.health === false || !names.length) return '';
  const tips = healthTips(names, { today: iso(), have: items.map((i) => i.pid).filter(Boolean) });
  return `<section class="card tip health">
    ${tips.map((x) => `<p>${x.icon} ${esc(x.text)}${x.add ? ` <button class="chip" data-action="shop-quick" data-name="${esc(x.add)}">＋ ${esc(x.add)}</button>` : ''}</p>`).join('')}
    <button class="link small" data-action="health">${t('Tipps ausblenden')}</button>
  </section>`;
}

// ---------- Teilen ----------
function renderTeilen() {
  const items = store.items();
  const offered = items.filter((i) => i.offered);
  // Rohes Fleisch, Geflügel und Fisch (Verbrauchsdatum) gibt man nicht weiter – wie bei foodsharing.
  const candidates = items.filter((i) => !i.offered && daysLeft(i) >= 0 && !(i.pid && byId[i.pid]?.vd));
  const flat = store.state.settings.flat;
  view.innerHTML = `
    <section class="hero"><h1>${t('Im Hausflur teilen')}</h1><p>${t('Was du nicht mehr schaffst, freut die Nachbarn. Teile es in der Haus-Gruppe oder häng einen Aushang auf.')}</p></section>
    ${neighborsLive(CONFIG) ? `<a class="card chef-entry" href="#/nachbarn"><span class="emoji">🏘️</span><span><b>${t('Nachbarschafts-Börse')}</b><small>${t('Essen in deiner Straße verschenken und offen darüber schreiben – ohne Telefonnummer')}</small></span></a>` : ''}
    <label class="field">${t('Abholen bei (Name an der Klingel, Etage)')}
      <input type="text" value="${esc(flat)}" data-setting="flat" placeholder="${esc(t('z. B. Müller, 3. OG links'))}"></label>
    ${offered.length ? `<h3 class="group">${t('Angeboten')}</h3><ul class="list">${offered.map((i) => `<li class="item">
      <span class="item-main static"><span class="emoji">${i.emoji}</span><span class="item-text"><b>${nm(i)}</b>${i.qty > 1 ? ` <small>× ${i.qty}</small>` : ''}<small class="sub">${t('gut bis {date}', { date: dateLabel(i.expires) })}</small></span></span>
      <button class="btn small primary" data-action="consume" data-id="${i.id}" data-how="shared">${t('Abgeholt')}</button></li>`).join('')}</ul>
      <div class="row-btns"><button class="btn" data-action="share-offered">📲 ${t('Nochmal teilen')}</button><button class="btn" data-action="poster">🖨 ${t('Aushang drucken')}</button></div>` : ''}
    <h3 class="group">${t('Was möchtest du anbieten?')}</h3>
    ${candidates.length ? `<ul class="list compact checks">${candidates.map((i) => `<li class="item"><label>
      <input type="checkbox" data-offer="${i.id}" ${daysLeft(i) <= 3 ? 'checked' : ''}>
      <span class="emoji">${i.emoji}</span><span class="item-text"><b>${nm(i)}</b>${i.qty > 1 ? ` <small>× ${i.qty}</small>` : ''}</span>${badge(i)}</label></li>`).join('')}</ul>
      <div class="row-btns"><button class="btn primary" data-action="share">📲 ${t('In Haus-Gruppe teilen')}</button><button class="btn" data-action="poster-new">🖨 ${t('Aushang')}</button></div>
      <p class="muted small">${t('Fleisch, Fisch und Geflügel nach Verbrauchsdatum bitte nicht weitergeben. Angebrochenes nur, wenn du es selbst noch essen würdest.')}</p>`
    : `<p class="muted center">${t('Gerade nichts zum Verschenken.')}</p>`}
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
    <section class="hero"><h1>${t('Deine Bilanz')}</h1><p>${t('Letzte 30 Tage')}</p></section>
    ${s.rate === null ? `<p class="muted center">${t('Sobald du Sachen als aufgebraucht, verschenkt oder weggeworfen markierst, siehst du hier, wie viel du rettest.')}</p>` : `
    <section class="card stat-hero">
      <div class="ring" style="--p:${rate}"><span>${rate}%</span></div>
      <div><b>${t('gerettet statt weggeworfen')}</b><p class="muted small">${t('{saved} gegessen oder verschenkt, {wasted} im Müll', { saved: s.saved, wasted: s.wasted })}</p></div>
    </section>
    <div class="stats">
      <div class="card stat"><b>${euro(s.wastedEuro)}</b><small>${t('im Müll gelandet')}</small></div>
      <div class="card stat"><b>${kg(s.wastedCo2)}</b><small>${t('CO₂ dadurch verschwendet')}</small></div>
      <div class="card stat"><b>${s.shared}</b><small>${t('an Nachbarn verschenkt')}</small></div>
      <div class="card stat"><b>${kg(all.savedCo2)}</b><small>${t('CO₂ insgesamt gerettet')}</small></div>
    </div>
    ${s.topWasted.length ? `<section class="card tip">💡 ${t('Am häufigsten weggeworfen:')} <b>${s.topWasted.map(([n, c]) => `${esc(pname({ name: n, pid: matchProduct(n)?.id }))} (${c}×)`).join(', ')}</b>. ${t('Kleinere Packungen kaufen oder direkt nach dem Einkauf einen Teil einfrieren?')}</section>` : ''}`}
    ${missionCard(s.rate === null ? null : s)}
    ${installed() ? '' : `
    <h3 class="group">${t('App')}</h3>
    <div class="card settings">
      <button class="set" data-action="install"><span>📲</span><span><b>${t('Restlos installieren')}</b><small>${t('Auf Handy oder Computer – startet dann wie eine normale App, auch offline')}</small></span></button>
    </div>`}
    <h3 class="group">${t('Sprache')}</h3>
    <div class="card settings">
      <button class="set" data-action="language"><span>🌐</span><span><b>${LANGS[lang].name}</b><small>${t('Sprache der App ändern')}</small></span></button>
    </div>
    <h3 class="group">${t('Erinnerungen')}</h3>
    <div class="card settings">
      <button class="set" data-action="calendar"><span>📅</span><span><b>${t('In den Kalender eintragen')}</b><small>${t('Erinnerung am Vorabend für alles, was in den nächsten 3 Wochen abläuft')}</small></span></button>
      ${notif !== 'unsupported' ? `<button class="set" data-action="notify"><span>🔔</span><span><b>${t(remindOn() ? 'Erinnerungen sind an' : 'Erinnerungen einschalten')}</b><small>${t(remindOn() ? 'Höchstens eine am Tag, 2 Tage bevor etwas abläuft · antippen zum Ausschalten' : notif === 'denied' ? 'Mitteilungen sind im Browser gesperrt – dort erlauben' : 'Höchstens eine Mitteilung am Tag, 2 Tage bevor etwas abläuft')}</small></span></button>` : ''}
    </div>
    <h3 class="group">${t('Einkaufen')}</h3>
    <div class="card settings">
      <button class="set" data-action="health"><span>🥗</span><span><b>${t(store.state.settings.health === false ? 'Gesund-Tipps einschalten' : 'Gesund-Tipps sind an')}</b><small>${t('Kleine Anregungen auf der Einkaufsliste – nie ein Verbot')}</small></span></button>
      <button class="set" data-action="home-guide"><span>📲</span><span><b>${t('Startbildschirm, Widget und Apple Pay')}</b><small>${t('Einkaufsliste mit einem Tipp öffnen, nach dem Bezahlen an den Bon erinnern')}</small></span></button>
    </div>
    <h3 class="group">${t('KI-Koch')}</h3>
    <div class="card settings">
      ${store.state.settings.aiKey
    ? `<button class="set" data-action="chef-key-remove"><span>🔑</span><span><b>${t('API-Schlüssel entfernen')}</b><small>${t('Gespeichert: …{end} · nur auf diesem Gerät, nicht in der Sicherung', { end: esc(store.state.settings.aiKey.slice(-4)) })}</small></span></button>`
    : CONFIG.chefServer || CONFIG.appKey ? `<a class="set" href="#/koch"><span>👨‍🍳</span><span><b>${t('KI-Koch ist an')}</b><small>${t('Kostenlos, ohne Einrichtung – Koch und Bon-Erkennung')}</small></span></a>`
      : `<a class="set" href="#/koch"><span>🔑</span><span><b>${t('KI-Koch einrichten')}</b><small>${t('Kostenlosen Gemini-Schlüssel eintragen')}</small></span></a>`}
    </div>
    <h3 class="group">${t('Daten')}</h3>
    <div class="card settings">
      <button class="set" data-action="export"><span>💾</span><span><b>${t('Sicherung speichern')}</b><small>${t('Alles bleibt auf diesem Gerät – hier als Datei sichern')}</small></span></button>
      <button class="set" data-action="import"><span>📂</span><span><b>${t('Sicherung laden')}</b><small>${t('z. B. auf einem neuen Handy')}</small></span></button>
      ${store.hasDemo()
    ? `<button class="set" data-action="demo-remove"><span>🧪</span><span><b>${t('Beispiel-Vorrat entfernen')}</b></span></button>`
    : `<button class="set" data-action="demo"><span>🧪</span><span><b>${t('Beispiel-Vorrat laden')}</b><small>${t('Zum Ausprobieren')}</small></span></button>`}
      <button class="set danger" data-action="reset"><span>🗑</span><span><b>${t('Alles löschen')}</b></span></button>
    </div>
    <p class="muted small center">${t('Restlos · kostenlos und werbefrei · Haltbarkeiten und CO₂-Werte sind Schätzungen.')}</p>
  `;
}

// ---------- Startbildschirm, Widget, Apple Pay ----------
// Echte Widgets erlauben iPhone und Android für Web-Apps nicht, Windows schon (manifest.webmanifest → widgets).
// Apple Pay sieht eine Web-App nicht – das iPhone selbst kann aber nach jeder Zahlung erinnern (Kurzbefehle).
function homeSheet() {
  openSheet(`
    <h2 id="sheet-title">${t('Startbildschirm, Widget und Apple Pay')}</h2>
    <div class="guide">
      <h3>💳 ${t('Nach Apple Pay an den Bon erinnern (iPhone)')}</h3>
      <ol>
        <li>${t('App <b>Kurzbefehle</b> öffnen → <b>Automation</b> → <b>＋</b>.')}</li>
        <li>${t('<b>Wallet</b> wählen, deine Karte antippen, bei Kategorien z. B. <b>Lebensmittel</b>.')}</li>
        <li>${t('<b>Sofort ausführen</b> wählen, dann <b>Weiter</b>.')}</li>
        <li>${t('Aktion <b>Mitteilung anzeigen</b> mit dem Text:')} <b>${t('🧾 Kassenbon fotografiert? Kurz in Restlos scannen.')}</b></li>
      </ol>
      <p class="muted small">${t('Dann kommt nach jedem Bezahlen im Supermarkt eine kleine Mitteilung. Apple gibt Zahlungen nicht an Web-Apps weiter – darum geht es nur so.')}</p>
      <h3>🤖 ${t('Android')}</h3>
      <p>${t('Restlos installieren, dann das App-Symbol lange drücken: <b>Scannen</b>, <b>Einkauf</b> und <b>Rezepte</b> lassen sich als eigene Symbole auf den Startbildschirm ziehen.')}</p>
      <h3>🍏 ${t('iPhone und iPad')}</h3>
      <p>${t('In Safari: Teilen → <b>Zum Home-Bildschirm</b>. Widgets erlaubt Apple für Web-Apps leider nicht.')}</p>
      <h3>🪟 ${t('Windows')}</h3>
      <p>${t('Restlos in Edge installieren, dann <b>Windows-Taste + W</b> und das Widget <b>Restlos</b> hinzufügen. Es zeigt die Einkaufsliste und was bald abläuft.')}</p>
    </div>
    ${installed() ? '' : `<button class="btn primary block" data-action="install">📲 ${t('Restlos installieren')}</button>`}
  `);
}

// ---------- Installieren ----------
// Android und Chrome/Edge am Computer bieten einen eigenen Dialog an; iPhone und Safari nur über das Teilen-Menü.
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; toast(t('Restlos ist installiert 🎉')); render(); });
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
    <h2 id="sheet-title">${t('Restlos installieren')}</h2>
    ${ios ? `<ol class="steps">
      <li>${t('Diese Seite in <b>Safari</b> öffnen.')}</li>
      <li>${t('Unten auf <b>Teilen</b> tippen (Quadrat mit Pfeil nach oben).')}</li>
      <li>${t('<b>„Zum Home-Bildschirm“</b> wählen und <b>Hinzufügen</b> tippen.')}</li></ol>`
    : `<h3>Android</h3><ol class="steps"><li>${t('In <b>Chrome</b> oben rechts auf <b>⋮</b> tippen.')}</li><li>${t('<b>„App installieren“</b> oder „Zum Startbildschirm hinzufügen“ wählen.')}</li></ol>
      <h3>${t('Computer')}</h3><ol class="steps"><li>${t('In <b>Chrome</b> oder <b>Edge</b> rechts in der Adressleiste auf das Installieren-Symbol (Bildschirm mit Pfeil) klicken.')}</li><li>${t('Oder im Menü <b>⋮ → „Restlos installieren“</b>. Am Mac in Safari: <b>Ablage → „Zum Dock hinzufügen“</b>.')}</li></ol>`}
    <p class="muted small">${t('Danach startet Restlos wie eine normale App, auch ohne Internet. Deine Daten bleiben auf dem Gerät.')}</p>
  `);
}

// ---------- Beispiel-Vorrat ----------
function loadDemo() {
  const today = iso();
  const demo = [['Joghurt', 1, 0], ['Milch', 1, 2], ['Brot', 1, 1], ['Bananen', 4, 1], ['Zucchini', 2, 3], ['Paprika', 2, 4], ['Eier', 6, 12],
    ['Gouda', 1, 9], ['Hackfleisch', 1, 1], ['Spinat', 1, 0], ['Nudeln', 2, 300], ['Kartoffeln', 1, 20], ['Zwiebeln', 1, 25], ['Äpfel', 6, 14], ['Tomaten', 4, 2], ['Kidney Bohnen', 1, 400]];
  store.add(demo.map(([name, qty, d]) => ({ name, qty, expires: addDays(today, d), bought: addDays(today, -2) })), 'demo');
  const log = [['Salat', 'gemuese', 'wasted', 1.29, 3], ['Joghurt', 'milch', 'used', 0.89, 5], ['Brot', 'brot', 'used', 2.49, 6], ['Bananen', 'obst', 'shared', 1.49, 8], ['Milch', 'milch', 'used', 1.19, 9], ['Salat', 'gemuese', 'wasted', 1.29, 12], ['Käse', 'kaese', 'used', 2.29, 15]];
  for (const [name, cat, action, price, ago] of log) store.state.log.push({ id: `d${ago}`, name, pid: matchProduct(name)?.id, cat, qty: 1, price, action, date: addDays(today, -ago), demo: true });
  store.setting('demo', true);
  toast(t('Beispiel-Vorrat geladen'));
}

// ---------- Aktionen ----------
const actions = {
  add: (el) => addSheet(!!el.dataset.voice),
  scan: () => startScan(),
  demo: () => { closeSheet(); loadDemo(); location.hash = '#/vorrat'; },
  'demo-remove': () => { store.removeDemo(); placeFilter = 'alle'; toast(t('Beispiel-Vorrat entfernt')); },
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
    toast(t('{name} eingefroren – hält jetzt bis {date}', { name: pname(i), date: dateLabel(store.find(i.id).expires) }));
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
    toast(added.length === 1 ? t('{name} hinzugefügt', { name: pname(added[0]) }) : t('{n} Sachen hinzugefügt', { n: added.length }), () => added.forEach((i) => store.consume(i.id, 'removed')));
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
  'to-list': (el) => { el.dataset.names.split('|').forEach((n) => store.addShopping(n)); toast(t('Auf der Einkaufsliste')); el.remove(); },
  cooked: () => {
    const ids = [...sheet.querySelectorAll('[data-use]:checked')].map((c) => c.dataset.use);
    const undos = ids.map((id) => store.consume(id, 'used', 1)).filter(Boolean);
    closeSheet();
    toast(`${t('Guten Appetit!')} ${tn(ids.length, '1 Sache gerettet 🌱', '{n} Sachen gerettet 🌱')}`, () => undos.reverse().forEach((u) => u()));
  },
  install,
  'donate-amount': (el) => { const f = $('#donate-free'); if (f) f.value = ''; setDonate(+el.dataset.v); },
  'donate-paypal': () => {
    if (!(donateAmount >= 1 && donateAmount <= 500)) return toast(t('Bitte einen Betrag zwischen 1 und 500 € eingeben'));
    const u = new URL(paypalUrl);
    u.searchParams.set('amount', donateAmount.toFixed(2));
    window.open(u, '_blank', 'noopener');
  },
  'donate-card': () => window.open(cardUrl, '_blank', 'noopener'),
  'milestone-ok': (el) => store.setting('milestone', +el.dataset.m),
  mission: (el) => { store.setting('milestone', Math.max(store.state.settings.milestone || 0, +el.dataset.m)); location.hash = '#/bilanz?mission=1'; },
  // Retten & neue Ideen
  rescue: () => rescueSheet(),
  'rescue-chef': (el) => { const i = store.find(el.dataset.id); if (i) chefWith(rescueText(i), `🌱 ${t('{name} retten', { name: pname(i) })}`); },
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
  'chef-idea': (el) => chefSend(`Mach mir lieber „${el.dataset.idea}“ – bitte als vollständiges Rezept.`, t('Lieber: {name}', { name: el.dataset.idea })),
  'chef-cooked': chefCookedSheet,
  'chef-pantry': () => { chat.pantry = !chat.pantry; render(); },
  'chef-persons': (el) => { chat.persons = +el.dataset.v; render(); },
  'chef-minutes': (el) => { chat.minutes = +el.dataset.v; render(); },
  'chef-listen': (el) => listen($('#chef-text'), () => { chat.draft = $('#chef-text').value; }, el),
  'chef-key-remove': () => { if (confirm(t('API-Schlüssel von diesem Gerät entfernen?'))) { store.setting('aiKey', ''); toast(t('Schlüssel entfernt')); } },
  // Einkauf
  'shop-toggle': (el) => store.toggleShopping(el.dataset.id),
  'shop-remove': (el) => store.removeShopping(el.dataset.id),
  'shop-listen': (el) => listen($('#shop-text'), () => updateShopInput(shopInStock), el),
  // Vorschlag antippen: das angefangene Wort wird ersetzt und die Sache gleich auf die Liste gesetzt.
  'shop-complete': (el) => {
    const input = $('#shop-text');
    const parts = input.value.split(/(,|،|\bund\b|\band\b)/);
    const qty = parseInt(parts.at(-1).trim(), 10) || 1;
    parts.pop();
    const rest = parts.join('').replace(/(,|،|\bund\b|\band\b)\s*$/, '').trim();
    store.addShopping(el.dataset.name, qty);
    for (const x of parseFreeText(rest)) store.addShopping(fixName(x.name), x.qty);
    $('#shop-text')?.focus();
  },
  'shop-quick': (el) => { store.addShopping(el.dataset.name); toast(t('{name} auf der Liste', { name: el.dataset.name })); },
  'shop-to-pantry': () => { const added = store.shoppingToPantry(); toast(tn(added.length, '1 Sache in den Vorrat übernommen', '{n} Sachen in den Vorrat übernommen')); },
  // Teilen
  share: async () => {
    const items = selectedOffers();
    if (!items.length) return toast(t('Erst etwas auswählen'));
    items.forEach((i) => store.update(i.id, { offered: iso() }));
    const how = await shareItems(items, store.state.settings.flat);
    if (how === 'copied') toast(t('Text kopiert – jetzt in die Haus-Gruppe einfügen'));
  },
  'share-offered': async () => {
    const how = await shareItems(store.items().filter((i) => i.offered), store.state.settings.flat);
    if (how === 'copied') toast(t('Text kopiert'));
  },
  poster: () => printPoster(store.items().filter((i) => i.offered), store.state.settings.flat) || toast(t('Bitte Pop-ups erlauben')),
  'poster-new': () => {
    const items = selectedOffers();
    if (!items.length) return toast(t('Erst etwas auswählen'));
    items.forEach((i) => store.update(i.id, { offered: iso() }));
    printPoster(items, store.state.settings.flat) || toast(t('Bitte Pop-ups erlauben'));
  },
  // Einstellungen
  calendar: () => {
    const ics = calendarFile(store.items());
    if (!ics) return toast(t('In den nächsten 3 Wochen läuft nichts ab'));
    download(ics, 'restlos-erinnerungen.ics', 'text/calendar');
  },
  notify: async () => {
    if (!('Notification' in window)) return toast(t('Dieser Browser kann keine Mitteilungen – nutze den Kalender'));
    if (Notification.permission === 'granted' && store.state.settings.remind !== false) {
      store.setting('remind', false);
      syncReminders();
      return toast(t('Erinnerungen aus'));
    }
    const r = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (r !== 'granted') { render(); return toast(t('Mitteilungen wurden nicht erlaubt – in den Einstellungen des Browsers änderbar')); }
    store.setting('remind', true);
    syncReminders();
    const bg = await backgroundReminders();
    toast(t(bg ? 'Erinnerungen an – höchstens eine am Tag' : 'Erinnerungen an – kommen, wenn du Restlos öffnest'));
  },
  export: () => download(store.exportJson(), `restlos-sicherung-${iso()}.json`, 'application/json'),
  import: () => $('#backup').click(),
  reset: () => { if (confirm(t('Wirklich alles löschen? Vorrat, Einkaufsliste und Bilanz.'))) { store.reset(); toast(t('Alles gelöscht')); } },
  language: () => languageSheet(),
  reload: () => location.reload(),
  health: () => { const on = store.state.settings.health === false; store.setting('health', on); toast(t(on ? 'Gesund-Tipps sind an' : 'Gesund-Tipps ausgeblendet')); },
  'home-guide': () => homeSheet(),
  'set-lang': (el) => {
    if (el.dataset.lang === lang) return closeSheet();
    saveLang(el.dataset.lang);
    location.reload();
  },
};

// ---------- Sprache ----------
// Jede Sprache in ihrer eigenen Schrift, damit man sie auch erkennt, wenn man die aktuelle nicht lesen kann.
function languageSheet() {
  openSheet(`
    <h2 id="sheet-title">🌐 ${t('Sprache')}</h2>
    <div class="lang-list">${Object.entries(LANGS).map(([code, l]) => `<button class="lang-btn ${code === lang ? 'on' : ''}" data-action="set-lang" data-lang="${code}" lang="${code}" dir="${l.dir || 'ltr'}" aria-pressed="${code === lang}">
      <b>${l.name}</b>${code === lang ? '<span aria-hidden="true">✓</span>' : ''}</button>`).join('')}</div>
    <p class="muted small">${t('Der KI-Koch antwortet in der gewählten Sprache.')}</p>
  `);
}

function consume(id, how, qty) {
  const i = store.find(id);
  if (!i) return;
  const undo = store.consume(id, how, qty);
  const name = pname(i);
  const msg = { used: t('{name} aufgebraucht 👍', { name }), wasted: t('{name} weggeworfen', { name }), shared: t('{name} verschenkt – danke! 🤝', { name }), removed: t('{name} gelöscht', { name }) }[how];
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
    if (!key) return toast(t('Bitte den Schlüssel einfügen'));
    store.setting('aiKey', key);
    toast(t('Gespeichert – der Koch ist bereit'));
    return;
  }
  if (form !== 'shop') return;
  e.preventDefault();
  const input = $('#shop-text');
  const text = input.value;
  input.value = '';
  const fixed = [];
  for (const x of parseFreeText(text)) {
    const name = fixName(x.name);
    if (name !== x.name) fixed.push([x.name, name]);
    store.addShopping(name, x.qty);
  }
  $('#shop-text')?.focus();
  // Korrigiert wird nur bei klaren Tippfehlern – und es lässt sich zurücknehmen.
  if (fixed.length) toast(`✏️ ${fixed.map(([a, b]) => `${a} → ${b}`).join(', ')}`, () => fixed.forEach(([a, b]) => store.renameShopping(b, a)));
});

// Klarer Tippfehler bei einem bekannten Lebensmittel? Dann den richtigen Namen nehmen („Jogurt“ → Joghurt).
function fixName(name) {
  const p = correctProduct(name);
  return p ? productName(p.id) : name;
}

// Eigener Betrag zum Unterstützen: sofort übernehmen, Komma oder Punkt.
document.addEventListener('input', (e) => {
  if (e.target.id !== 'donate-free') return;
  const v = Math.round(parseFloat(e.target.value.replace(',', '.')) * 100) / 100;
  setDonate(v > 0 ? v : 5);
  if (!(v > 0)) document.querySelectorAll('[data-action="donate-amount"]').forEach((b) => b.classList.toggle('on', +b.dataset.v === 5));
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
  try { store.importJson(await f.text()); toast(t('Sicherung geladen')); } catch (err) { toast(t('Konnte die Datei nicht lesen: {error}', { error: err.message })); }
});

// ---------- Navigation ----------
const ROUTES = { vorrat: renderVorrat, rezepte: renderRezepte, koch: renderKoch, einkauf: renderEinkauf, teilen: renderTeilen, nachbarn: renderNachbarn, bilanz: renderBilanz };
const current = () => location.hash.replace('#/', '').split('?')[0] || 'vorrat';

function render() {
  try { draw(); } catch (e) {
    // Lieber ein Knopf als eine weiße Seite.
    console.error(e);
    view.innerHTML = `<section class="empty"><div class="big">🔄</div><p>${t('Hier ist etwas schiefgelaufen.')}</p><button class="btn primary" data-action="reload">↻ ${t('Neu laden')}</button></section>`;
  }
}

function draw() {
  const route = ROUTES[current()] ? current() : 'vorrat';
  // Eingaben nicht beim Tippen wegrendern (z. B. Klingelschild)
  const active = document.activeElement;
  const keep = active?.dataset?.setting ? active.dataset.setting : null;
  view.dataset.route = route;
  ROUTES[route]();
  if (keep) view.querySelector(`[data-setting="${keep}"]`)?.focus();
  const tab = { koch: 'rezepte', nachbarn: 'teilen' }[route] || route;
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  const shopCount = store.state.shopping.filter((s) => !s.done).length;
  $('#tabs [data-tab="einkauf"]').dataset.count = shopCount || '';
  // Link „Warum es Restlos gibt“ (…#/bilanz?mission=1): sanft zur Karte scrollen.
  if (location.hash.includes('mission=1')) {
    history.replaceState(null, '', '#/bilanz');
    setTimeout(() => $('#mission')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }
}

// Nachbarschafts-Börse (js/nachbarn.js): Vorschläge aus dem Vorrat – nichts nach Verbrauchsdatum, nichts Abgelaufenes.
initNachbarn({
  view, esc, toast, openSheet, closeSheet, aiConn, config: CONFIG,
  active: () => current() === 'nachbarn',
  offerable: () => store.items()
    .filter((i) => daysLeft(i) >= 0 && !(i.pid && byId[i.pid]?.vd))
    .sort((a, b) => (b.offered ? 1 : 0) - (a.offered ? 1 : 0) || daysLeft(a) - daysLeft(b))
    .map((i) => ({ name: i.name, emoji: i.emoji, title: `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`, body: `Gut bis ${dateLabel(i.expires)} – wer mag es haben?` })),
});

let lastRoute = current();
window.addEventListener('hashchange', () => {
  render();
  if (current() !== lastRoute) { window.scrollTo(0, 0); lastRoute = current(); }
});
store.subscribe(render);

// ---------- Erinnerungen ----------
// Sparsam: höchstens eine am Tag, gebündelt, jede Sache nur einmal (rescue.js).
// Im Hintergrund verschickt sie der Service Worker (sw.js) – dafür legt die App einen fertigen Fahrplan
// in den Cache, denn localStorage kann der Service Worker nicht lesen. Das klappt nur, wo der Browser
// regelmäßige Hintergrund-Aufgaben erlaubt (installierte App in Chrome/Edge). Sonst erinnert Restlos beim Öffnen.
const REMIND_CACHE = 'restlos-erinnerung';
const REMIND_FILE = 'erinnerung.json';
function remindOn() { return 'Notification' in window && Notification.permission === 'granted' && store.state.settings.remind !== false; }
function remindAsk() { return 'Notification' in window && Notification.permission === 'default' && store.state.settings.remind !== false; }

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
    await syncWidget(items);
  }, 400);
}

// Widget (Windows): Der Service Worker liest die fertigen Texte aus dem Cache und füllt damit das Widget.
async function syncWidget(items) {
  const open = store.state.shopping.filter((s) => !s.done);
  const due = items.filter((i) => daysLeft(i) <= 2 && !i.offered);
  const data = {
    shopTitle: `🛒 ${t('Einkaufsliste')}`,
    shop: (open.length ? open.slice(0, 8).map((s) => `• ${s.qty > 1 ? `${s.qty}× ` : ''}${s.name}`) : [t('Alles erledigt')]).map((text) => ({ text })),
    dueTitle: `⏰ ${t('Bald weg')}`,
    due: (due.length ? due.slice(0, 5).map((i) => `• ${pname(i)} (${status(i).label})`) : [t('alles im grünen Bereich')]).map((text) => ({ text })),
    open: t('Öffnen'),
  };
  try {
    await (await caches.open(REMIND_CACHE)).put('widget.json', new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }));
    navigator.serviceWorker?.controller?.postMessage('widget');
  } catch { /* egal */ }
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
  toast(`⏰ ${plan.title}`, () => rescueSheet(), t('Retten-Ideen'));
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
  // Neue Version da? Dann einmal neu laden – so reicht ein Öffnen, nicht zweimal Schließen.
  const updating = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updating || reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
}
// Erst jetzt zeichnen: Alles oben ist definiert. (Früher lief das mittendrin – mit Sachen, die bald ablaufen,
// fehlten dann noch die Erinnerungs-Helfer, und Vorrat oder Bilanz blieben beim Start leer.)
render();
window.restlosReady = true;
initWaterlevel();
try { sessionStorage.removeItem('restlos:retry'); } catch { /* privater Modus */ }
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
