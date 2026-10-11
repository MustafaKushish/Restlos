// Nachbarschafts-Börse: Essen an Nachbarn verschenken und offen darüber schreiben.
// Hier steht nur die reine Logik (ohne Oberfläche und ohne Netz), damit sie sich testen lässt:
// Datenschutz-Prüfung der Texte, Ordnen nach Stadt und Straße, Aufräum-Fristen und der KI-Koch als Aufpasser.
//
// Grundsätze: freiwillig, alles öffentlich für die Stadt (keine privaten Nachrichten), nur Stadt und Straße
// (keine Hausnummer), keine Telefonnummern, E-Mails oder Links, alte Beiträge verschwinden von selbst.
import { t } from './i18n.js';

export const OFFER_DAYS = 3; // Angebote verschwinden nach 3 Tagen
export const MESSAGE_DAYS = 7; // Chat-Nachrichten nach 7 Tagen
export const LIMITS = { title: 80, body: 500, nickname: 30, city: 60, street: 60 };
// Anzeige über t() (i18n.js) – die Werte sind die deutschen Texte.
export const STATUS = { offen: 'zu verschenken', reserviert: 'reserviert', vergeben: 'vergeben' };

// ---------- Stadt und Straße ----------
const clean = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const cap = (w) => (w ? w[0].toLocaleUpperCase('de-DE') + w.slice(1) : w);

// „  berlin “ → „Berlin“, „frankfurt am main“ → „Frankfurt am Main“
export function normCity(s) {
  return clean(s).slice(0, LIMITS.city).split(' ')
    .map((w, i) => (i > 0 && /^(am|an|im|in|ob|der|die|den|bei|vor|auf)$/i.test(w) ? w.toLowerCase() : w.split('-').map(cap).join('-')))
    .join(' ');
}

// „hauptstr. 12“ → „Hauptstraße“ – Hausnummern fallen weg, damit niemand die genaue Adresse verrät.
export function normStreet(s) {
  const t = clean(s)
    .replace(/\s*\d+\s*[a-z]?(?:\s*[-/,]\s*\d*\s*[a-z]?)*$/i, '') // Hausnummer am Ende (12, 3a, 4/2, 5-7)
    .replace(/(str)\.?$/i, '$1aße')
    .replace(/(str)\.?\s/i, '$1aße ')
    .trim()
    .slice(0, LIMITS.street);
  return t.split(' ').map((w) => (/^(am|an|im|in|der|die|den|des|dem|zum|zur|auf|vor|unter|hinter|von)$/i.test(w) ? w.toLowerCase() : w.split('-').map(cap).join('-'))).join(' ')
    .replace(/^./, (c) => c.toLocaleUpperCase('de-DE'));
}

// ---------- Datenschutz-Prüfung ----------
// Dieselben Regeln prüft auch die Datenbank (supabase/schema.sql), damit sie sich nicht umgehen lassen.
const PHONE = /(?:\+|\b00)?\d(?:[\s\-/.()]*\d){6,}/; // 7 und mehr Ziffern, auch mit Leerzeichen dazwischen
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const LINK = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:de|com|net|org|eu|me|io|info|at|ch)\b/i;
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,}/i;
const MESSENGER = /\b(?:whats\s?app|telegram|signal|insta(?:gram)?|snap(?:chat)?|tiktok)\b/i;
const DATE = /\b\d{1,2}\.\d{1,2}\.(?:\d{2,4})?|\b\d{1,2}:\d{2}\b/g; // „12.10.2026“, „18:30“ sind keine Telefonnummern
const MONEY = /\d+\s*(?:€|eur\b|euro\b)|(?:€|eur)\s*\d/i;

export const PROBLEMS = {
  phone: 'Bitte keine Telefonnummern. Verabredet euch hier im Chat – das schützt dich.',
  email: 'Bitte keine E-Mail-Adressen. Alles läuft offen hier im Chat.',
  link: 'Bitte keine Links. So bleibt der Chat sicher vor Werbung und Betrug.',
  iban: 'Bitte keine Kontodaten. Hier wird verschenkt, nicht bezahlt.',
  messenger: 'Bitte nicht zu WhatsApp & Co. wechseln – hier bleibt alles offen und sicher.',
  money: 'Hier wird nur verschenkt. Bitte keine Preise.',
  empty: 'Bitte etwas schreiben.',
  long: 'Bitte kürzer (höchstens {n} Zeichen).',
};

// Gibt die Gründe zurück, warum ein Text so nicht in den Chat darf (leer = alles gut).
export function checkText(text, { max = LIMITS.body } = {}) {
  const t = clean(text);
  if (!t) return ['empty'];
  const out = [];
  if (t.length > max) out.push('long');
  if (IBAN.test(t)) out.push('iban');
  else if (PHONE.test(t.replace(DATE, ' – '))) out.push('phone');
  if (EMAIL.test(t)) out.push('email');
  else if (LINK.test(t)) out.push('link');
  if (MESSENGER.test(t)) out.push('messenger');
  if (MONEY.test(t)) out.push('money');
  return out;
}

export const problemText = (reasons) => reasons.map((r) => (PROBLEMS[r] ? t(PROBLEMS[r], { n: LIMITS.body }) : r)).join(' ');

// Spitzname: kurz, ohne Ziffernfolgen und ohne Kontaktdaten. Leer → „Nachbar:in“.
export function cleanNickname(s) {
  const t = clean(s).replace(/\d{3,}/g, '').replace(/[@<>]/g, '').slice(0, LIMITS.nickname).trim();
  return t || 'Nachbar:in';
}

// ---------- Ordnen ----------
export const daysAfter = (iso, days) => new Date(new Date(iso).getTime() + days * 864e5).toISOString();
export const expiresFor = (kind, now = new Date()) => daysAfter(now.toISOString(), kind === 'angebot' ? OFFER_DAYS : MESSAGE_DAYS);

// Was man sehen darf: nicht abgelaufen, nicht ausgeblendet, nicht von Leuten, die man blockiert hat.
export function visible(posts, { blocked = [], now = new Date() } = {}) {
  const b = new Set(blocked);
  return posts.filter((p) => !p.hidden && new Date(p.expires_at) > now && !b.has(p.user_id));
}

// Angebote nach Straße gruppieren: Straßen alphabetisch, darin das Neueste zuerst; Vergebenes ans Ende.
export function byStreet(offers) {
  const rank = { offen: 0, reserviert: 1, vergeben: 2 };
  const groups = new Map();
  for (const o of offers) {
    const k = o.street || 'Ohne Straße';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'de'))
    .map(([street, list]) => ({
      street,
      offers: list.sort((x, y) => (rank[x.status] ?? 0) - (rank[y.status] ?? 0) || y.created_at.localeCompare(x.created_at)),
    }));
}

// „vor 5 Min.“, „vor 2 Std.“, „gestern“
export function ago(iso, now = new Date()) {
  const min = Math.max(0, Math.round((now - new Date(iso)) / 6e4));
  if (min < 1) return t('gerade eben');
  if (min < 60) return t('vor {n} Min.', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('vor {n} Std.', { n: h });
  const d = Math.round(h / 24);
  return d === 1 ? t('gestern') : t('vor {n} Tagen', { n: d });
}

// ---------- KI-Koch als Aufpasser ----------
// Bevor etwas in den Chat geht, liest der Koch kurz mit: Passt der Ton? Schaukelt sich gerade etwas hoch?
// Er entscheidet „ok“, „hinweis“ (freundlich bremsen, man darf trotzdem senden) oder „stopp“ (geht so nicht raus).
export const MODERATOR = `Du bist der Koch der App „Restlos“ und passt freundlich auf den Nachbarschafts-Chat auf. Dort verschenken Nachbarn Essen und verabreden die Übergabe. Der Chat ist öffentlich für die ganze Stadt.

Prüfe die NEUE Nachricht (und den bisherigen Verlauf als Zusammenhang) und antworte NUR mit JSON:
{"verdict":"ok"|"hinweis"|"stopp","grund":"kurzer Satz an die schreibende Person, freundlich, du-Form","vorschlag":"bessere Formulierung oder leer"}

- "stopp": Beleidigung, Drohung, Hetze, Belästigung, sexuelle Inhalte, Verkauf statt Verschenken, Werbung, Betrugsversuch, Weitergabe privater Daten (Telefon, Adresse mit Hausnummer, Kontodaten), gefährliche Lebensmittel (z. B. rohes Fleisch, Fisch oder Geflügel nach Verbrauchsdatum, Alkohol an Minderjährige, Medikamente).
- "hinweis": gereizter Ton, Streit schaukelt sich hoch, Vorwürfe, Drängeln, Themen weit weg vom Teilen von Essen. Schlage eine ruhige, freundliche Formulierung vor.
- "ok": alles andere. Im Zweifel "ok" – sei nicht kleinlich, kurze Nachrichten wie "Ist noch da?" sind ok.
Schreibe "grund" und "vorschlag" in der Sprache der Nachricht.`;

export function moderationMessages(text, recent = []) {
  const ctx = recent.slice(-6).map((m) => `${m.nickname || 'Nachbar:in'}: ${m.body}`).join('\n');
  return [{ role: 'user', content: `${ctx ? `Bisheriger Verlauf:\n${ctx}\n\n` : ''}NEUE Nachricht:\n${text}` }];
}

// Gemini-Anfrage (kurz, kühl, JSON). Wird von der App und vom Koch-Server (worker/koch.js) gleich gebaut.
export function moderationRequest(messages) {
  return {
    systemInstruction: { parts: [{ text: MODERATOR }] },
    contents: messages.map((m) => ({ role: 'user', parts: [{ text: m.content }] })),
    generationConfig: { maxOutputTokens: 400, temperature: 0, responseMimeType: 'application/json' },
  };
}

// Antwort des Kochs lesen. Unklare Antworten zählen als „ok“ – der Chat soll nicht an der KI hängen.
export function parseVerdict(text) {
  let v;
  try { v = JSON.parse(String(text).replace(/^```(?:json)?|```$/g, '').trim()); } catch { return { verdict: 'ok', grund: '', vorschlag: '' }; }
  const verdict = ['ok', 'hinweis', 'stopp'].includes(v?.verdict) ? v.verdict : 'ok';
  return { verdict, grund: String(v?.grund || '').slice(0, 300), vorschlag: String(v?.vorschlag || '').slice(0, LIMITS.body) };
}

// Den Koch fragen: direkt bei Gemini (Schlüssel der App) oder über den Koch-Server.
// Ist er nicht erreichbar, geht die Nachricht trotzdem raus (die Datenbank prüft die festen Regeln ohnehin).
export async function askModerator({ apiKey, server, text, recent = [], fetch = globalThis.fetch, models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'] }) {
  const messages = moderationMessages(text, recent);
  try {
    if (server) {
      const res = await fetch(server, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ moderate: messages }) });
      if (!res.ok) return null;
      return parseVerdict(geminiText(await res.json()));
    }
    if (!apiKey || apiKey.startsWith('sk-ant-')) return null;
    for (const model of models) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(moderationRequest(messages)),
      });
      if (res.ok) {
        const data = await res.json();
        // Wenn Googles eigener Filter die Nachricht schon blockt, ist sie sicher nicht in Ordnung.
        if (data.promptFeedback?.blockReason) return { verdict: 'stopp', grund: t('So kann die Nachricht nicht in den Chat. Bitte freundlich formulieren.'), vorschlag: '' };
        return parseVerdict(geminiText(data));
      }
      if (!(res.status === 404 || res.status === 429 || res.status >= 500)) return null;
    }
  } catch { /* offline o. Ä. */ }
  return null;
}

export const geminiText = (data) => (data?.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text || '').join('');
