/* ==========================================================================
   db.js — cienka warstwa nad IndexedDB.
   Magazyny: recipes, ingredients, categories, shoppingItems, settings, history.
   Każdy rekord ma stabilne ID (settings: klucz tekstowy).
   ========================================================================== */

const DB_NAME = 'kucharzyna-db';
const DB_VERSION = 1;

export const STORES = {
  recipes: 'id',          // receptury (ze składnikami, sekcjami, krokami)
  ingredients: 'id',      // katalog składników z cenami (id = znormalizowana nazwa)
  categories: 'id',       // kategorie (wbudowane + własne)
  shoppingItems: 'id',    // lista zakupów
  settings: 'key',        // ustawienia + postęp gotowania + szkice
  history: 'id',          // historia zmian receptur (migawki)
};

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('Ta przeglądarka nie udostępnia IndexedDB.'));
    const rq = indexedDB.open(DB_NAME, DB_VERSION);
    rq.onupgradeneeded = () => {
      const d = rq.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!d.objectStoreNames.contains(name)) {
          const s = d.createObjectStore(name, { keyPath });
          if (name === 'history') s.createIndex('recipeId', 'recipeId');
        }
      }
    };
    rq.onsuccess = () => {
      const d = rq.result;
      // Gdy inna karta/wersja chce zaktualizować bazę — zamknij i pozwól otworzyć ponownie.
      d.onversionchange = () => { d.close(); dbPromise = null; };
      resolve(d);
    };
    rq.onerror = () => { dbPromise = null; reject(rq.error); };
  });
  return dbPromise;
}

const wrap = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
const done = (t) => new Promise((res, rej) => {
  t.oncomplete = () => res();
  t.onerror = () => rej(t.error);
  t.onabort = () => rej(t.error || new Error('Transakcja przerwana'));
});

export const db = {
  async getAll(store) { const d = await openDB(); return wrap(d.transaction(store).objectStore(store).getAll()); },
  async get(store, key) { const d = await openDB(); return wrap(d.transaction(store).objectStore(store).get(key)); },
  async byIndex(store, index, key) { const d = await openDB(); return wrap(d.transaction(store).objectStore(store).index(index).getAll(key)); },
  async put(store, val) { const d = await openDB(); const t = d.transaction(store, 'readwrite'); t.objectStore(store).put(val); return done(t); },
  async putMany(store, vals) { const d = await openDB(); const t = d.transaction(store, 'readwrite'); const s = t.objectStore(store); vals.forEach((v) => s.put(v)); return done(t); },
  async delete(store, key) { const d = await openDB(); const t = d.transaction(store, 'readwrite'); t.objectStore(store).delete(key); return done(t); },
  async clear(store) { const d = await openDB(); const t = d.transaction(store, 'readwrite'); t.objectStore(store).clear(); return done(t); },

  /** Atomowa transakcja na wielu magazynach: fn dostaje { put, delete, clear }. */
  async tx(stores, fn) {
    const d = await openDB();
    const t = d.transaction(stores, 'readwrite');
    fn({
      put: (s, v) => t.objectStore(s).put(v),
      delete: (s, k) => t.objectStore(s).delete(k),
      clear: (s) => t.objectStore(s).clear(),
    });
    return done(t);
  },
};

/** Prosty magazyn klucz→wartość na bazie 'settings' (bez pamięci podręcznej). */
export const kv = {
  async get(key) { const r = await db.get('settings', key); return r ? r.value : undefined; },
  async set(key, value) { return db.put('settings', { key, value }); },
  async del(key) { return db.delete('settings', key); },
};
