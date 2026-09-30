/*
 * Offline shell for Tikita.
 *
 * Every same-origin request is network-first with a short timeout, falling
 * back to the cache. Online, the phone always opens the newest deployed
 * version on the very next launch; on a bad signal, or none, it falls back to
 * the last cached copy after NETWORK_TIMEOUT rather than hanging.
 *
 * "Network" has to mean the server, not the browser's HTTP cache. GitHub
 * Pages lets browsers keep a file for ten minutes (max-age=600), so a plain
 * fetch() went on returning the previous deploy for up to ten minutes after
 * an update — reloads included. Every fetch here asks the server to confirm
 * its copy is current; an unchanged file costs a tiny 304, not a download.
 *
 * Bump CACHE when the asset list below changes.
 */
var CACHE = 'tikita-v3';
var NETWORK_TIMEOUT = 2500;

var ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './xlsx.js',
  './sync.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      // 'reload': straight from the server, so a fresh install never
      // pre-caches whatever stale copy the browser happens to be holding
      .then(function (cache) {
        return cache.addAll(ASSETS.map(function (url) { return new Request(url, { cache: 'reload' }); }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key === CACHE ? null : caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/*
 * Hand the page a copy marked 'no-cache'. Without it the ten-minute max-age
 * from Pages rides along, and Chromium's in-memory cache then reuses the old
 * stylesheet and scripts on a reload without asking this worker at all —
 * which is how the PC kept showing the previous version after an update.
 */
function fresh(response) {
  if (!response || response.type !== 'basic') return response;
  var headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-cache');
  return new Response(response.body, {
    status: response.status, statusText: response.statusText, headers: headers
  });
}

/*
 * Resolve from the network when it answers in time, otherwise from the cache.
 * A slow network still populates the cache for next time.
 */
function networkFirst(request, cacheKey) {
  return new Promise(function (resolve) {
    var settled = false;

    function settle(response) {
      if (settled || !response) return false;
      settled = true;
      resolve(fresh(response));
      return true;
    }

    var timer = setTimeout(function () {
      if (settled) return;
      caches.match(cacheKey).then(settle);
    }, NETWORK_TIMEOUT);

    fetch(request, { cache: 'no-cache' }).then(function (response) {
      clearTimeout(timer);
      if (response && response.status === 200 && response.type === 'basic') {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(cacheKey, copy); });
      }
      settle(response);
    }).catch(function () {
      clearTimeout(timer);
      caches.match(cacheKey).then(function (hit) {
        if (!settle(hit)) {
          settled = true;
          resolve(Response.error());
        }
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // A navigation may arrive as '/', '/index.html' or a deep link; they all
  // resolve to the one shell document in the cache.
  var cacheKey = (request.mode === 'navigate') ? './index.html' : request;
  event.respondWith(networkFirst(request, cacheKey));
});
