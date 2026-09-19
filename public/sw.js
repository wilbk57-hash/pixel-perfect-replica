const CACHE_NAME = 'bk-cirurgia-v5';
// Assets estáticos versionados: nunca mudam sem trocar o nome do arquivo,
// então podem ser cache-first com segurança.
const ASSETS_TO_CACHE = [
  './app.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Nunca cachear chamadas de API — dados têm que ser sempre ao vivo.
  if (url.pathname.startsWith('/api/')) return;

  const isStatic =
    url.pathname.endsWith('/manifest.json') || url.pathname.includes('/icons/');

  if (isStatic) {
    // Ícones e manifest: cache-first (só mudam quando trocamos o nome do arquivo).
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // App shell (app.html), a rota /app e qualquer HTML/JS/CSS do mesmo site:
  // network-first (pega sempre a versão mais nova quando há internet), mas
  // se a rede falhar (offline), cai para a última cópia guardada em vez de
  // mostrar uma tela quebrada. É isto que faz o app instalado funcionar
  // sem internet.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('./app.html'))
      )
  );
});

// ── Web Push: lembretes de eventos de estudo ──
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'BK-CIRURGIA';
  const options = {
    body: payload.body || '',
    icon: payload.icon || './icons/icon-192.png',
    badge: payload.badge || './icons/icon-192.png',
    tag: payload.tag || 'bk-reminder',
    renotify: true,
    requireInteraction: false,
    data: { url: payload.url || './app.html' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || './app.html',
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate?.(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
