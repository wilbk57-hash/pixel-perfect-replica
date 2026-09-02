// Service worker do BK BUSINESS — permite abrir a app sem internet.
// Estratégia: "network first, cache fallback" para navegação (HTML) e
// "cache first" para os ficheiros estáticos (JS/CSS/ícones).
// Os dados (Supabase) NUNCA passam por aqui — vão sempre direto à rede,
// e a lógica de fila offline já existe em src/lib/offline-queue.ts.

const CACHE_NAME = "bk-business-shell-v4";
const APP_SHELL = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Nunca cachear chamadas a APIs externas (Supabase, gateway de IA, WhatsApp, etc.)
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_serverFn") || url.pathname.startsWith("/api")) return;

  // O preview do Vite serve módulos React/TanStack com URLs transitórias.
  // Guardá-los pode misturar versões depois de uma atualização e quebrar os hooks.
  if (
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/@") ||
    url.searchParams.has("v") ||
    url.searchParams.has("t")
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Navegação de páginas: tenta rede primeiro, cai para cache (shell) se offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
    );
    return;
  }

  // Bundles do build (/assets/*): rede primeiro. Cada publicação gera nomes novos,
  // por isso servir de cache pode apontar para ficheiros que já não existem.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Restantes ficheiros estáticos (ícones, imagens): cache first, atualiza em segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
