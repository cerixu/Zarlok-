/* ==========================================================================
   views-import.js — „Importuj recepturę” i „Znajdź przepis w internecie”.
   Wszystko lokalnie: wklejasz tekst (lub kod strony), parser rozpoznaje
   nazwę, składniki, ilości, jednostki, sekcje, kroki, czas, temperaturę
   i porcje. Nic nie jest pobierane automatycznie z cudzych stron.
   ========================================================================== */
import { h, icon, screen, button, iconBtn, toast, field, textInput, textArea, emptyState } from './ui.js';
import { navigate, goBack } from './router.js';
import { saveRecipe, kv, catName } from './recipes.js';
import { parseRecipeText, looksLikeUrl, hostOf } from './importer.js';
import { importRecipeFromUrl, hasAIAccess } from './ai.js';
import { normalizeRecipe } from './recipes.js';
import { qtyParts } from './components.js';
import { copyText, fmtMinutes } from './util.js';

const googleUrl = (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q);

function openExternal(url) {
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) location.href = url;   // zablokowane okno — przejdź w tej samej karcie
}

export function importView(query) {
  let parsed = null;
  const qParam = (query && query.get && query.get('q')) || '';

  const searchIn = textInput({ value: qParam, label: 'Czego szukasz', placeholder: 'np. ciasto na pizzę neapolitańską', capitalize: 'none' });
  const urlIn = textInput({ value: '', label: 'Adres strony z przepisem', placeholder: 'https://…', type: 'url', capitalize: 'none', inputmode: 'url' });
  const manualUrlIn = textInput({ value: '', label: 'Adres strony (źródło)', placeholder: 'https://…', type: 'url', capitalize: 'none', inputmode: 'url' });
  const syncSourceUrl = (from, to) => { to.value = from.value; };
  urlIn.addEventListener('input', () => syncSourceUrl(urlIn, manualUrlIn));
  manualUrlIn.addEventListener('input', () => syncSourceUrl(manualUrlIn, urlIn));
  const textIn = textArea({ value: '', label: 'Wklejony przepis', rows: 8, placeholder: 'Wklej tutaj cały przepis: nazwa, składniki, przygotowanie…\n\nMożesz też wkleić kod HTML strony — rozpoznam dane przepisu.' });
  const preview = h('div', { class: 'stack' });
  const aiStatus = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const s = screen({ title: 'Importuj recepturę', left: iconBtn('left', 'Wstecz', () => goBack('/recipes')), cls: 'import' });

  const doSearch = () => {
    const q = searchIn.value.trim();
    if (!q) { searchIn.focus(); return; }
    if (!navigator.onLine) { toast('Jesteś offline — wyszukiwanie wymaga internetu', { type: 'error' }); return; }
    openExternal(googleUrl(/przepis|recipe|receptur/i.test(q) ? q : q + ' przepis'));
  };
  searchIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

  async function pasteFromClipboard() {
    try {
      const t = (await navigator.clipboard.readText()) || '';
      if (!t.trim()) { toast('Schowek jest pusty'); return; }
      if (looksLikeUrl(t)) {
        urlIn.value = t.trim();
        manualUrlIn.value = urlIn.value;
        toast('To adres strony — zapisałem go jako źródło. Skopiuj teraz tekst przepisu ze strony i wklej tutaj.', { ms: 5000 });
        return;
      }
      textIn.value = t; textIn._fit && textIn._fit();
      recognize();
    } catch (_) {
      toast('Safari nie pozwoliło odczytać schowka — przytrzymaj pole tekstowe i wybierz „Wklej”.', { type: 'error', ms: 5000 });
      textIn.focus();
    }
  }

  async function loadFile(file) {
    if (!file) return;
    try {
      const txt = await file.text();
      textIn.value = txt; textIn._fit && textIn._fit();
      recognize();
    } catch (_) { toast('Nie udało się odczytać pliku', { type: 'error' }); }
  }
  const fileIn = h('input', { type: 'file', accept: '.txt,.html,.htm,.md,.json,text/*', class: 'sr-file', 'aria-label': 'Wczytaj plik z przepisem' });
  fileIn.addEventListener('change', () => { loadFile(fileIn.files && fileIn.files[0]); fileIn.value = ''; });

  async function importUrlWithAI() {
    const url = urlIn.value.trim();
    if (!url) { urlIn.focus(); toast('Wklej adres strony z przepisem', { type: 'error' }); return; }
    if (!/^https:\/\//i.test(url)) { toast('Importer AI przyjmuje adres HTTPS', { type: 'error' }); return; }
    if (!navigator.onLine) { toast('Import z URL wymaga internetu', { type: 'error' }); return; }
    if (!hasAIAccess()) { toast('Najpierw skonfiguruj Kucharek AI w Ustawieniach', { type: 'error', ms: 5000 }); return; }
    const btn = c?.querySelector?.('[data-ai-import]') || null;
    if (btn) btn.disabled = true;
    aiStatus.textContent = 'AI pobiera stronę i układa recepturę…';
    try {
      const recipe = normalizeRecipe(await importRecipeFromUrl(url));
      parsed = {
        recipe,
        issues: [
          ...(!recipe.name ? ['Brak nazwy receptury — sprawdź w formularzu.'] : []),
          ...(!recipe.sections.some((sec) => sec.ingredients.length) ? ['Nie znaleziono składników — sprawdź stronę.'] : []),
          ...(!recipe.steps.length ? ['Nie znaleziono kroków przygotowania — sprawdź stronę.'] : [])
        ],
        stats: {
          ingredients: recipe.sections.reduce((n, sec) => n + sec.ingredients.length, 0),
          steps: recipe.steps.length
        }
      };
      aiStatus.textContent = 'Gotowe. Sprawdź podgląd przed zapisaniem.';
      paintPreview();
      setTimeout(() => preview.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) {
      aiStatus.textContent = '';
      toast(e?.message || 'Nie udało się zaimportować strony', { type: 'error', ms: 5000 });
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function recognize() {
    const text = textIn.value;
    if (!text.trim()) { toast('Najpierw wklej przepis', { type: 'error' }); textIn.focus(); return; }
    const url = (manualUrlIn.value.trim() || urlIn.value.trim());
    try { parsed = parseRecipeText(text, { url: /^https?:\/\//i.test(url) ? url : '' }); }
    catch (e) { console.error(e); toast('Nie udało się rozpoznać przepisu', { type: 'error' }); return; }
    paintPreview();
    setTimeout(() => preview.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  async function translate() {
    const text = textIn.value.trim();
    if (!text) { toast('Najpierw wklej przepis do przetłumaczenia', { type: 'error' }); return; }
    if (!navigator.onLine) { toast('Tłumaczenie wymaga internetu', { type: 'error' }); return; }
    await copyText(text);
    const short = text.length <= 1500;
    openExternal('https://translate.google.com/' + (short ? '?sl=auto&tl=pl&op=translate&text=' + encodeURIComponent(text) : '?sl=auto&tl=pl&op=translate'));
    toast(short ? 'Otwieram Google Tłumacz. Skopiuj wynik i wklej tutaj.' : 'Tekst skopiowany — wklej go w Google Tłumaczu, a wynik tutaj.', { ms: 5000 });
  }

  function paintPreview() {
    if (!parsed) { preview.replaceChildren(); return; }
    const { recipe: r, issues = [], stats = { ingredients: 0, steps: 0 } } = parsed;
    const kids = [
      h('section', { class: 'card stack' },
        h('h2', { class: 'card-title' }, icon('sparkle', 20), 'Rozpoznano'),
        h('div', { class: 'import-name' }, r.name || h('span', { class: 'muted' }, '(brak nazwy)')),
        h('div', { class: 'facts' },
          h('span', { class: 'fact' }, icon('list', 18), `${stats.ingredients} składników`),
          h('span', { class: 'fact' }, icon('book', 18), `${stats.steps} kroków`),
          h('span', { class: 'fact' }, icon('users', 18), `${r.servings} porcji`),
          r.prepTime || r.cookTime ? h('span', { class: 'fact' }, icon('clock', 18), fmtMinutes((r.prepTime || 0) + (r.cookTime || 0))) : null,
          r.temperature ? h('span', { class: 'fact' }, icon('thermo', 18), r.temperature) : null,
          h('span', { class: 'fact' }, icon('tag', 18), catName(r.category))),
        r.sections.map((sec) => h('div', { class: 'ing-section' }, sec.name ? h('div', { class: 'tape' }, sec.name) : null,
          h('ul', { class: 'ing-list' }, sec.ingredients.map((i) => { const q = qtyParts(i); return h('li', { class: 'ing' + (i.amount == null ? ' warn' : '') }, h('span', { class: 'ing-name' }, i.name), h('span', { class: 'ing-qty' }, h('span', { class: 'amt num' }, q.num), h('span', { class: 'unit' }, q.unit))); })))),
        r.steps.length ? h('ol', { class: 'steps compact' }, r.steps.slice(0, 4).map((st) => h('li', null, h('span', { class: 'step-text' }, st.text.length > 140 ? st.text.slice(0, 140) + '…' : st.text)))) : null,
        r.steps.length > 4 ? h('p', { class: 'muted small' }, `…i ${r.steps.length - 4} kolejnych kroków`) : null),
    ];
    if (issues.length) kids.push(h('div', { class: 'banner warn' }, h('div', { class: 'banner-text' }, h('strong', null, 'Do sprawdzenia'), h('ul', { class: 'plain small' }, issues.map((i) => h('li', null, i))))));
    kids.push(h('div', { class: 'actions-primary stack' },
      button('Popraw w formularzu', { kind: 'primary', lg: true, block: true, icon: 'edit', onClick: toForm }),
      button('Zapisz od razu', { block: true, icon: 'check', onClick: saveNow })));
    preview.replaceChildren(...kids);
  }

  async function toForm() {
    await kv.set('draft:new-import', { recipe: parsed.recipe, issues: parsed.issues });
    navigate('/new?import=1');
  }

  async function saveNow() {
    const r = parsed.recipe;
    if (!r.name) { toast('Brak nazwy — popraw w formularzu', { type: 'error' }); return toForm(); }
    try {
      const saved = await saveRecipe(r);
      toast('Zapisano recepturę');
      navigate('/recipe/' + saved.id, { replace: true });
    } catch (e) { toast('Nie udało się zapisać: ' + (e && e.message), { type: 'error' }); }
  }

  const c = s.content;
  c.append(
    h('section', { class: 'card stack import-search-card' },
      h('h2', { class: 'card-title' }, icon('globe', 20), 'Znajdź przepis'),
      h('p', { class: 'muted' }, 'Znajdź przepis, skopiuj URL albo tekst i wróć tutaj.'),
      h('div', { class: 'row gap' }, h('div', { class: 'grow' }, searchIn), button('Szukaj', { icon: 'search', kind: 'primary', onClick: doSearch })),
      h('p', { class: 'muted small' }, 'Wyszukiwanie otwiera Google i wymaga internetu.')
    ),
    h('section', { class: 'card stack import-workflow-card' },
      h('div', { class: 'import-flow-title' },
        icon('sparkle', 20),
        h('div', null,
          h('h2', { class: 'card-title' }, 'Import receptury'),
          h('p', { class: 'muted small' }, 'Jedna ścieżka: URL lub tekst, potem od razu rozpoznanie i podgląd.')
        )
      ),
      h('div', { class: 'import-flow-steps' },
        h('div', null, h('b', null, '1'), h('span', null, 'Skopiuj URL lub tekst')),
        h('div', null, h('b', null, '2'), h('span', null, 'Wklej tutaj')),
        h('div', null, h('b', null, '3'), h('span', null, 'Rozpoznaj i zapisz'))
      ),
      h('div', { class: 'import-url-block' },
        field('URL strony (opcjonalnie)', urlIn),
        button('Importuj URL przez AI', { kind: 'primary', lg: true, block: true, icon: 'sparkle', onClick: importUrlWithAI, aria: 'Importuj adres strony z AI' }),
        aiStatus
      ),
      h('div', { class: 'import-divider' }, h('span', null, 'albo wklej tekst przepisu')),
      fileIn,
      textIn,
      field('Adres źródła (opcjonalnie)', manualUrlIn),
      h('div', { class: 'row wrap gap import-actions' },
        button('Wklej ze schowka', { icon: 'copy', onClick: pasteFromClipboard }),
        button('Wczytaj plik', { icon: 'upload', kind: 'ghost', onClick: () => fileIn.click() }),
        button('Przetłumacz', { icon: 'globe', kind: 'ghost', onClick: translate })
      ),
      button('Rozpoznaj przepis', { kind: 'primary', lg: true, block: true, icon: 'sparkle', onClick: recognize }),
      h('p', { class: 'muted small' }, 'Podgląd, poprawki i zapis są pod tym panelem, bez szukania pola na dole ekranu.')
    ),
    preview
  );
  void emptyState; void hostOf;
  return { el: s.el };
}
