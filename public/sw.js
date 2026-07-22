// MISHIRU Service Worker
// 静的アセット: stale-while-revalidate。個人データを含み得るAPIレスポンスは保存しない。
// POST/PATCH/DELETE はキャッシュ対象外。
const CACHE = "mishiru-v4";
const CORE = ["/", "/manifest.webmanifest", "/favicon.png", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png"];

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
    event.respondWith(fetch(request).catch(async () => (await caches.match("/")) || Response.error()));
    return;
  }

  // APIは認証状態・保存内容を含み得るため、Cache Storageへ残さない。
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ error: { code: "OFFLINE", message: "通信できません。接続を確認して、もう一度お試しください。" } }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }))
    );
    return;
  }

  // 静的アセット: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
