// Include the deployment's build stamp so the browser discovers server upgrades.
const build = JSON.stringify(process.env.APP_BUILD_TIME ?? "local");

const offline = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>无法连接 · 中华寻根</title>
<style>
  body{margin:12vh auto;padding:0 24px;max-width:32rem;background:#f7f5ef;color:#1b2a41;font:1rem/1.6 system-ui,sans-serif}
  h1{font:700 2rem/1.2 serif}a{color:inherit}
</style>
<main>
  <p>中华寻根 · 百家族谱</p>
  <h1>无法连接到站点</h1>
  <p>请检查网络后重新加载。查阅和编辑族谱需要连接服务器。</p>
  <p><a href="/">返回首页</a></p>
</main>`;

const worker = `
const prefix = "xungen-offline-";
const cacheName = prefix + ${build};
const offlineKey = new URL("/pwa/offline", self.location.origin).href;
function offlineResponse() {
  return new Response(${JSON.stringify(offline)}, {status: 503, headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  }});
}
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.put(offlineKey, offlineResponse())));
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  if (event.data === "ACTIVATE_XUNGEN_UPDATE") event.waitUntil(self.skipWaiting());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || request.mode !== "navigate" ||
      url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(request).catch(async () => {
    const fallback = await caches.open(cacheName).then(cache => cache.match(offlineKey)).catch(() => null);
    return fallback ?? offlineResponse();
  }));
});
`;

export function GET() {
  return new Response(worker, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
