// Restlos-Koch-Server (Cloudflare Worker): verwahrt den Gemini-Schlüssel, damit Nutzer keinen eigenen brauchen.
// Er nimmt nur ein Koch-Gespräch ({ messages }) oder Bon-Fotos ({ receipt: Bild oder Liste von Bildern }) an und baut die Anfrage selbst –
// so lässt er sich nicht als allgemeine Gratis-KI missbrauchen. Die Antwort wird unverändert durchgestreamt.
//
// Einstellungen im Cloudflare-Dashboard (Worker → Settings → Variables and Secrets):
//   GEMINI_API_KEY  (Secret)  Schlüssel von aistudio.google.com – ohne hinterlegte Zahlungsdaten bleibt es kostenlos
//   ALLOWED_ORIGIN  (Text)    Adresse der App, z. B. https://mustafakushish.github.io (mehrere mit Komma)
import { geminiRequest, GEMINI_MODELS } from '../js/chef.js';
import { receiptRequest, MAX_PHOTOS } from '../js/receiptai.js';

const MAX_MESSAGES = 20;
const MAX_CHARS = 12000;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export function validMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return false;
  if (messages[0]?.role !== 'user' || messages.at(-1)?.role !== 'user') return false;
  let chars = 0;
  for (const m of messages) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content) return false;
    chars += m.content.length;
  }
  return chars <= MAX_CHARS * 4;
}

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = origin && allowed.includes(origin);
  return {
    ok,
    headers: {
      ...(ok ? { 'access-control-allow-origin': origin } : {}),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
      vary: 'origin',
    },
  };
}

const json = (status, message, headers) => new Response(JSON.stringify({ error: { message } }), { status, headers: { ...headers, 'content-type': 'application/json' } });

export default {
  async fetch(request, env) {
    const { ok, headers } = cors(request.headers.get('origin'), env);
    if (request.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers });
    if (request.method !== 'POST') return json(405, 'Nur POST', headers);
    if (!ok) return json(403, 'Unbekannte App', headers);
    if (!env.GEMINI_API_KEY) return json(500, 'Kein Schlüssel hinterlegt', headers);

    const raw = await request.text();
    if (raw.length > 16_000_000) return json(413, 'Zu groß', headers);
    let messages, receipt;
    try { ({ messages, receipt } = JSON.parse(raw)); } catch { return json(400, 'Kein JSON', headers); }
    let body, action;
    if (receipt) {
      const images = [receipt].flat();
      if (images.length > MAX_PHOTOS) return json(413, 'Zu viele Fotos', headers);
      if (!images.every((i) => /^image\/(jpeg|png|webp)$/.test(i?.mimeType) && typeof i.data === 'string')) return json(400, 'Kein Bild', headers);
      body = JSON.stringify(receiptRequest(images.map((i) => ({ mimeType: i.mimeType, data: i.data }))));
      action = 'generateContent';
    } else {
      if (raw.length > 60000) return json(413, 'Zu lang', headers);
      if (!validMessages(messages)) return json(400, 'Ungültiges Gespräch', headers);
      body = JSON.stringify(geminiRequest(messages));
      action = 'streamGenerateContent?alt=sse';
    }
    let last;
    for (const model of GEMINI_MODELS) {
      last = await fetch(`${GEMINI_URL}/${model}:${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body,
      });
      if (last.ok) {
        return new Response(last.body, { headers: { ...headers, 'content-type': receipt ? 'application/json' : 'text/event-stream', 'cache-control': 'no-store' } });
      }
      if (last.status !== 404 && last.status !== 429) break;
    }
    // Fehlertext von Google nicht weiterreichen (könnte Details zum Schlüssel enthalten) – nur den Status.
    return json(last.status === 429 ? 429 : 502, last.status === 429 ? 'Tageslimit erreicht' : `Gemini-Fehler ${last.status}`, headers);
  },
};
