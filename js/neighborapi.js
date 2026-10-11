// Verbindung der Nachbarschafts-Börse zur gemeinsamen Datenbank (Supabase, Server in der EU).
// Ohne Konto: Beim ersten Mal bekommt das Gerät eine zufällige, anonyme Kennung – keine E-Mail, keine Telefonnummer.
// Ohne eingerichtete Datenbank (config.js leer) gibt es eine Vorschau, die nur auf diesem Gerät speichert.
import { expiresFor } from './neighbors.js';
import { t } from './i18n.js';

const SESSION_KEY = 'restlos:nachbarn-sitzung';
const FIELDS = 'id,user_id,kind,city,street,title,body,nickname,reply_to,status,created_at,expires_at';

// Fehlertexte der Datenbank (supabase/schema.sql) in verständliche Sätze übersetzen.
export function apiError(status, body) {
  const m = String(body?.message || body?.msg || body?.error_description || body || '');
  if (/restlos:telefon/.test(m)) return t('Bitte keine Telefonnummern.');
  if (/restlos:kontakt/.test(m)) return t('Bitte keine E-Mails, Links oder Kontodaten.');
  if (/restlos:hausnummer/.test(m)) return t('Bitte nur die Straße, ohne Hausnummer.');
  if (/restlos:zu-viel/.test(m)) return t('Du hast gerade viel geschrieben. Bitte etwas später wieder.');
  if (/restlos:laenge/.test(m)) return t('Der Text ist zu lang.');
  if (/anonymous sign-ins are disabled/i.test(m)) return t('Die Nachbarschafts-Börse ist noch nicht freigeschaltet.');
  if (status === 401 || status === 403) return t('Keine Berechtigung. Bitte die App neu laden.');
  if (status === 429) return t('Gerade zu viele Anfragen. Bitte gleich nochmal.');
  return t('Das hat nicht geklappt (Fehler {code}). Bitte gleich nochmal.', { code: status || '?' });
}

export function supabaseBackend({ url, key, fetch = globalThis.fetch, storage = globalThis.localStorage }) {
  const base = url.replace(/\/+$/, '');
  let session = null;
  try { session = JSON.parse(storage?.getItem(SESSION_KEY) || 'null'); } catch { session = null; }
  const save = (s) => { session = s; try { storage?.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* privat */ } };

  async function call(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: {
          apikey: key,
          ...(auth && session ? { authorization: `Bearer ${session.access_token}` } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error(t('Keine Verbindung. Bist du online?'), { cause: e });
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw Object.assign(new Error(apiError(res.status, data)), { status: res.status });
    return data;
  }

  const keep = (d) => ({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
    user: d.user?.id,
  });

  // Anonym anmelden bzw. die Anmeldung verlängern.
  async function ensure() {
    if (session && session.expires_at - Date.now() > 60_000) return session;
    if (session?.refresh_token) {
      try {
        save(keep(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false })));
        return session;
      } catch { /* abgelaufen – neu anmelden */ }
    }
    save(keep(await call('/auth/v1/signup', { method: 'POST', body: {}, auth: false })));
    return session;
  }

  return {
    live: true,
    me: () => session?.user || null,
    async list(city) {
      await ensure();
      return call(`/rest/v1/posts?select=${FIELDS}&city=eq.${encodeURIComponent(city)}&order=created_at.asc&limit=500`);
    },
    async cities() {
      await ensure();
      return call('/rest/v1/rpc/staedte', { method: 'POST', body: {} });
    },
    async post(p) {
      await ensure();
      const [row] = await call('/rest/v1/posts', { method: 'POST', body: p, headers: { prefer: 'return=representation' } });
      return row;
    },
    async setStatus(id, status) {
      await ensure();
      await call(`/rest/v1/posts?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } });
    },
    async remove(id) {
      await ensure();
      await call(`/rest/v1/posts?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    async removeAll() {
      await ensure();
      await call(`/rest/v1/posts?user_id=eq.${encodeURIComponent(session.user)}`, { method: 'DELETE' });
    },
    async report(id, reason) {
      await ensure();
      try {
        await call('/rest/v1/reports', { method: 'POST', body: { post_id: id, reason } });
      } catch (e) {
        if (e.status !== 409) throw e; // schon gemeldet
      }
    },
  };
}

// Vorschau ohne Datenbank: alles bleibt auf diesem Gerät. Zum Ausprobieren, bevor die Börse öffentlich wird.
export function localBackend({ storage = globalThis.localStorage, now = () => new Date() } = {}) {
  const KEY = 'restlos:nachbarn-vorschau';
  const me = 'ich';
  const read = () => { try { return JSON.parse(storage?.getItem(KEY) || '[]'); } catch { return []; } };
  const write = (all) => { try { storage?.setItem(KEY, JSON.stringify(all)); } catch { /* privat */ } };
  const id = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return {
    live: false,
    me: () => me,
    async list(city) { return read().filter((p) => p.city === city && new Date(p.expires_at) > now()); },
    async cities() {
      const counts = {};
      for (const p of read()) if (p.kind === 'angebot' && new Date(p.expires_at) > now()) counts[p.city] = (counts[p.city] || 0) + 1;
      return Object.entries(counts).map(([stadt, angebote]) => ({ stadt, angebote }));
    },
    async post(p) {
      const row = { status: 'offen', reply_to: null, title: null, ...p, id: id(), user_id: me, created_at: now().toISOString(), expires_at: expiresFor(p.kind, now()) };
      write([...read(), row]);
      return row;
    },
    async setStatus(pid, status) { write(read().map((p) => (p.id === pid && p.user_id === me ? { ...p, status } : p))); },
    async remove(pid) { write(read().filter((p) => !(p.id === pid && p.user_id === me) && p.reply_to !== pid)); },
    async removeAll() { write(read().filter((p) => p.user_id !== me)); },
    async report(pid) { write(read().map((p) => (p.id === pid ? { ...p, hidden: true } : p))); },
  };
}
