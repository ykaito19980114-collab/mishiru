// MISHIRU Service Worker
// 静的アセット: stale-while-revalidate / API GET: network-first→cacheフォールバック（FR-ERR-01）
// POST/PATCH/DELETE はキャッシュ対象外。
const CACHE = "mishiru-v1";
const CORE = ["/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // 変更系はSWを通さない

  const url = new URL(request.url);

  // SPA のHTMLは古いJSを指し続けると白画面になるため、常にネットワーク優先。
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(fetch(request).catch(() => caches.match("/") || Response.error()));
    return;
  }

  // API GET: network-first → cache fallback（オフラインでも閲覧済みデータを表示）
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || new Response(JSON.stringify({ error: { code: "OFFLINE", message: "オフライン" } }), { status: 503, headers: { "Content-Type": "application/json" } })))
    );
    return;
  }

  // 静的アセット: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
