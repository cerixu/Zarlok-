/* ==========================================================================
   views-recipes.js — lista receptur: wyszukiwarka, kategorie, filtry,
   sortowanie, ulubione, ostatnie, tradycyjne na górze + menedżer kategorii.
   ========================================================================== */
import {
  h, icon, screen, button, iconBtn, openSheet, confirmDialog, emptyState, toast, segmented, selectEl, field, textInput, switchEl,
} from './ui.js';
import { navigate } from './router.js';
import {
  state, subscribe, listRecipes, searchText, allTags, saveCategory, deleteCategory, reorderCategories, getSetting, setSetting, catIcon, ORIGINS,
} from './recipes.js';
import { norm, debounce, uid } from './util.js';
import { recipeCard } from './components.js';

const SORTS = [
  ['name', 'Nazwa A–Z'], ['updated', 'Ostatnio zmienione'], ['created', 'Ostatnio dodane'], ['recent', 'Ostatnio otwierane'], ['time', 'Najkrótszy czas'],
];

// Stan widoku zostaje w pamięci, więc po powrocie z receptury lista wygląda tak samo.
const vs = { q: '', chip: 'all', tag: '', origin: '', maxTime: 0, favOnly: false, limit: 30 };

const activeTime = (r) => (r.prepTime || 0) + (r.cookTime || 0);

function sorter(kind) {
  switch (kind) {
    case 'updated': return (a, b) => b.updatedAt - a.updatedAt;
    case 'created': return (a, b) => b.createdAt - a.createdAt;
    case 'recent': return (a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0);
    case 'time': return (a, b) => (activeTime(a) || 1e9) - (activeTime(b) || 1e9);
    default: return (a, b) => a.name.localeCompare(b.name, 'pl');
  }
}

export function recipesView(query) {
  const f = query && query.get && query.get('f');
  if (f === 'fav') { vs.chip = 'fav'; vs.q = ''; }
  else if (f === 'recent') { vs.chip = 'recent'; vs.q = ''; }
  else if (f === 'trad') { vs.chip = 'trad'; vs.q = ''; }

  const search = h('input', { class: 'input search-input', type: 'search', placeholder: 'Szukaj receptury, składnika, tagu…', value: vs.q,
    'aria-label': 'Szukaj', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search' });
  const clear = iconBtn('x', 'Wyczyść wyszukiwanie', () => { search.value = ''; vs.q = ''; search.focus(); paint(); }, 'quiet clear');
  const searchWrap = h('div', { class: 'searchbox' }, icon('search', 20), search, clear);
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtry' });
  const filterBtn = iconBtn('filter', 'Filtry', () => openFilters());
  const sortBtn = iconBtn('sort', 'Sortowanie', () => openSort());
  const bar = h('div', { class: 'searchbar' }, searchWrap, filterBtn, sortBtn);
  const sub = h('div', { class: 'subbar' }, bar, chips);

  const s = screen({
    title: 'Receptury',
    right: h('div', { class: 'row' }, iconBtn('upload', 'Importuj recepturę', () => navigate('/import')), iconBtn('plus', 'Nowa receptura', () => navigate('/new'), 'primary')),
    sub, cls: 'recipes',
  });

  const onSearch = debounce(() => { vs.q = search.value; paint(); }, 100);
  search.addEventListener('input', () => { clear.hidden = !search.value; onSearch(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') search.blur(); });

  function matches() {
    const words = norm(vs.q).split(/\s+/).filter(Boolean);
    let list = listRecipes();
    if (vs.chip === 'fav') list = list.filter((r) => r.favorite);
    else if (vs.chip === 'recent') list = list.filter((r) => r.lastOpenedAt);
    else if (vs.chip === 'trad') list = list.filter((r) => r.traditional);
    else if (vs.chip !== 'all') list = list.filter((r) => r.category === vs.chip);
    if (vs.favOnly) list = list.filter((r) => r.favorite);
    if (vs.tag) list = list.filter((r) => r.tags.includes(vs.tag));
    if (vs.origin) list = list.filter((r) => r.origin === vs.origin);
    if (vs.maxTime) list = list.filter((r) => { const t = activeTime(r); return t > 0 && t <= vs.maxTime; });
    if (words.length) list = list.filter((r) => { const t = searchText(r); return words.every((w) => t.includes(w)); });
    const sortKey = vs.chip === 'recent' ? 'recent' : getSetting('sort') || 'name';
    list.sort(sorter(sortKey));
    if (getSetting('pinTraditional') && vs.chip !== 'recent') {
      const t = list.filter((r) => r.traditional), o = list.filter((r) => !r.traditional);
      return { trad: t, rest: o, total: list.length };
    }
    return { trad: [], rest: list, total: list.length };
  }

  function paintChips() {
    const all = listRecipes();
    const used = new Set(all.map((r) => r.category));
    const mk = (id, label, n, cls = '', active = vs.chip === id) => h('button', { type: 'button', class: 'chip ' + cls + (active ? ' on' : ''), 'aria-pressed': active,
      onClick: () => { vs.chip = id; if (id !== 'all' && ['fav','recent','trad'].includes(id)) vs.origin = ''; vs.limit = 30; paint(); } }, label, n != null ? h('span', { class: 'chip-n' }, String(n)) : null);
    const originBtn = (o) => {
      const n = all.filter((r) => r.origin === o.code).length;
      return h('button', { type: 'button', class: 'chip cuisine-chip' + (vs.origin === o.code ? ' on' : ''), 'aria-pressed': vs.origin === o.code, disabled: n === 0,
        onClick: () => { vs.origin = o.code; vs.chip = 'all'; vs.limit = 30; paint(); } },
        h('span', { class: 'cuisine-flag', 'aria-hidden': 'true' }, o.flag),
        h('span', null, o.name), h('span', { class: 'chip-n' }, String(n)));
    };

    const quick = [
      mk('all', 'Wszystkie', all.length),
      mk('fav', '★ Ulubione', all.filter((r) => r.favorite).length),
      mk('recent', 'Ostatnie', all.filter((r) => r.lastOpenedAt).length),
      mk('trad', 'Tradycyjne', all.filter((r) => r.traditional).length),
    ];
    const cats = state.categories
      .filter((c) => used.has(c.id) || vs.chip === c.id)
      .map((c) => mk(c.id, [c.icon || '', c.name].filter(Boolean).join(' '), all.filter((r) => r.category === c.id).length, 'category-chip'));

    const cuisineCount = ORIGINS.filter((o) => all.some((r) => r.origin === o.code)).length;
    quick.push(h('button', { type: 'button', class: 'chip ghost category-manage', 'aria-label': 'Zarządzaj kategoriami', onClick: () => openCategoryManager() }, icon('sliders', 16), 'Kategorie'));

    chips.replaceChildren(
      h('div', { class: 'catalog-filter-label' }, 'Szybki dostęp'),
      h('div', { class: 'chips-row quick' }, ...quick),
      h('div', { class: 'catalog-filter-label cuisine-label' }, 'Kuchnie świata', h('span', { class: 'catalog-filter-count' }, cuisineCount ? cuisineCount + ' krajów' : '')),
      h('div', { class: 'chips-row cuisines' }, ...ORIGINS.map(originBtn)),
      h('div', { class: 'catalog-filter-label category-label' }, 'Kategorie'),
      h('div', { class: 'chips-row categories' }, ...cats)
    );
  }

  const filterActive = () => !!(vs.tag || vs.origin || vs.maxTime || vs.favOnly);

  function paint() {
    clear.hidden = !search.value;
    filterBtn.classList.toggle('active', filterActive());
    paintChips();
    const { trad, rest, total } = matches();
    const kids = [];

    if (!state.recipes.size) {
      kids.push(emptyState('📒', 'Brak receptur', 'Dodaj swoją pierwszą recepturę albo wklej przepis z internetu.',
        button('Nowa receptura', { kind: 'primary', icon: 'plus', onClick: () => navigate('/new') }),
        button('Importuj', { icon: 'upload', onClick: () => navigate('/import') })));
    } else if (!total) {
      kids.push(emptyState('🔎', 'Nic nie znaleziono', vs.q ? 'Brak wyników dla „' + vs.q + '”.' : 'Zmień filtry lub wyszukiwanie.',
        button('Wyczyść filtry', { onClick: () => { Object.assign(vs, { q: '', chip: 'all', tag: '', origin: '', maxTime: 0, favOnly: false, limit: 30 }); search.value = ''; paint(); } }),
        button('Szukaj w internecie', { icon: 'globe', onClick: () => navigate('/search?q=' + encodeURIComponent(vs.q || '')) })));
    } else {
      const labelMap = new Map(state.categories.map((c) => [c.id, c.name]));
      const activeLabel = vs.chip === 'all' ? 'Wszystkie receptury'
        : vs.chip === 'fav' ? 'Ulubione'
        : vs.chip === 'recent' ? 'Ostatnio otwierane'
        : vs.chip === 'trad' ? 'Tradycyjne'
        : labelMap.get(vs.chip) || 'Receptury';

      kids.push(h('div', { class: 'catalog-heading' },
        h('div', null,
          h('h2', null, activeLabel),
          h('p', { class: 'muted' }, vs.q ? 'Wyniki wyszukiwania dla „' + vs.q + '”' : 'Wybierz kategorię albo kuchnię, żeby szybko zawęzić listę.')),
        h('span', { class: 'catalog-count' }, String(total))));

      const visible = Math.min(vs.limit, total);

      if (trad.length) {
        const shownTrad = trad.slice(0, visible);
        kids.push(h('div', { class: 'catalog-group-title' }, icon('star', 15), 'Tradycyjne', h('span', { class: 'muted' }, trad.length)));
        kids.push(h('div', { class: 'list' }, shownTrad.map((r) => recipeCard(r))));
      }
      if (rest.length) {
        const remainingAfterTrad = Math.max(0, visible - trad.length);
        const shownRest = rest.slice(0, remainingAfterTrad);
        if (trad.length) kids.push(h('div', { class: 'catalog-group-title' }, 'Pozostałe', h('span', { class: 'muted' }, rest.length)));
        if (shownRest.length) kids.push(h('div', { class: 'list' }, shownRest.map((r) => recipeCard(r))));
      }

      if (visible < total) {
        kids.push(h('div', { class: 'catalog-more' },
          h('p', { class: 'muted' }, 'Pokazano ' + visible + ' z ' + total + ' receptur'),
          button('Pokaż kolejne 30', { icon: 'down', block: true, onClick: () => { vs.limit += 30; paint(); requestAnimationFrame(() => s.scroll.scrollBy({ top: 160, behavior: 'smooth' })); } })));
      } else if (total > 30) {
        kids.push(h('p', { class: 'catalog-complete muted' }, 'Wyświetlono wszystkie ' + total + ' receptur'));
      }

      kids.push(h('div', { class: 'import-cta' },
        h('p', { class: 'muted' }, 'Masz przepis z internetu lub ze zdjęcia książki?'),
        h('div', { class: 'row wrap center' },
          button('Importuj recepturę', { icon: 'upload', onClick: () => navigate('/import') }),
          button('Szukaj w sieci', { icon: 'globe', onClick: () => navigate('/search?q=' + encodeURIComponent(vs.q || '')) }))));
    }
    s.content.replaceChildren(...kids);
  }

  function openSort() {
    const sh = openSheet({
      title: 'Sortowanie', variant: 'sheet',
      body: h('div', { class: 'stack' },
        h('div', { class: 'optlist' }, SORTS.map(([v, l]) => h('button', { type: 'button', class: 'opt' + ((getSetting('sort') || 'name') === v ? ' on' : ''),
          onClick: async () => { await setSetting('sort', v); sh.close(); paint(); } }, l, icon('check', 20)))),
        switchEl(!!getSetting('pinTraditional'), async (v) => { await setSetting('pinTraditional', v); paint(); }, 'Tradycyjne zawsze na górze', 'Oznaczone gwiazdką i flagą kraju')),
    });
  }

  function openFilters() {
    let tag = vs.tag, origin = vs.origin, maxTime = vs.maxTime, favOnly = vs.favOnly;
    const tags = allTags();
    openSheet({
      title: 'Filtry', variant: 'sheet',
      body: h('div', { class: 'stack' },
        switchEl(favOnly, (v) => { favOnly = v; }, 'Tylko ulubione'),
        field('Kuchnia / kraj', selectEl([['', 'Wszystkie'], ...ORIGINS.map((o) => [o.code, o.flag + ' ' + o.name])], origin, (v) => { origin = v; })),
        field('Tag', selectEl([['', 'Dowolny'], ...tags.map((t) => [t, t])], tag, (v) => { tag = v; })),
        field('Czas czynny (przygotowanie + gotowanie)', selectEl([[0, 'Dowolny'], [15, 'do 15 min'], [30, 'do 30 min'], [60, 'do 1 h'], [120, 'do 2 h']], maxTime, (v) => { maxTime = +v; }))),
      actions: [
        { label: 'Wyczyść', kind: 'ghost', onClick: () => { Object.assign(vs, { tag: '', origin: '', maxTime: 0, favOnly: false, limit: 30 }); paint(); } },
        { label: 'Zastosuj', kind: 'primary', onClick: () => { Object.assign(vs, { tag, origin, maxTime, favOnly, limit: 30 }); paint(); } },
      ],
    });
  }

  paint();
  const unsub = subscribe((t) => { if (t === 'recipes' || t === 'categories' || t === 'settings') paint(); });
  return { el: s.el, destroy: () => { unsub(); onSearch.cancel(); } };
}

/* ---------- Menedżer kategorii (używany też w Ustawieniach) ---------- */

export function openCategoryManager() {
  const list = h('div', { class: 'catlist' });
  const count = (id) => listRecipes().filter((r) => r.category === id).length;

  function editCat(cat) {
    let name = cat ? cat.name : '', ico = cat ? cat.icon : '🍽️';
    const isNew = !cat;
    openSheet({
      title: isNew ? 'Nowa kategoria' : 'Edytuj kategorię', variant: 'center',
      body: h('div', { class: 'stack' },
        field('Nazwa', textInput({ value: name, label: 'Nazwa kategorii', placeholder: 'np. Śniadania', onInput: (v) => { name = v; } })),
        field('Ikona (emoji)', textInput({ value: ico, label: 'Ikona', onInput: (v) => { ico = v; }, cls: 'emoji-input' }))),
      actions: [
        { label: 'Anuluj', kind: 'ghost' },
        { label: 'Zapisz', kind: 'primary', onClick: async () => {
          const n = name.trim();
          if (!n) { toast('Podaj nazwę kategorii', { type: 'error' }); return false; }
          if (state.categories.some((c) => norm(c.name) === norm(n) && (!cat || c.id !== cat.id))) { toast('Taka kategoria już istnieje', { type: 'error' }); return false; }
          await saveCategory(isNew ? { id: 'cat-' + uid(''), name: n, icon: [...(ico || '🍽️')].slice(0, 2).join('') } : { ...cat, name: n, icon: [...(ico || '🍽️')].slice(0, 2).join('') });
          toast(isNew ? 'Dodano kategorię' : 'Zapisano kategorię'); paint();
        } },
      ],
    });
  }

  async function move(i, dir) {
    const ids = state.categories.map((c) => c.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorderCategories(ids);
    paint();
  }

  async function remove(cat) {
    const n = count(cat.id);
    const ok = await confirmDialog({
      title: `Usunąć „${cat.name}”?`,
      message: n ? `${n} ${n === 1 ? 'receptura zostanie przeniesiona' : 'receptur zostanie przeniesionych'} do kategorii „Inne”.` : 'Kategoria jest pusta.',
      confirmText: 'Usuń', danger: true,
    });
    if (!ok) return;
    await deleteCategory(cat.id);
    toast('Usunięto kategorię');
    paint();
  }

  function paint() {
    list.replaceChildren(...state.categories.map((c, i) => h('div', { class: 'catrow' },
      h('span', { class: 'cat-emoji', 'aria-hidden': 'true' }, catIcon(c.id)),
      h('button', { type: 'button', class: 'cat-name', onClick: () => editCat(c), 'aria-label': `Edytuj kategorię ${c.name}` }, h('span', null, c.name), h('small', { class: 'muted' }, `${count(c.id)} receptur`)),
      iconBtn('up', 'Wyżej', () => move(i, -1), 'quiet'),
      iconBtn('down', 'Niżej', () => move(i, 1), 'quiet'),
      c.id === 'cat-inne' ? h('span', { class: 'iconbtn ghost-space' }) : iconBtn('trash', `Usuń kategorię ${c.name}`, () => remove(c), 'quiet danger'))));
  }
  paint();
  openSheet({
    title: 'Kategorie', variant: 'sheet',
    body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Stuknij nazwę, aby zmienić. Kategoria „Inne” jest stała — trafiają do niej receptury usuniętych kategorii.'), list),
    actions: [{ label: 'Gotowe', kind: 'ghost' }, { label: 'Nowa kategoria', kind: 'primary', icon: 'plus', close: false, onClick: () => { editCat(null); return false; } }],
  });
}
