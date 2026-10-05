/* ==========================================================================
   Kucharzyna — service worker
   Strategia: network-first z krótkim limitem czasu i cache jako zapasem.
   Dzięki temu online zawsze dostajesz świeże pliki (brak „starej wersji
   przez kilka dni”), a offline aplikacja otwiera się z pamięci podręcznej.
   Nowa wersja NIE przejmuje aplikacji po cichu: strona pokazuje „Odśwież”
   i dopiero wtedy wysyła SKIP_WAITING.

   ZMIANA WERSJI: podbij VERSION (i APP_VERSION w util.js) przy każdej
   aktualizacji plików, żeby urządzenia wykryły nową wersję.
   ========================================================================== */
const VERSION = 'zarlok-2.1.5';
const NETWORK_TIMEOUT = 3500;

const CORE = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'app.js', 'router.js', 'pwa.js', 'ui.js', 'util.js', 'db.js', 'recipes.js', 'calculator.js', 'importer.js', 'backup.js',
  'components.js', 'shopping.js', 'art.js', 'seeds.js', 'timers.js', 'kitchen.js', 'tools-data.js', 'calc-kit.js', 'search.js',
  'views-start.js', 'views-recipes.js', 'views-detail.js', 'views-editor.js', 'views-cook.js', 'views-calc.js', 'views-tools.js', 'views-guide.js', 'views-search.js', 'views-import.js', 'views-settings.js',
  'views-inventory.js', 'views-history.js', 'views-pro-fixed.js', 'views-ai.js',
  'inventory.js', 'history.js', 'pro.js', 'pro-calculators.js', 'barcode-scanner.js', 'barcode-decoder.js', 'ai.js', 'recipe-library.js', 'recipe-translation.js',
  'recipe-library-data/index.js', 'recipe-library-data/part-01.js', 'recipe-library-data/part-02.js', 'recipe-library-data/part-03.js', 'recipe-library-data/part-04.js', 'recipe-library-data/part-05.js', 'recipe-library-data/part-06.js', 'recipe-library-data/part-07.js', 'recipe-library-data/part-08.js', 'recipe-library-data/part-09.js',
  'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
];

const scopeUrl = (p) => new URL(p, self.registration.scope).href;
const INDEX = () => scopeUrl('index.html');

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache:'reload' omija pamięć HTTP przeglądarki — w cache lądują świeże pliki.
    await cache.addAll(CORE.map((p) => new Request(scopeUrl(p), { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => (k.startsWith('kucharzyna-') || k.startsWith('zarlok-')) && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  else if (msg.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

/** Sieć najpierw (z limitem czasu, gdy mamy kopię), potem pamięć podręczna. */
async function networkFirst(event, url, cacheKey) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(cacheKey, { ignoreSearch: true });

  const net = fetch(url, { cache: 'no-cache' }).then((res) => {
    if (res && res.ok && res.type !== 'opaque') cache.put(cacheKey, res.clone()).catch(() => {});
    return res;
  });

  if (!cached) return net;                       // brak kopii — czekamy na sieć
  event.waitUntil(net.catch(() => {}));          // dokończ aktualizację cache w tle

  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT));
  try {
    const res = await Promise.race([net, timeout]);
    return res && res.ok ? res : cached;         // 404/500 z sieci → lepsza kopia
  } catch (_) {
    return cached;                               // offline
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // nic spoza własnej domeny

  if (req.mode === 'navigate') {
    // Aplikacja jednostronicowa (trasy po #): każda nawigacja = index.html.
    event.respondWith(networkFirst(event, INDEX(), INDEX()).catch(async () => {
      const cache = await caches.open(VERSION);
      return (await cache.match(INDEX())) || Response.error();
    }));
    return;
  }
  event.respondWith(networkFirst(event, req.url, req.url).catch(async () => {
    const cache = await caches.open(VERSION);
    return (await cache.match(req, { ignoreSearch: true })) || Response.error();
  }));
});
