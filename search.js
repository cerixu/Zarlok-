/* ==========================================================================
   search.js — wyszukiwanie przepisów w sieci bez wychodzenia z aplikacji.

   Strona na GitHub Pages nie ma własnego serwera, a przeglądarka nie może
   zapytać zwykłego Google o wyniki wyszukiwania (blokada CORS i regulamin).
   Dlatego działają trzy legalne drogi:

   1. Google — oficjalne API Google Programmable Search (własny, darmowy klucz,
      100 zapytań dziennie). Prawdziwe wyniki Google, w aplikacji.
   2. Baza przepisów TheMealDB — bez klucza, ze zdjęciami (kilkaset przepisów,
      po angielsku → tłumaczone na polski w aplikacji).
   3. Adres strony z przepisem — aplikacja pobiera stronę przez pośrednika CORS
      i czyta z niej dane przepisu (schema.org/Recipe).

   Tłumaczenie: MyMemory (darmowe API, bez klucza, ograniczony dzienny limit).
   Każde pobranie następuje wyłącznie po stuknięciu użytkownika.
   ========================================================================== */
import { getSetting } from './recipes.js';
import { parseRecipeText, parseIngredientLine, cleanStep, hostOf } from './importer.js';
import { blankRecipe, blankSection, blankStep } from './recipes.js';
import { norm } from './util.js';

const enc = encodeURIComponent;

/* ---------- Sieć ---------- */

export class SearchError extends Error {
  constructor(msg, code = 'error') { super(msg); this.code = code; }
}

async function fetchRaw(url, { ms = 10000, asJson = false } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new SearchError(`Serwer odpowiedział błędem ${res.status}`, 'http' + res.status);
    return asJson ? await res.json() : await res.text();
  } catch (e) {
    if (e instanceof SearchError) throw e;
    if (e && e.name === 'AbortError') throw new SearchError('Przekroczono czas oczekiwania na odpowiedź.', 'timeout');
    throw new SearchError(navigator.onLine ? 'Nie udało się połączyć z usługą.' : 'Brak połączenia z internetem.', navigator.onLine ? 'network' : 'offline');
  } finally { clearTimeout(timer); }
}
const getJson = (url, ms) => fetchRaw(url, { ms, asJson: true });

/* ---------- Pośrednik CORS (pobieranie stron z przepisami) ---------- */

const PUBLIC_PROXIES = [
  'https://api.allorigins.win/raw?url={url}',
  'https://corsproxy.io/?url={url}',
  'https://api.codetabs.com/v1/proxy/?quest={url}',
];

export function proxyList() {
  const mode = getSetting('proxyMode');
  if (mode === 'off') return [];
  if (mode === 'custom') {
    const t = (getSetting('proxyUrl') || '').trim();
    if (!t) return [];
    return [t.includes('{url}') ? t : t + (t.includes('?') ? '' : '?url=') + '{url}'];
  }
  return PUBLIC_PROXIES;
}

/** Pobiera HTML strony przez kolejne pośredniki, aż któryś odpowie sensowną treścią. */
export async function fetchPage(url) {
  if (!/^https?:\/\//i.test(url)) throw new SearchError('To nie jest poprawny adres strony.', 'badurl');
  const proxies = proxyList();
  if (!proxies.length) throw new SearchError('Pobieranie stron jest wyłączone w Ustawieniach (pośrednik CORS).', 'proxyoff');
  let last = null;
  for (const tpl of proxies) {
    try {
      const text = await fetchRaw(tpl.replace('{url}', enc(url)), { ms: 12000 });
      if (text && text.length > 300 && text.includes('<')) return text;
      last = new SearchError('Pośrednik zwrócił pustą odpowiedź.', 'empty');
    } catch (e) { last = e; if (e.code === 'offline') throw e; }
  }
  throw last || new SearchError('Nie udało się pobrać strony.', 'network');
}

/* ---------- Słowniczek zapytań PL → EN (baza TheMealDB jest angielska) ---------- */

const PL_EN = {
  kurczak: 'chicken', kurczaka: 'chicken', drob: 'chicken', wolowina: 'beef', wolowe: 'beef', wieprzowina: 'pork', schab: 'pork', jagniecina: 'lamb', ryba: 'fish', ryby: 'fish', losos: 'salmon',
  dorsz: 'cod', krewetki: 'prawn', krewetka: 'prawn', 'owoce morza': 'seafood', makaron: 'pasta', spaghetti: 'spaghetti', ryz: 'rice', zupa: 'soup', zupy: 'soup', ciasto: 'cake', ciasta: 'cake', sernik: 'cheesecake',
  szarlotka: 'apple', jablko: 'apple', jablka: 'apple', nalesniki: 'pancakes', placki: 'pancakes', salatka: 'salad', jajka: 'egg', jajko: 'egg', jajecznica: 'egg', ser: 'cheese', ziemniaki: 'potato', ziemniak: 'potato',
  kapusta: 'cabbage', pomidor: 'tomato', pomidory: 'tomato', grzyby: 'mushroom', pieczarki: 'mushroom', czekolada: 'chocolate', deser: 'dessert', desery: 'dessert', chleb: 'bread', gulasz: 'goulash', kotlet: 'cutlet',
  schabowy: 'schnitzel', sniadanie: 'breakfast', wegetarianskie: 'vegetarian', wegetarianski: 'vegetarian', wegansko: 'vegan', weganskie: 'vegan', cebula: 'onion', czosnek: 'garlic', marchew: 'carrot', dynia: 'pumpkin',
  banan: 'banana', truskawki: 'strawberry', mieso: 'beef', mielone: 'mince', fasola: 'beans', soczewica: 'lentil', ciecierzyca: 'chickpea', tuńczyk: 'tuna', tunczyk: 'tuna', indyk: 'turkey', kaczka: 'duck', ostre: 'spicy',
  pierogi: 'pierogi', bigos: 'bigos', zurek: 'zurek', barszcz: 'borscht', golabki: 'cabbage rolls', rosol: 'chicken soup', tort: 'cake', bulki: 'bread', ciastka: 'cookies', kremowy: 'creamy', pieczony: 'baked', zapiekanka: 'bake',
};

const hasDiacritics = (s) => /[ąćęłńóśźż]/i.test(s);

/** Przygotowuje zapytanie dla bazy angielskiej: słownik, a w ostateczności tłumaczenie przez MyMemory. */
export async function toEnglishQuery(q) {
  const toks = norm(q).split(/\s+/).filter(Boolean);
  const mapped = toks.map((t) => PL_EN[t]).filter(Boolean);
  if (mapped.length) return mapped.join(' ');
  const raw = q.trim();
  if (!hasDiacritics(raw) && /^[\x00-\x7f]+$/.test(raw)) return raw;     // wygląda już na angielskie / nazwę własną
  try { return (await translateText(raw, 'pl', 'en')).trim() || raw; } catch (_) { return raw; }
}

/* ---------- TheMealDB ---------- */

const MEALDB = 'https://www.themealdb.com/api/json/v1/1/';
const AREA = { Italian: 'IT', Polish: 'PL', French: 'FR', Spanish: 'ES', German: 'DE', Greek: 'GR', Portuguese: 'PT', British: 'GB', Hungarian: 'HU', Turkish: 'TR', Moroccan: 'MA', Indian: 'IN',
  Chinese: 'CN', Japanese: 'JP', Thai: 'TH', Vietnamese: 'VN', American: 'US', Mexican: 'MX', Croatian: 'HR', Irish: 'IE', Dutch: 'NL' };
const MEAL_CAT = { Beef: 'cat-mieso', Chicken: 'cat-mieso', Lamb: 'cat-mieso', Pork: 'cat-mieso', Goat: 'cat-mieso', Seafood: 'cat-owoce-morza', Pasta: 'cat-pasta', Dessert: 'cat-desery',
  Vegetarian: 'cat-warzywa', Vegan: 'cat-warzywa', Side: 'cat-warzywa', Starter: 'cat-inne', Breakfast: 'cat-inne', Miscellaneous: 'cat-inne' };

const mealItem = (m) => ({
  id: 'mealdb:' + m.idMeal, provider: 'mealdb', title: m.strMeal, thumb: m.strMealThumb ? m.strMealThumb + '/small' : '',
  snippet: [m.strCategory, m.strArea].filter(Boolean).join(' · ') || 'TheMealDB', source: 'TheMealDB', url: m.strSource || '', lang: 'en', mealId: m.idMeal, meal: m.strInstructions ? m : null,
});

export async function searchMealDb(q) {
  const en = await toEnglishQuery(q);
  const j = await getJson(MEALDB + 'search.php?s=' + enc(en));
  let meals = j && j.meals;
  if (!meals) {
    const first = en.split(/\s+/)[0];
    const k = await getJson(MEALDB + 'filter.php?i=' + enc(first.replace(/\s+/g, '_')));       // po składniku głównym
    meals = (k && k.meals) || [];
  }
  return meals.slice(0, 24).map(mealItem);
}

export async function randomMeal() {
  const j = await getJson(MEALDB + 'random.php');
  return j && j.meals && j.meals[0] ? mealItem(j.meals[0]) : null;
}

function splitInstructions(text) {
  let parts = String(text || '').replace(/\r/g, '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  parts = parts.filter((l) => !/^(step\s*)?\d+\.?$/i.test(l));
  if (parts.length <= 2 && text.length > 300) {
    const sentences = String(text).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
    parts = []; let cur = '';
    for (const s of sentences) { if ((cur + ' ' + s).length > 240 && cur) { parts.push(cur.trim()); cur = s; } else cur += ' ' + s; }
    if (cur.trim()) parts.push(cur.trim());
  }
  return parts.map((l) => cleanStep(l.replace(/^step\s*\d+[:.)-]?\s*/i, ''))).filter((l) => l.length > 2);
}

export function mealToRecipe(m) {
  const sec = blankSection('');
  for (let i = 1; i <= 20; i++) {
    const name = (m['strIngredient' + i] || '').trim();
    if (!name) continue;
    const measure = (m['strMeasure' + i] || '').trim();
    const ing = parseIngredientLine(`${measure} ${name}`.trim());
    if (ing) { delete ing._warn; sec.ingredients.push(ing); }
  }
  const r = blankRecipe({
    name: m.strMeal, category: MEAL_CAT[m.strCategory] || 'cat-inne', origin: AREA[m.strArea] || '', sections: [sec],
    steps: splitInstructions(m.strInstructions).map(blankStep), tags: [m.strCategory, m.strArea, ...(m.strTags ? m.strTags.split(',') : [])].filter(Boolean).map((t) => t.trim().toLowerCase()),
    source: 'TheMealDB', sourceUrl: m.strSource || (m.strYoutube ? m.strYoutube : ''), servings: 4,
    description: [m.strArea ? `Kuchnia: ${m.strArea}.` : '', m.strCategory ? `Kategoria: ${m.strCategory}.` : ''].filter(Boolean).join(' '),
  });
  return r;
}

/* ---------- Google Programmable Search ---------- */

export const googleConfigured = () => !!(getSetting('googleKey') && getSetting('googleCx'));

export async function searchGoogle(q, start = 1) {
  const key = getSetting('googleKey'), cx = getSetting('googleCx');
  if (!key || !cx) throw new SearchError('Brak klucza Google — ustaw go w Ustawieniach.', 'nokey');
  const query = /przepis|receptur|recipe|jak zrobi|jak upiec/i.test(q) ? q : q + ' przepis';
  let j;
  try { j = await getJson(`https://www.googleapis.com/customsearch/v1?key=${enc(key)}&cx=${enc(cx)}&q=${enc(query)}&num=10&start=${start}&hl=pl&safe=active`); }
  catch (e) {
    if (e.code === 'http403' || e.code === 'http429') throw new SearchError('Google odmówił: limit 100 zapytań dziennie wyczerpany albo klucz nie ma włączonego Custom Search API.', 'quota');
    if (e.code === 'http400') throw new SearchError('Google: nieprawidłowy klucz API lub identyfikator wyszukiwarki (cx).', 'badkey');
    throw e;
  }
  return (j.items || []).map((it) => {
    const pm = it.pagemap || {};
    const thumb = (pm.cse_thumbnail && pm.cse_thumbnail[0] && pm.cse_thumbnail[0].src) || (pm.cse_image && pm.cse_image[0] && pm.cse_image[0].src) || '';
    return { id: 'g:' + it.link, provider: 'google', title: String(it.title || '').replace(/\s*[|\-–—].*$/, '').trim() || it.title, snippet: (it.snippet || '').replace(/\s+/g, ' '),
      thumb, source: it.displayLink || hostOf(it.link), url: it.link, lang: 'pl' };
  });
}

/* ---------- Wczytanie pełnego przepisu ---------- */

const ogImage = (html) => { const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i); return m ? m[1] : ''; };

export async function loadFromUrl(url) {
  const html = await fetchPage(url);
  const { recipe, issues } = parseRecipeText(html, { url });
  const n = recipe.sections.reduce((a, s) => a + s.ingredients.length, 0);
  if (!n && !recipe.steps.length) throw new SearchError('Na tej stronie nie znalazłem danych przepisu. Spróbuj innego wyniku albo wklej tekst w Imporcie.', 'norecipe');
  if (!recipe.name) { const t = html.match(/<title[^>]*>([^<]+)<\/title>/i); if (t) recipe.name = t[1].replace(/\s*[|\-–—].*$/, '').trim(); }
  recipe.sourceUrl = url;
  recipe.source = recipe.source || hostOf(url);
  return { recipe, issues, lang: detectLang(`${recipe.name} ${recipe.steps.map((s) => s.text).join(' ')}`), image: ogImage(html) };
}

export async function loadItem(item) {
  if (item.provider === 'mealdb') {
    let meal = item.meal;
    if (!meal) { const j = await getJson(MEALDB + 'lookup.php?i=' + enc(item.mealId)); meal = j && j.meals && j.meals[0]; }
    if (!meal) throw new SearchError('Nie znaleziono przepisu w bazie.', 'norecipe');
    return { recipe: mealToRecipe(meal), issues: [], lang: 'en', image: meal.strMealThumb || '' };
  }
  return loadFromUrl(item.url);
}

/** Próba pobrania zdjęcia (best-effort: bez CORS się nie uda — wtedy zostaje ilustracja). */
export async function fetchImageBlob(url) {
  if (!url) return null;
  const tries = [url, ...proxyList().map((p) => p.replace('{url}', enc(url)))];
  for (const u of tries) {
    try {
      const res = await fetch(u, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) continue;
      const b = await res.blob();
      if (b.type.startsWith('image/') && b.size > 1500 && b.size < 8e6) return b;
    } catch (_) { /* spróbuj następnego */ }
  }
  return null;
}

/* ---------- Język i tłumaczenie (MyMemory) ---------- */

export function detectLang(text) {
  const t = ' ' + String(text).toLowerCase() + ' ';
  const pl = (t.match(/[ąćęłńóśźż]/g) || []).length * 3 + (t.match(/\s(i|w|z|na|do|że|się|oraz|dodaj|wymieszaj|gotuj|piecz|minut|posyp|dopraw)\s/g) || []).length;
  const en = (t.match(/\s(the|and|with|until|minutes|stir|add|mix|bake|cook|heat|over|into|then|for|about)\s/g) || []).length;
  return pl >= en ? 'pl' : 'en';
}

function chunk(text, max = 450) {
  const out = [];
  let cur = '';
  for (const piece of String(text).split(/(?<=[.!?;:])\s+/)) {
    if (piece.length > max) { if (cur) { out.push(cur); cur = ''; } for (let i = 0; i < piece.length; i += max) out.push(piece.slice(i, i + max)); continue; }
    if ((cur + ' ' + piece).trim().length > max) { out.push(cur.trim()); cur = piece; } else cur = (cur + ' ' + piece).trim();
  }
  if (cur) out.push(cur);
  return out;
}

export async function translateText(text, from = 'en', to = 'pl') {
  const t = String(text || '').trim();
  if (!t) return '';
  const email = (getSetting('mmEmail') || '').trim();
  const parts = [];
  for (const c of chunk(t)) {
    const j = await getJson(`https://api.mymemory.translated.net/get?q=${enc(c)}&langpair=${from}|${to}${email ? '&de=' + enc(email) : ''}`, 9000);
    const out = j && j.responseData && j.responseData.translatedText;
    if (!out || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(out) || (j.quotaFinished === true)) {
      throw new SearchError('Dzienny limit darmowych tłumaczeń (MyMemory) wyczerpany. Wpisz e-mail w Ustawieniach, by go zwiększyć, albo spróbuj jutro.', 'quota');
    }
    parts.push(out);
  }
  return parts.join(' ');
}

/** Tłumaczy nazwę, opis i kroki na polski (składniki zostały już przetłumaczone słownikiem importera). */
export async function translateRecipe(recipe, onProgress = () => {}) {
  const r = { ...recipe, steps: recipe.steps.map((s) => ({ ...s })), sections: recipe.sections.map((s) => ({ ...s, ingredients: s.ingredients.map((i) => ({ ...i })) })) };
  const total = 1 + r.steps.length + (r.description ? 1 : 0);
  let done = 0;
  const tick = () => onProgress(++done, total);
  r.name = (await translateText(r.name)) || r.name; tick();
  if (r.description) { r.description = (await translateText(r.description)) || r.description; tick(); }
  for (const st of r.steps) { st.text = (await translateText(st.text)) || st.text; tick(); }
  // Nazwy składników wciąż po angielsku (nieznane słownikowi) — pojedynczo, tylko ASCII.
  for (const sec of r.sections) for (const ing of sec.ingredients) {
    if (/^[A-Za-z][A-Za-z\s'-]{2,}$/.test(ing.name) && /^[A-Z]/.test(ing.name) && !/[ąćęłńóśźż]/i.test(ing.name)) {
      try { const t = await translateText(ing.name); if (t && t.length < 60) ing.name = t.charAt(0).toUpperCase() + t.slice(1); } catch (e) { if (e.code === 'quota') break; }
    }
  }
  return r;
}

/* ---------- Historia wyszukiwań ---------- */

export const SUGGESTIONS = ['pierogi', 'żurek', 'sernik', 'kurczak', 'makaron', 'zupa', 'ciasto drożdżowe', 'sałatka', 'zapiekanka', 'tiramisu'];
