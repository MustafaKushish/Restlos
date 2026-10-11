// Offline: Die App selbst liegt im Cache, die Daten sowieso auf dem Gerät.
const CACHE = 'restlos-v12';
// Fahrplan der Erinnerungen, den die App hier ablegt (siehe syncReminders in app.js). Bleibt bei Updates erhalten.
const REMIND_CACHE = 'restlos-erinnerung';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/store.js', 'js/products.js', 'js/pantry.js', 'js/receipt.js', 'js/recipes.js', 'js/share.js', 'js/ocr.js',
  'js/chef.js', 'js/rescue.js', 'js/config.js', 'js/receiptai.js', 'js/camera.js', 'js/neighbors.js', 'js/neighborapi.js', 'js/nachbarn.js', 'js/health.js', 'js/vendor/anthropic-sdk.js',
  'js/i18n.js', 'js/lang/en.js', 'js/lang/tr.js', 'js/lang/ar.js', 'js/lang/fr.js', 'js/lang/es.js',
  'widgets/einkauf.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // Jede Datei einzeln: Fehlt eine, wird die neue Version trotzdem aktiv (sonst bliebe die alte hängen).
  // cache: 'reload' holt alles frisch vom Server, nicht aus dem Browser-Zwischenspeicher.
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.allSettled(SHELL.map((f) => c.add(new Request(f, { cache: 'reload' })))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== REMIND_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Eigene Dateien: erst Netz (damit Updates ankommen), offline aus dem Cache.
// cache: 'no-cache' fragt immer beim Server nach, ob es eine neue Fassung gibt. Sonst mischt der Browser
// nach einem Update bis zu 10 Minuten alte und neue Dateien – dann bleibt die App weiß.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      // Offline: aus dem Cache. Die Startseite nur für Seitenaufrufe – nie anstelle eines Skripts.
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});

// Erinnerung im Hintergrund: Der Browser weckt den Service Worker ab und zu (installierte App in Chrome/Edge).
// Höchstens eine Mitteilung am Tag, nicht nachts, und nicht, wenn Restlos gerade offen ist.
const today = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

async function remindInBackground() {
  const hour = new Date().getHours();
  if (hour < 8 || hour >= 21) return;
  const cache = await caches.open(REMIND_CACHE);
  const data = await (await cache.match('erinnerung.json'))?.json().catch(() => null);
  const day = today();
  if (!data?.on || data.memo?.day === day) return;
  const plan = data.schedule?.find((s) => s.day === day);
  if (!plan) return;
  const open = await self.clients.matchAll({ type: 'window' });
  if (open.some((c) => c.visibilityState === 'visible')) return;
  await self.registration.showNotification(plan.title, { body: plan.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'restlos-due', data: { url: plan.url } });
  data.memo = { day, seen: { ...data.memo?.seen, ...plan.seen } };
  await cache.put('erinnerung.json', new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }));
}

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'restlos-erinnerung') e.waitUntil(Promise.all([remindInBackground(), updateWidgets()]));
});

// Widget auf dem Startbildschirm (Windows-Widget-Board): Einkaufsliste und was bald abläuft.
// Die Texte legt die App fertig übersetzt in den Cache (syncWidget in app.js).
async function updateWidgets() {
  if (!self.widgets) return;
  const widget = await self.widgets.getByTag('restlos').catch(() => null);
  if (!widget) return;
  const template = await (await fetch(widget.definition.msAcTemplate)).text();
  const saved = await (await caches.open(REMIND_CACHE)).match('widget.json');
  const data = saved ? await saved.text() : await (await fetch('widgets/data.json')).text();
  await self.widgets.updateByTag('restlos', { template, data });
}
self.addEventListener('widgetinstall', (e) => e.waitUntil(updateWidgets()));
self.addEventListener('widgetresume', (e) => e.waitUntil(updateWidgets()));
self.addEventListener('widgetclick', (e) => {
  if (e.action === 'open') e.waitUntil(self.clients.openWindow('./#/einkauf'));
});
self.addEventListener('message', (e) => {
  if (e.data === 'widget') e.waitUntil(updateWidgets());
});

// Tipp auf die Erinnerung öffnet die Retten-Ideen.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    const open = list.find((c) => 'focus' in c);
    if (open) { open.navigate(url); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
