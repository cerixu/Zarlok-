/* ==========================================================================
   backup.js — eksport / import całej bazy do jednego pliku JSON.
   Zakres: receptury, składniki (ceny), kategorie, notatki, ulubione,
   ustawienia, lista zakupów, historia zmian. Bez szkiców (draft:*).
   ========================================================================== */
import { db } from './db.js';
import { loadAll, state, setSetting, getSetting, normalizeRecipe, DEFAULT_SETTINGS, emit } from './recipes.js';
import { APP_VERSION } from './util.js';

const FORMAT = 'Kucharzyna';
const BACKUP_DUE_DAYS = 14;

/** Zbiera całą zawartość bazy. */
export async function collectData() {
  const [recipes, ingredients, categories, shoppingItems, settingsRaw, history] = await Promise.all([
    db.getAll('recipes'), db.getAll('ingredients'), db.getAll('categories'), db.getAll('shoppingItems'),
    db.getAll('settings'), db.getAll('history'),
  ]);
  // Do kopii trafiają ustawienia i postęp gotowania/kalkulatory; szkice pomijamy.
  const SECRET = new Set(['googleKey']);          // klucz API zostaje tylko w tym telefonie
  const settings = settingsRaw.filter((s) => !String(s.key).startsWith('draft:') && !SECRET.has(s.key));
  return { recipes, ingredients, categories, shoppingItems, settings, history };
}

export async function buildBackup() {
  return { app: FORMAT, version: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), data: await collectData() };
}

export const backupFilename = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `kucharzyna-kopia-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
};

/**
 * Zapis kopii: 1) arkusz udostępniania (iPhone: „Zachowaj w Plikach”), 2) pobranie pliku,
 * 3) schowek. Zwraca 'shared' | 'downloaded' | 'copied' | 'cancelled'.
 */
export async function exportBackup() {
  const backup = await buildBackup();
  const json = JSON.stringify(backup, null, 1);
  const name = backupFilename();
  const file = new File([json], name, { type: 'application/json' });
  let result = null;

  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try { await navigator.share({ files: [file], title: 'Kopia Kucharzyny' }); result = 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  if (!result) {
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      result = 'downloaded';
    } catch (_) { /* schowek poniżej */ }
  }
  if (!result) {
    try { await navigator.clipboard.writeText(json); result = 'copied'; } catch (_) { result = null; }
  }
  if (result) await setSetting('lastBackupAt', Date.now());
  return result;
}

export function backupDue() {
  const own = [...state.recipes.keys()].filter((id) => !String(id).startsWith('rcp_seed_')).length;
  const last = getSetting('lastBackupAt') || 0;
  if (!last) return own > 0;                       // przykładowe receptury same nie wymagają kopii
  return Date.now() - last > BACKUP_DUE_DAYS * 86400000;
}
export const daysSinceBackup = () => {
  const last = getSetting('lastBackupAt') || 0;
  return last ? Math.floor((Date.now() - last) / 86400000) : null;
};

/* ---------- Import ---------- */

/** Czyta i waliduje plik; zwraca { backup, summary } albo rzuca Error z opisem po polsku. */
export async function readBackupFile(file) {
  let text;
  try { text = await file.text(); } catch (_) { throw new Error('Nie udało się odczytać pliku.'); }
  return parseBackup(text);
}

export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (_) { throw new Error('To nie jest poprawny plik JSON.'); }
  if (!obj || obj.app !== FORMAT || !obj.data || typeof obj.data !== 'object') throw new Error('To nie jest kopia zapasowa Kucharzyny.');
  const d = obj.data;
  const arr = (x) => (Array.isArray(x) ? x : []);
  const data = {
    recipes: arr(d.recipes).filter((r) => r && r.id), ingredients: arr(d.ingredients).filter((r) => r && r.id),
    categories: arr(d.categories).filter((r) => r && r.id), shoppingItems: arr(d.shoppingItems).filter((r) => r && r.id),
    settings: arr(d.settings).filter((r) => r && r.key && !String(r.key).startsWith('draft:')), history: arr(d.history).filter((r) => r && r.id),
  };
  return {
    backup: { ...obj, data },
    summary: {
      recipes: data.recipes.length, categories: data.categories.length, shopping: data.shoppingItems.length,
      history: data.history.length, exportedAt: obj.exportedAt ? new Date(obj.exportedAt) : null,
    },
  };
}

/**
 * Wczytuje kopię. mode: 'replace' (wszystko zastępuje) | 'merge' (łączy).
 * Merge: nowsza receptura (updatedAt) wygrywa, historia/kategorie/zakupy są sumowane,
 * istniejące ustawienia zostają.
 */
export async function importBackup(backup, mode) {
  const d = backup.data;
  const recipes = d.recipes.map((r) => normalizeRecipe(r));

  if (mode === 'replace') {
    await db.tx(['recipes', 'ingredients', 'categories', 'shoppingItems', 'settings', 'history'], (t) => {
      ['recipes', 'ingredients', 'categories', 'shoppingItems', 'settings', 'history'].forEach((s) => t.clear(s));
      recipes.forEach((r) => t.put('recipes', r));
      d.ingredients.forEach((r) => t.put('ingredients', r));
      d.categories.forEach((r) => t.put('categories', r));
      d.shoppingItems.forEach((r) => t.put('shoppingItems', r));
      d.settings.forEach((r) => t.put('settings', r));
      d.history.forEach((r) => t.put('history', r));
      t.put('settings', { key: 'seeded', value: true });
    });
  } else {
    const existing = new Map(state.recipes);
    const cats = new Map(state.categories.map((c) => [c.id, c]));
    const hasHist = new Set((await db.getAll('history')).map((x) => x.id));
    const shopIds = new Set(state.shopping.map((x) => x.id));
    const catalog = new Map(state.catalog);
    await db.tx(['recipes', 'ingredients', 'categories', 'shoppingItems', 'history'], (t) => {
      recipes.forEach((r) => {
        const cur = existing.get(r.id);
        if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) t.put('recipes', r);
      });
      d.categories.forEach((c) => { if (!cats.has(c.id)) t.put('categories', c); });
      d.ingredients.forEach((i) => { const cur = catalog.get(i.id); if (!cur || (i.updatedAt || 0) > (cur.updatedAt || 0)) t.put('ingredients', i); });
      d.shoppingItems.forEach((s) => { if (!shopIds.has(s.id)) t.put('shoppingItems', s); });
      d.history.forEach((x) => { if (!hasHist.has(x.id)) t.put('history', x); });
    });
  }
  await loadAll();
  // Domyślne wartości dla brakujących ustawień.
  Object.keys(DEFAULT_SETTINGS).forEach((k) => { if (!(k in state.settings)) state.settings[k] = DEFAULT_SETTINGS[k]; });
  emit('settings'); emit('recipes'); emit('categories'); emit('shopping');
  return { recipes: state.recipes.size };
}

/** Kasuje wszystko i przywraca stan początkowy (bez przykładowych receptur — zależnie od flagi). */
export async function wipeAll({ keepSeeds = false } = {}) {
  await db.tx(['recipes', 'ingredients', 'categories', 'shoppingItems', 'settings', 'history'], (t) => {
    ['recipes', 'ingredients', 'categories', 'shoppingItems', 'settings', 'history'].forEach((s) => t.clear(s));
    if (!keepSeeds) t.put('settings', { key: 'seeded', value: true });
  });
  await loadAll();
  emit('settings'); emit('recipes'); emit('categories'); emit('shopping');
}
