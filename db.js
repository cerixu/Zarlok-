/* ==========================================================================
   db.js — trwała warstwa danych.
   Podstawowo: IndexedDB. Jeśli Safari/środowisko zablokuje IndexedDB albo
   otwarcie bazy utknie, aplikacja przełącza się na zgodny magazyn Cache API
   (z fallbackiem do localStorage, a na końcu do pamięci sesji), zamiast
   wyświetlać ekran błędu i całkowicie zatrzymywać aplikację.
   ========================================================================== */

const DB_NAME = 'kucharzyna-db';
const DB_VERSION = 5;
const FALLBACK_CACHE = 'zarlok-storage-v1';
const FALLBACK_PREFIX = 'zarlok-store:';
const OPEN_TIMEOUT = 2500;
const fallbackUrl = (name) => new URL('__zarlok_storage__/' + encodeURIComponent(name), location.href).href;

export const STORES = {
  recipes: 'id',
  ingredients: 'id',
  categories: 'id',
  shoppingItems: 'id',
  settings: 'key',
  history: 'id',
  cookSessions: 'recipeId',
  drafts: 'id',
  inventory: 'id',
  inventoryLog: 'id',
  deliveries: 'id',
  lots: 'id',
  stockMovements: 'id',
  suppliers: 'id',
  purchaseOrders: 'id',
  productionBatches: 'id',
  stocktakes: 'id',
  waste: 'id',
  priceHistory: 'id',
  cookHistory: 'id',
};

let backendPromise = null;
let activeBackend = 'unknown';
let fallbackState = null;

const nativeOpen = () => new Promise((resolve, reject) => {
  let settled = false;
  let timer = null;
  let rq;
  const fail = (err) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    try { rq && rq.result && rq.result.close && rq.result.close(); } catch (_) {}
    reject(err instanceof Error ? err : new Error(String(err || 'IndexedDB niedostępne')));
  };
  try {
    if (!('indexedDB' in globalThis)) return fail(new Error('IndexedDB niedostępne'));
    rq = indexedDB.open(DB_NAME, DB_VERSION);
    timer = setTimeout(() => fail(new Error('Safari nie odpowiedział na otwarcie pamięci IndexedDB.')), OPEN_TIMEOUT);
    rq.onupgradeneeded = () => {
      try {
        const d = rq.result;
        for (const [name, keyPath] of Object.entries(STORES)) {
          if (!d.objectStoreNames.contains(name)) {
            const s = d.createObjectStore(name, { keyPath });
            if (name === 'history') s.createIndex('recipeId', 'recipeId');
          }
        }
      } catch (e) { fail(e); }
    };
    rq.onsuccess = () => {
      if (settled) { try { rq.result.close(); } catch (_) {} ; return; }
      settled = true;
      if (timer) clearTimeout(timer);
      const d = rq.result;
      d.onversionchange = () => { try { d.close(); } catch (_) {} };
      resolve(d);
    };
    rq.onerror = () => fail(rq.error || new Error('Nie można otworzyć IndexedDB.'));
    rq.onblocked = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fail(new Error('Otwarcie IndexedDB zostało zablokowane przez inną kartę.')), 1200);
    };
  } catch (e) { fail(e); }
});

function cacheBackendAvailable() {
  return typeof caches !== 'undefined' && typeof Request !== 'undefined' && typeof Response !== 'undefined';
}

async function loadFallbackState() {
  if (fallbackState) return fallbackState;
  const stores = new Map(Object.keys(STORES).map((k) => [k, new Map()]));
  let persistence = 'memory';

  if (cacheBackendAvailable()) {
    try {
      const cache = await caches.open(FALLBACK_CACHE);
      for (const name of Object.keys(STORES)) {
        const req = new Request(fallbackUrl(name));
        const res = await cache.match(req);
        if (!res) continue;
        const arr = await res.json();
        if (!Array.isArray(arr)) continue;
        const map = stores.get(name);
        arr.forEach((v) => {
          const key = v && Object.prototype.hasOwnProperty.call(v, STORES[name]) ? v[STORES[name]] : null;
          if (key != null) map.set(String(key), v);
        });
      }
      persistence = 'cache';
    } catch (_) {}
  }

  if (persistence === 'memory') {
    try {
      const test = '__zarlok_storage_test__';
      localStorage.setItem(test, '1');
      localStorage.removeItem(test);
      for (const name of Object.keys(STORES)) {
        const raw = localStorage.getItem(FALLBACK_PREFIX + name);
        if (!raw) continue;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) continue;
        const map = stores.get(name);
        arr.forEach((v) => {
          const key = v && Object.prototype.hasOwnProperty.call(v, STORES[name]) ? v[STORES[name]] : null;
          if (key != null) map.set(String(key), v);
        });
      }
      persistence = 'localStorage';
    } catch (_) {}
  }

  fallbackState = { stores, persistence };
  return fallbackState;
}

async function persistFallbackStore(name) {
  const st = await loadFallbackState();
  const values = [...st.stores.get(name).values()];
  if (st.persistence === 'cache') {
    try {
      const cache = await caches.open(FALLBACK_CACHE);
      const req = new Request(fallbackUrl(name));
      await cache.put(req, new Response(JSON.stringify(values), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }));
      return true;
    } catch (_) {
      try {
        localStorage.setItem(FALLBACK_PREFIX + name, JSON.stringify(values));
        st.persistence = 'localStorage';
        return true;
      } catch (_) {}
    }
  } else if (st.persistence === 'localStorage') {
    try {
      localStorage.setItem(FALLBACK_PREFIX + name, JSON.stringify(values));
      return true;
    } catch (_) {}
  }
  return false;
}

export function storageMode() {
  return activeBackend;
}

export async function openDB() {
  if (backendPromise) return backendPromise;
  backendPromise = nativeOpen()
    .then((database) => {
      activeBackend = 'indexeddb';
      return { kind: 'indexeddb', db: database };
    })
    .catch(async (firstErr) => {
      try {
        const fb = await loadFallbackState();
        activeBackend = fb.persistence === 'memory' ? 'memory-fallback' : 'fallback-' + fb.persistence;
        return { kind: 'fallback', state: fb, reason: firstErr };
      } catch (fallbackErr) {
        activeBackend = 'unavailable';
        backendPromise = null;
        throw new Error(
          'Pamięć aplikacji jest niedostępna. Safari zablokowało IndexedDB i nie udało się uruchomić magazynu zgodności. ' +
          (fallbackErr && fallbackErr.message ? fallbackErr.message : '')
        );
      }
    });
  return backendPromise;
}

const wrap = (rq) => new Promise((res, rej) => {
  rq.onsuccess = () => res(rq.result);
  rq.onerror = () => rej(rq.error);
});
const done = (t) => new Promise((res, rej) => {
  t.oncomplete = () => res();
  t.onerror = () => rej(t.error);
  t.onabort = () => rej(t.error || new Error('Transakcja przerwana'));
});

function fallbackKey(name, value) {
  return String(value);
}

const fallbackGetAll = (st, name) => [...st.stores.get(name).values()];
const fallbackGet = (st, name, key) => st.stores.get(name).get(fallbackKey(name, key));
const fallbackByIndex = (st, name, index, key) =>
  [...st.stores.get(name).values()].filter((v) => String(v && v[index]) === String(key));

export const db = {
  async getAll(store) {
    const b = await openDB();
    if (b.kind === 'fallback') return fallbackGetAll(b.state, store);
    return wrap(b.db.transaction(store).objectStore(store).getAll());
  },
  async get(store, key) {
    const b = await openDB();
    if (b.kind === 'fallback') return fallbackGet(b.state, store, key);
    return wrap(b.db.transaction(store).objectStore(store).get(key));
  },
  async byIndex(store, index, key) {
    const b = await openDB();
    if (b.kind === 'fallback') return fallbackByIndex(b.state, store, index, key);
    return wrap(b.db.transaction(store).objectStore(store).index(index).getAll(key));
  },
  async put(store, val) {
    const b = await openDB();
    if (b.kind === 'fallback') {
      const s = b.state.stores.get(store);
      s.set(fallbackKey(store, val[STORES[store]]), structuredCloneSafe(val));
      await persistFallbackStore(store);
      return;
    }
    const t = b.db.transaction(store, 'readwrite');
    t.objectStore(store).put(val);
    return done(t);
  },
  async putMany(store, vals) {
    const b = await openDB();
    if (b.kind === 'fallback') {
      const s = b.state.stores.get(store);
      vals.forEach((v) => s.set(fallbackKey(store, v[STORES[store]]), structuredCloneSafe(v)));
      await persistFallbackStore(store);
      return;
    }
    const t = b.db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    vals.forEach((v) => s.put(v));
    return done(t);
  },
  async delete(store, key) {
    const b = await openDB();
    if (b.kind === 'fallback') {
      b.state.stores.get(store).delete(fallbackKey(store, key));
      await persistFallbackStore(store);
      return;
    }
    const t = b.db.transaction(store, 'readwrite');
    t.objectStore(store).delete(key);
    return done(t);
  },
  async clear(store) {
    const b = await openDB();
    if (b.kind === 'fallback') {
      b.state.stores.get(store).clear();
      await persistFallbackStore(store);
      return;
    }
    const t = b.db.transaction(store, 'readwrite');
    t.objectStore(store).clear();
    return done(t);
  },
  async tx(stores, fn) {
    const b = await openDB();
    if (b.kind === 'fallback') {
      const clones = new Map();
      stores.forEach((name) => {
        const src = b.state.stores.get(name);
        const copy = new Map();
        src.forEach((v, k) => copy.set(k, structuredCloneSafe(v)));
        clones.set(name, copy);
      });
      fn({
        put: (s, v) => clones.get(s).set(fallbackKey(s, v[STORES[s]]), structuredCloneSafe(v)),
        delete: (s, k) => clones.get(s).delete(fallbackKey(s, k)),
        clear: (s) => clones.get(s).clear(),
      });
      for (const name of stores) b.state.stores.set(name, clones.get(name));
      for (const name of stores) await persistFallbackStore(name);
      return;
    }
    const t = b.db.transaction(stores, 'readwrite');
    fn({
      put: (s, v) => t.objectStore(s).put(v),
      delete: (s, k) => t.objectStore(s).delete(k),
      clear: (s) => t.objectStore(s).clear(),
    });
    return done(t);
  },
};

/** Prosty magazyn klucz→wartość na bazie 'settings'. */
export const kv = {
  async get(key) { const r = await db.get('settings', key); return r ? r.value : undefined; },
  async set(key, value) { return db.put('settings', { key, value }); },
  async del(key) { return db.delete('settings', key); },
};

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch (_) {}
  }
  return JSON.parse(JSON.stringify(value));
}
