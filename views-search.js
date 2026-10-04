/* ==========================================================================
   views-search.js — „Szukaj w sieci”: wyniki w aplikacji, podgląd przepisu,
   tłumaczenie na polski i dodawanie do książki jednym stuknięciem.
   ========================================================================== */
import { h, icon, screen, button, iconBtn, toast, openSheet, emptyState } from './ui.js';
import { navigate, goBack } from './router.js';
import { getSetting, setSetting, saveRecipe, listRecipes, catName } from './recipes.js';
import { looksLikeUrl, hostOf } from './importer.js';
import { qtyParts } from './components.js';
import { fmtMinutes } from './util.js';
import { compressPhoto } from './views-editor.js';
import {
  searchGoogle, searchMealDb, randomMeal, loadItem, translateRecipe, fetchImageBlob, googleConfigured, proxyList, SUGGESTIONS, SearchError,
} from './search.js';

const vs = { q: '', source: null, results: [], more: 0, error: null, loading: false, searched: false };
const cache = new Map();       // id wyniku → { recipe, issues, lang, image, translated }
const added = new Map();       // id wyniku → id receptury w książce

function openGoogleHelp() {
  const step = (n, kids) => h('li', { class: 'help-step' }, h('span', { class: 'help-n' }, String(n)), h('div', null, ...kids));
  const link = (href, text) => h('a', { class: 'ext', href, target: '_blank', rel: 'noopener noreferrer' }, icon('link', 16), text);
  openSheet({
    title: 'Google w aplikacji', variant: 'sheet',
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Zwykłego Google nie da się odpytać ze strony bez serwera, ale Google ma oficjalne API: 100 darmowych zapytań dziennie. Potrzebujesz własnego klucza (5 minut, jednorazowo):'),
      h('ol', { class: 'help-list' },
        step(1, [h('strong', null, 'Wyszukiwarka. '), 'Wejdź na ', link('https://programmablesearchengine.google.com/', 'programmablesearchengine.google.com'), ' → Dodaj → zaznacz „Przeszukuj całą sieć” → Utwórz. Skopiuj „Identyfikator wyszukiwarki” (cx).']),
        step(2, [h('strong', null, 'Klucz API. '), 'Wejdź na ', link('https://console.cloud.google.com/apis/library/customsearch.googleapis.com', 'Google Cloud'), ', wybierz/utwórz projekt i włącz „Custom Search API”. Potem Dane logowania → Utwórz dane logowania → Klucz API.']),
        step(3, [h('strong', null, 'Wklej w aplikacji. '), 'Ustawienia → Wyszukiwanie w sieci → wpisz klucz i cx → „Sprawdź”.'])),
      h('p', { class: 'muted small' }, 'Klucz jest zapisany tylko w tym telefonie i nie trafia do kopii zapasowej. Bez klucza możesz szukać w wbudowanej bazie przepisów albo wkleić adres strony.')),
    actions: [{ label: 'Zamknij', kind: 'ghost' }, { label: 'Otwórz Ustawienia', kind: 'primary', icon: 'sliders', onClick: () => navigate('/settings') }],
  });
}

/* ---------- Podgląd i dodawanie ---------- */

async function addToLibrary(item, data, { silent = false } = {}) {
  let rec = data.recipe;
  if (added.has(item.id)) { toast('Ta receptura jest już w Twojej książce', { action: { label: 'Otwórz', fn: () => navigate('/recipe/' + added.get(item.id)) } }); return added.get(item.id); }
  if (rec.sourceUrl && listRecipes().some((r) => r.sourceUrl === rec.sourceUrl && rec.sourceUrl)) {
    const dup = listRecipes().find((r) => r.sourceUrl === rec.sourceUrl);
    toast('Masz już recepturę z tego adresu', { action: { label: 'Otwórz', fn: () => navigate('/recipe/' + dup.id) } });
    added.set(item.id, dup.id);
    return dup.id;
  }
  let note = '';
  if (data.lang === 'en' && !data.translated && getSetting('autoTranslate')) {
    const t = toast('Tłumaczę na polski…', { sticky: true });
    try { rec = await translateRecipe(rec); data.translated = true; data.recipe = rec; }
    catch (e) { note = e.code === 'quota' ? e.message : 'Nie udało się przetłumaczyć — zapisuję oryginał.'; }
    t.dismiss();
  }
  rec = { ...rec };
  try {
    const blob = await fetchImageBlob(data.image);
    if (blob) { const { photo, thumb } = await compressPhoto(blob); rec.photo = photo; rec.thumb = thumb; }
  } catch (_) { /* zostaje ilustracja */ }
  const saved = await saveRecipe(rec);
  added.set(item.id, saved.id);
  if (!silent) toast(note ? `Dodano. ${note}` : 'Dodano do Twoich receptur', { ms: note ? 6000 : 5000, action: { label: 'Otwórz', fn: () => navigate('/recipe/' + saved.id) } });
  return saved.id;
}

function recipePreview(data) {
  const r = data.recipe;
  const fact = (ico, text) => (text ? h('span', { class: 'fact' }, icon(ico, 18), text) : null);
  return h('div', { class: 'stack' },
    h('h3', { class: 'import-name' }, r.name || '(bez nazwy)'),
    h('div', { class: 'facts' }, fact('users', r.servings ? `${r.servings} porcji` : ''), fact('clock', fmtMinutes((r.prepTime || 0) + (r.cookTime || 0))), fact('tag', catName(r.category))),
    r.sections.map((sec) => h('div', { class: 'ing-section' }, sec.name ? h('div', { class: 'tape' }, sec.name) : null,
      h('ul', { class: 'ing-list' }, sec.ingredients.map((i) => { const q = qtyParts(i); return h('li', { class: 'ing' }, h('span', { class: 'ing-name' }, i.name), h('span', { class: 'ing-qty' }, h('span', { class: 'amt num' }, q.num), h('span', { class: 'unit' }, q.unit))); })))),
    r.steps.length ? h('ol', { class: 'steps compact' }, r.steps.map((st) => h('li', null, h('span', { class: 'step-text' }, st.text)))) : null,
    data.issues && data.issues.length ? h('div', { class: 'banner warn' }, h('div', { class: 'banner-text' }, h('strong', null, 'Do sprawdzenia po dodaniu'), h('ul', { class: 'plain small' }, data.issues.slice(0, 4).map((i) => h('li', null, i))))) : null);
}

export function openPreview(item, onAdded) {
  const holder = h('div', { class: 'stack' }, h('div', { class: 'loading-row' }, h('span', { class: 'spinner' }), h('span', null, 'Pobieram przepis…')));
  let data = cache.get(item.id) || null;
  const sheet = openSheet({
    title: item.title || 'Przepis', variant: 'sheet', cls: 'tall', body: holder,
    actions: [{ label: 'Zamknij', kind: 'ghost' },
      { label: 'Dodaj do receptur', kind: 'primary', icon: 'plus', disabled: true, onClick: async () => { const id = await addToLibrary(item, data); if (onAdded) onAdded(id); } }],
  });
  const addBtn = sheet.panel.querySelector('.panel-foot .btn.primary');

  const render = () => {
    const kids = [recipePreview(data)];
    const tools = [];
    if (data.lang === 'en' && !data.translated) tools.push(button('Przetłumacz na polski', { icon: 'globe', block: true, onClick: async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      const label = btn.querySelector('span');
      try {
        const rec = await translateRecipe(data.recipe, (d, t) => { label.textContent = `Tłumaczę… ${d}/${t}`; });
        data.recipe = rec; data.translated = true; cache.set(item.id, data); render();
      } catch (err) { toast(err.message || 'Nie udało się przetłumaczyć', { type: 'error', ms: 5000 }); btn.disabled = false; label.textContent = 'Przetłumacz na polski'; }
    } }));
    if (item.url) tools.push(h('a', { class: 'ext', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, icon('link', 16), 'Otwórz oryginał: ' + (hostOf(item.url) || item.url)));
    holder.replaceChildren(...kids, ...tools);
    addBtn.disabled = false;
  };

  (async () => {
    try {
      if (!data) { data = await loadItem(item); cache.set(item.id, data); }
      render();
    } catch (e) {
      holder.replaceChildren(h('div', { class: 'banner warn' }, h('div', { class: 'banner-text' }, h('strong', null, 'Nie udało się pobrać przepisu'), h('span', { class: 'muted' }, e.message || 'Nieznany błąd.'))),
        item.url ? h('a', { class: 'ext', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, icon('link', 16), 'Otwórz stronę w przeglądarce') : null,
        h('p', { class: 'muted small' }, 'Możesz też skopiować tekst przepisu i wkleić go w Importuj recepturę.'),
        button('Importuj recepturę', { icon: 'upload', onClick: () => { sheet.close(); navigate('/import'); } }));
    }
  })();
}

/* ---------- Widok ---------- */

export function searchView(query) {
  const q0 = (query && query.get && query.get('q')) || '';
  if (q0) { vs.q = q0; vs.results = []; vs.searched = false; vs.error = null; }
  if (!vs.source) vs.source = googleConfigured() ? 'google' : 'mealdb';

  const input = h('input', { class: 'input search-input', type: 'search', placeholder: 'Czego szukasz? np. pierogi, sernik, curry…', value: vs.q, 'aria-label': 'Szukaj przepisu',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search' });
  const goBtn = button('Szukaj', { kind: 'primary', icon: 'search', onClick: () => run() });
  const sources = h('div', { class: 'chips', role: 'group', 'aria-label': 'Źródło' });
  const body = h('div', { class: 'stack' });
  const sub = h('div', { class: 'subbar' }, h('div', { class: 'searchbar' }, h('div', { class: 'searchbox' }, icon('search', 20), input), goBtn), sources);
  const s = screen({ title: 'Szukaj w sieci', left: iconBtn('left', 'Wstecz', () => goBack('/recipes')), right: iconBtn('upload', 'Importuj ręcznie', () => navigate('/import')), sub, cls: 'search' });
  s.content.append(body);

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); run(); } });

  function paintSources() {
    const mk = (id, label, ico) => h('button', { type: 'button', class: 'chip' + (vs.source === id ? ' on' : ''), 'aria-pressed': vs.source === id,
      onClick: () => { vs.source = id; vs.results = []; vs.error = null; vs.searched = false; paintSources(); paint(); if (vs.q && id !== 'url' && !looksLikeUrl(vs.q)) run(); } }, icon(ico, 16), label);
    sources.replaceChildren(mk('google', 'Google', 'search'), mk('mealdb', 'Baza przepisów', 'book'), mk('url', 'Adres strony', 'link'));
  }

  const addState = (item) => added.has(item.id);

  function resultCard(item) {
    const quick = h('button', { type: 'button', class: 'sr-add' + (addState(item) ? ' done' : ''), 'aria-label': addState(item) ? `Dodano: ${item.title}` : `Dodaj do receptur: ${item.title}`,
      onClick: async (e) => {
        e.stopPropagation();
        if (addState(item)) { navigate('/recipe/' + added.get(item.id)); return; }
        quick.classList.add('busy'); quick.disabled = true;
        try {
          let data = cache.get(item.id);
          if (!data) { data = await loadItem(item); cache.set(item.id, data); }
          await addToLibrary(item, data);
          paint();
        } catch (err) { toast(err.message || 'Nie udało się dodać', { type: 'error', ms: 5000 }); quick.classList.remove('busy'); quick.disabled = false; }
      } }, icon(addState(item) ? 'check' : 'plus', 22));
    return h('div', { class: 'sr-card' },
      h('button', { type: 'button', class: 'sr-main', onClick: () => openPreview(item, () => paint()), 'aria-label': `Podgląd: ${item.title}` },
        item.thumb ? h('img', { class: 'sr-thumb', src: item.thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => e.currentTarget.replaceWith(h('div', { class: 'sr-thumb ph' }, icon('image', 24))) })
          : h('div', { class: 'sr-thumb ph' }, icon('image', 24)),
        h('div', { class: 'sr-text' }, h('div', { class: 'sr-title' }, item.title), item.snippet ? h('div', { class: 'sr-snippet' }, item.snippet) : null, h('div', { class: 'sr-source' }, item.source))),
      quick);
  }

  function paint() {
    const kids = [];
    if (!navigator.onLine) kids.push(h('div', { class: 'banner warn' }, h('div', { class: 'banner-text' }, h('strong', null, 'Jesteś offline'), h('span', { class: 'muted' }, 'Wyszukiwanie wymaga internetu. Twoje receptury działają normalnie.'))));
    if (vs.source === 'url') {
      kids.push(h('div', { class: 'card stack' }, h('h2', { class: 'card-title' }, icon('link', 20), 'Wklej adres strony z przepisem'),
        h('p', { class: 'muted' }, 'Aplikacja pobierze stronę i wczyta z niej przepis (nazwę, składniki, kroki, czasy, zdjęcie). Wpisz adres powyżej i stuknij „Szukaj”.'),
        !proxyList().length ? h('p', { class: 'small warn-text' }, 'Pobieranie stron jest wyłączone — włącz pośrednika w Ustawieniach.') : null,
        button('Wklej ze schowka', { icon: 'copy', onClick: async () => { try { const t = (await navigator.clipboard.readText()).trim(); if (looksLikeUrl(t)) { input.value = t; run(); } else toast('W schowku nie ma adresu strony'); } catch (_) { toast('Safari nie pozwoliło odczytać schowka — wklej adres w pole wyżej', { type: 'error' }); } } })));
    } else if (vs.source === 'google' && !googleConfigured()) {
      kids.push(h('div', { class: 'card stack' }, h('h2', { class: 'card-title' }, icon('key', 20), 'Google w aplikacji wymaga klucza'),
        h('p', { class: 'muted' }, 'To oficjalne, darmowe API Google (100 zapytań dziennie). Konfiguracja zajmuje kilka minut i robisz ją raz.'),
        h('div', { class: 'row wrap gap' }, button('Jak to ustawić', { kind: 'primary', icon: 'info', onClick: openGoogleHelp }), button('Użyj bazy przepisów', { onClick: () => { vs.source = 'mealdb'; paintSources(); paint(); if (vs.q) run(); } }))));
    }
    if (vs.loading) kids.push(h('div', { class: 'loading-row' }, h('span', { class: 'spinner' }), h('span', null, 'Szukam…')),
      ...Array.from({ length: 3 }, () => h('div', { class: 'sr-card skeleton' })));
    else if (vs.error) kids.push(h('div', { class: 'banner warn' }, h('div', { class: 'banner-text' }, h('strong', null, 'Nie udało się wyszukać'), h('span', { class: 'muted' }, vs.error.message || String(vs.error))),
      h('div', { class: 'row wrap gap' }, button('Spróbuj ponownie', { sm: true, onClick: () => run() }), vs.error.code === 'quota' || vs.error.code === 'badkey' || vs.error.code === 'nokey' ? button('Jak ustawić Google', { sm: true, kind: 'ghost', onClick: openGoogleHelp }) : null)));
    else if (vs.results.length) {
      kids.push(h('p', { class: 'muted counter' }, `${vs.results.length} wyników · ${vs.source === 'google' ? 'Google' : 'TheMealDB'}`));
      kids.push(h('div', { class: 'list' }, vs.results.map(resultCard)));
      if (vs.source === 'google' && vs.more && vs.more < 91) kids.push(button('Więcej wyników', { block: true, onClick: () => run(true) }));
      if (vs.source === 'mealdb') kids.push(h('p', { class: 'muted small' }, 'Baza TheMealDB zawiera kilkaset przepisów (po angielsku). Przepisy są tłumaczone na polski przy dodawaniu.'));
    } else if (vs.searched && vs.source !== 'url') {
      kids.push(emptyState('🔎', 'Brak wyników', `Nic nie znalazłem dla „${vs.q}”. Spróbuj innego słowa${vs.source === 'mealdb' ? ' (baza jest angielska — działają np. kurczak, makaron, sernik)' : ''}.`));
    } else if (!(vs.source === 'google' && !googleConfigured()) && vs.source !== 'url') {
      const hist = getSetting('searchHistory') || [];
      kids.push(h('h3', { class: 'group-title' }, 'Spróbuj'), h('div', { class: 'chips wrap' }, [...hist.slice(0, 6), ...SUGGESTIONS.filter((x) => !hist.includes(x))].slice(0, 12).map((x) => h('button', { type: 'button', class: 'chip', onClick: () => { input.value = x; run(); } }, x))));
    }
    if (vs.source === 'mealdb' || vs.source === 'google') {
      kids.push(h('div', { class: 'row wrap gap center pad' }, vs.source === 'mealdb' ? button('Wylosuj przepis', { icon: 'shuffle', onClick: async () => {
        try { const m = await randomMeal(); if (m) openPreview(m, () => paint()); } catch (e) { toast(e.message || 'Nie udało się wylosować', { type: 'error' }); }
      } }) : null, vs.source === 'google' && googleConfigured() ? button('Ustawienia Google', { kind: 'ghost', icon: 'sliders', onClick: () => navigate('/settings') }) : null));
    }
    body.replaceChildren(...kids);
  }

  async function run(more = false) {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    if (!navigator.onLine) { vs.error = new SearchError('Brak połączenia z internetem.', 'offline'); paint(); return; }
    vs.q = q; vs.error = null;
    if (looksLikeUrl(q)) {
      vs.source = 'url'; paintSources(); paint();
      openPreview({ id: 'u:' + q, provider: 'url', url: q, title: hostOf(q) || 'Przepis', source: hostOf(q) }, () => paint());
      return;
    }
    if (vs.source === 'url') { toast('Wpisz pełny adres zaczynający się od https://', { type: 'error' }); return; }
    if (vs.source === 'google' && !googleConfigured()) { paint(); return; }
    vs.loading = true; if (!more) { vs.results = []; vs.more = 0; } paint();
    try {
      let list;
      if (vs.source === 'google') { list = await searchGoogle(q, more ? vs.more + 1 : 1); vs.more = (more ? vs.more : 0) + list.length; vs.results = more ? [...vs.results, ...list] : list; }
      else { list = await searchMealDb(q); vs.results = list; }
      const hist = [q, ...(getSetting('searchHistory') || []).filter((x) => x !== q)].slice(0, 8);
      setSetting('searchHistory', hist);
    } catch (e) { console.error(e); vs.error = e; vs.results = []; }
    vs.loading = false; vs.searched = true; paint();
  }

  const onNet = () => paint();
  window.addEventListener('online', onNet); window.addEventListener('offline', onNet);
  paintSources(); paint();
  if (query && query.get && query.get('help')) setTimeout(openGoogleHelp, 200);
  if (q0 && vs.q) setTimeout(() => run(), 50);
  return { el: s.el, destroy: () => { window.removeEventListener('online', onNet); window.removeEventListener('offline', onNet); } };
}
