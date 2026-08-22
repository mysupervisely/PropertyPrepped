// PropRoster — PWA/Mobile Installability V1: the ENTIRE service worker.
//
// This does not do anything. It exists only because some installability
// checks (older Chrome/Android heuristics, some Lighthouse PWA checks)
// look for a registered service worker with a fetch handler as one of
// their installability signals. Per Section 8 of this milestone's spec
// ("do not add complicated offline functionality... keep it extremely
// conservative and document exactly what it does"):
//
//   - install: skips the wait immediately. No cache is opened. No file
//     is precached. Nothing is written to disk.
//   - activate: claims existing clients immediately, so a page that's
//     already open comes under this worker's (inert) control right
//     away instead of only after the next full reload.
//   - fetch: every single request is passed straight through to the
//     network via fetch(event.request) and nothing else. No
//     caches.match(), no caches.put(), no offline fallback page, no
//     stale-while-revalidate — every response the app ever sees is a
//     live network response, exactly as if this file didn't exist.
//
// This is deliberate: PropRoster is live property/tenant/payment/
// document/account data (Section 8) — a user must NEVER see cached,
// possibly-stale landlord information because a service worker decided
// to serve an old response instead of hitting the network. If this file
// is ever deleted entirely, the only observable difference is that a
// few installability heuristics on some browsers may score the site
// slightly differently — no feature in the app depends on it.
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
