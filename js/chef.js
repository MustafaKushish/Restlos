// KI-Koch: Ein Profikoch macht aus dem, was da ist – zuerst aus dem, was bald abläuft – ein Gericht,
// das auch Kochanfänger hinbekommen. Standard ist Gemini (kostenlose Stufe von Google), entweder über den
// Restlos-Koch-Server oder mit eigenem Schlüssel; mit eigenem Claude-Schlüssel kocht Claude. Schlüssel bleiben lokal.
// Alles außer askChef() ist ohne DOM und Netz, damit es testbar bleibt.
import { iso, daysLeft, status } from './pantry.js';
import { byId, PLACES } from './products.js';

export const MODEL = 'claude-opus-5-5';

export const SYSTEM = `Du bist der Koch in der App „Restlos“: ein erfahrener Profikoch, der mit Menschen kocht, die kaum oder gar nicht kochen können. Dein Ziel ist, aus dem, was jemand zu Hause hat – vor allem aus Sachen, die bald ablaufen – das bestmögliche Gericht zu machen, damit nichts im Müll landet.

So arbeitest du:
- Plane zuerst ein, was bald abläuft. Verwende nur Zutaten, die die Person nennt oder im Vorrat hat, dazu Grundvorrat: Salz, Pfeffer, Öl, Essig, Zucker, Mehl, Brühe und gängige Gewürze. Fehlt etwas, nimm einen Ersatz aus dem Vorhandenen. Nur wenn es gar nicht anders geht, nenne höchstens eine Zutat zum Nachkaufen und schreib „(kaufen)“ dahinter.
- Schreib für Anfänger: Jeder Schritt ist eine konkrete Handlung mit Menge, Hitze (z. B. „mittlere Hitze, Stufe 6 von 9“), Zeit und woran man erkennt, dass es passt (Farbe, Geruch, Konsistenz). Fachbegriffe vermeidest du oder erklärst sie in wenigen Worten. Du setzt nur Herd, Topf, Pfanne, Messer und Brett voraus; brauchst du den Backofen, nenne eine Variante für die Pfanne.
- Lebensmittelsicherheit geht vor: Ist bei Fleisch, Geflügel, Fisch oder Hackfleisch das Verbrauchsdatum überschritten, verwendest du es nicht und sagst das freundlich. Ist nur das Mindesthaltbarkeitsdatum überschritten, rätst du: ansehen, riechen, probieren. Hackfleisch und Geflügel immer ganz durchgaren und sagen, woran man das erkennt.
- Bring Profiwissen ein, das den Unterschied macht (Pfanne richtig heiß, rechtzeitig salzen, zum Schluss etwas Säure, Röstaromen), aber knapp.
- Antworte auf Deutsch, freundlich und ohne Vorrede.

Bei einem Rezeptwunsch antwortest du in Markdown, genau in dieser Form:
## Name des Gerichts
_Zeit in Minuten · Portionen · leicht oder mittel_
Ein Satz, warum das heute passt und was es rettet.
### Das brauchst du
- Menge und Zutat; Zutaten, die bald ablaufen, markierst du mit 🌱
### So geht's
1. Schritt
### Profi-Tipp
Ein bis zwei Sätze.
### Reste-Tipp
Wie man Übriggebliebenes aufbewahrt oder weiterverwendet.
### Andere Ideen
- Gericht – ein kurzer Satz
- Gericht – ein kurzer Satz

Bei Rückfragen („ohne Ofen?“, „was statt Sahne?“) antwortest du kurz und direkt. Nur wenn sich das Rezept dadurch ändert, schreibst du es vollständig neu in derselben Form.`;

// Der Vorrat als Liste für den Koch – dringendes zuerst, Verbrauchsdatum deutlich markiert.
export function pantryForChef(items, today = iso()) {
  return [...items]
    .filter((i) => !i.offered)
    .sort((a, b) => daysLeft(a, today) - daysLeft(b, today))
    .map((i) => {
      const s = status(i, today);
      let when = s.d < 0 ? `${s.label}` : s.d <= 1 ? `muss ${s.label} weg` : s.label;
      if (s.vd) when += s.d < 0 ? ', Verbrauchsdatum überschritten – nicht mehr verwenden' : ', Verbrauchsdatum';
      return `- ${i.name}${i.qty > 1 ? ` (${i.qty}×)` : ''}: ${when}${i.opened ? ', angebrochen' : ''}, ${PLACES[i.place] ?? i.place}`;
    })
    .join('\n');
}

// Erste Nachricht an den Koch: Vorrat, freie Beschreibung und Rahmen.
export function firstMessage({ text = '', pantry = '', persons = 2, minutes = 30, veg = false }, today = iso()) {
  const parts = [`Heute ist der ${today.split('-').reverse().join('.')}.`];
  if (pantry) parts.push(`Mein Vorrat (das Dringendste zuerst):\n${pantry}`);
  if (text.trim()) parts.push(`${pantry ? 'Dazu von mir' : 'Das habe ich und darauf habe ich Lust'}: ${text.trim()}`);
  const frame = [`${persons} ${persons === 1 ? 'Person' : 'Personen'}`, minutes ? `höchstens ${minutes} Minuten` : 'Zeit spielt keine Rolle'];
  if (veg) frame.push('vegetarisch');
  parts.push(`Rahmen: ${frame.join(', ')}. Ich bin Kochanfänger. Was soll ich kochen?`);
  return parts.join('\n\n');
}

// Anfrage an die Messages API. Opus 5.5 denkt immer adaptiv mit; effort steuert, wie gründlich.
// fallbacks: "default" – lehnt das Modell ab, beantwortet ein passendes anderes Modell im selben Aufruf.
export function chefRequest(messages) {
  return {
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'medium' },
    cache_control: { type: 'ephemeral' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages,
  };
}

// Wer kocht? Ein eigener Gemini-Schlüssel (kostenlos bei Google AI Studio, beginnt mit „AIza“),
// ein eigener Claude-Schlüssel („sk-ant-“) – oder ohne Schlüssel der Restlos-Koch-Server (config.js).
export function chefProvider(apiKey, server) {
  if (apiKey?.startsWith('sk-ant-')) return 'claude';
  if (apiKey) return 'gemini';
  return server ? 'server' : null;
}

// Fragt den Koch und streamt die Antwort Stück für Stück an onText.
// Gibt { text, stop } zurück; Fehler werden als verständliche deutsche Meldung geworfen.
export function askChef({ apiKey, server, ...rest }) {
  const provider = chefProvider(apiKey, server);
  if (provider === 'claude') return askClaude({ apiKey, ...rest });
  if (provider === 'gemini') return askGemini({ apiKey, ...rest });
  if (provider === 'server') return askGemini({ server, ...rest });
  return Promise.reject(new Error('Der Koch ist noch nicht eingerichtet.'));
}

// ---------- Gemini (kostenlose Stufe von Google) ----------
// Kostenlose Modelle in der Reihenfolge, in der wir sie probieren. Ist bei einem das Tageslimit
// erreicht (429) oder gibt es das Modell nicht mehr (404), kommt das nächste dran.
export const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export function geminiRequest(messages) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    // Gemini will abwechselnd user/model – zwei Nachrichten hintereinander (z. B. nach einem Fehler) werden zusammengelegt.
    contents: messages.reduce((out, m) => {
      const role = m.role === 'assistant' ? 'model' : 'user';
      if (out.at(-1)?.role === role) out.at(-1).parts.push({ text: m.content });
      else out.push({ role, parts: [{ text: m.content }] });
      return out;
    }, []),
    generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
  };
}

// Liest einen SSE-Strom („data: {...}“) Zeile für Zeile.
async function* sseData(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    buf += done ? dec.decode() : dec.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = done ? '' : lines.pop();
    for (const line of lines) if (line.startsWith('data:')) yield line.slice(5).trim();
    if (done) return;
  }
}

async function askGemini({ apiKey, server, messages, onText, signal, fetch = globalThis.fetch }) {
  // Der Server baut die Anfrage selbst (mit genau diesen Koch-Anweisungen) – er bekommt nur das Gespräch.
  const body = JSON.stringify(server ? { messages } : geminiRequest(messages));
  let lastStatus = 0;
  // Über den Server entscheidet der Server, welches Modell kocht.
  for (const model of server ? [null] : GEMINI_MODELS) {
    let res;
    try {
      res = server
        ? await fetch(server, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal })
        : await fetch(`${GEMINI_URL}/${model}:streamGenerateContent?alt=sse`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body, signal });
    } catch (e) {
      throw new Error(e?.name === 'AbortError' ? 'Abgebrochen.' : 'Keine Verbindung zum Koch. Bist du online?', { cause: e });
    }
    if (!res.ok) {
      lastStatus = res.status;
      if (!server && (res.status === 404 || res.status === 429)) continue;
      throw new Error(geminiError(res.status, await res.text().catch(() => '')));
    }
    let text = '';
    let stop = null;
    try {
      for await (const data of sseData(res.body)) {
        let chunk;
        try { chunk = JSON.parse(data); } catch { continue; }
        if (chunk.promptFeedback?.blockReason) stop = 'refusal';
        const cand = chunk.candidates?.[0];
        for (const part of cand?.content?.parts ?? []) {
          if (part.text && !part.thought) { text += part.text; onText?.(text); }
        }
        if (cand?.finishReason) stop = cand.finishReason;
      }
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error('Abgebrochen.', { cause: e });
      throw new Error('Die Verbindung zum Koch ist abgebrochen. Bitte nochmal.', { cause: e });
    }
    if (stop === 'refusal' || (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(stop) && !text)) {
      throw new Error('Dazu kann der Koch leider nichts sagen. Frag gern nach einem anderen Gericht.');
    }
    return { text, stop: stop === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn' };
  }
  throw new Error(lastStatus === 429
    ? 'Der kostenlose Koch hat für heute zu viel zu tun. Bitte später nochmal – oder morgen.'
    : geminiError(lastStatus, ''));
}

export function geminiError(status, body) {
  if (status === 400 && /api.?key/i.test(body)) return 'Der API-Schlüssel stimmt nicht. Bitte unter „Bilanz → KI-Koch“ prüfen.';
  if (status === 401 || status === 403) return 'Der API-Schlüssel stimmt nicht oder darf Gemini nicht nutzen. Bitte unter „Bilanz → KI-Koch“ prüfen.';
  if (status === 429) return 'Gerade zu viele Anfragen – bitte in einer Minute nochmal.';
  return `Der Koch ist gerade nicht erreichbar (Fehler ${status || '?'}). Bitte gleich nochmal.`;
}

// ---------- Claude (eigener Schlüssel von Anthropic) ----------
let sdk;
const loadSdk = () => (sdk ??= import('./vendor/anthropic-sdk.js').then((m) => m.default));

async function askClaude({ apiKey, messages, onText, signal, fetch }) {
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, ...(fetch ? { fetch } : {}) });
  let text = '';
  try {
    const stream = client.beta.messages.stream(chefRequest(messages), { signal });
    stream.on('text', (delta) => { text += delta; onText?.(text); });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error('Dazu kann der Koch leider nichts sagen. Frag gern nach einem anderen Gericht.');
    return { text, stop: msg.stop_reason };
  } catch (e) {
    throw new Error(chefError(e, Anthropic), { cause: e });
  }
}

export function chefError(e, Anthropic) {
  if (e?.name === 'AbortError' || e instanceof Anthropic.APIUserAbortError) return 'Abgebrochen.';
  if (e instanceof Anthropic.AuthenticationError) return 'Der API-Schlüssel stimmt nicht. Bitte unter „Bilanz → KI-Koch“ prüfen.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'Dieser API-Schlüssel darf den Koch nicht nutzen.';
  if (e instanceof Anthropic.RateLimitError) return 'Gerade zu viele Anfragen – bitte in einer Minute nochmal.';
  if (e instanceof Anthropic.APIConnectionError) return 'Keine Verbindung zum Koch. Bist du online?';
  if (e instanceof Anthropic.BadRequestError && /credit/i.test(e.message)) return 'Das Guthaben des API-Kontos ist aufgebraucht.';
  if (e instanceof Anthropic.APIError) return `Der Koch ist gerade nicht erreichbar (Fehler ${e.status ?? '?'}). Bitte gleich nochmal.`;
  return e?.message || 'Unbekannter Fehler.';
}

// ---------- Antwort aufbereiten ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/(^|[^\w*])[_*]([^_*\n]+?)[_*](?=[^\w*]|$)/g, '$1<i>$2</i>');

// Kleines, sicheres Markdown: Überschriften, Listen, fett/kursiv, Absätze. HTML aus der Antwort wird escaped.
export function renderMarkdown(md) {
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { close(); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      close();
      const level = m[1].length <= 2 ? 'h2' : 'h3';
      out.push(`<${level}>${inline(m[2])}</${level}>`);
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else {
      close();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  close();
  return out.join('');
}

// Abschnitt unter einer Überschrift („Das brauchst du“, „Andere Ideen“) als Text.
export function section(md, title) {
  const lines = md.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => /^#{1,4}\s/.test(l) && l.toLowerCase().includes(title.toLowerCase()));
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,4}\s/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

// Die „Andere Ideen“ als antippbare Vorschläge.
export function ideas(md) {
  return section(md, 'Andere Ideen').split('\n')
    .map((l) => l.match(/^\s*[-*•]\s+(.*)$/)?.[1])
    .filter(Boolean)
    .map((l) => l.replace(/\*\*/g, '').split(/\s[–—-]\s|:\s/)[0].trim())
    .filter((l) => l.length > 1 && l.length < 70)
    .slice(0, 3);
}

// Welche Vorratssachen verwendet das Rezept? Für „Gekocht! Zutaten austragen“.
const stem = (s) => s.toLowerCase().replace(/\s*\(.*\)/, '').trim().replace(/(en|n|e|s)$/, '');
export function usedItems(md, items) {
  const text = (section(md, 'Das brauchst du') || md).toLowerCase();
  return items.filter((i) => {
    const names = [i.name, i.pid && byId[i.pid]?.name].filter(Boolean);
    return names.some((n) => { const s = stem(n); return s.length >= 3 && text.includes(s); });
  });
}
