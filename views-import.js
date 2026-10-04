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
import { qtyParts } from './components.js';
import { fmtMinutes } from './util.js';
import { translateRecipe, detectLang } from './search.js';

export function importView(query) {
  let parsed = null;

  const urlIn = textInput({ value: '', label: 'Adres strony z przepisem', placeholder: 'https://… (opcjonalnie, zapisze się jako źródło)', type: 'url', capitalize: 'none', inputmode: 'url' });
  const textIn = textArea({ value: '', label: 'Wklejony przepis', rows: 8, placeholder: 'Wklej tutaj cały przepis: nazwa, składniki, przygotowanie…\n\nMożesz też wkleić kod HTML strony — rozpoznam dane przepisu.' });
  const preview = h('div', { class: 'stack' });
  const s = screen({ title: 'Importuj recepturę', left: iconBtn('left', 'Wstecz', () => goBack('/recipes')), cls: 'import' });

  async function pasteFromClipboard() {
    try {
      const t = (await navigator.clipboard.readText()) || '';
      if (!t.trim()) { toast('Schowek jest pusty'); return; }
      if (looksLikeUrl(t)) {
        urlIn.value = t.trim();
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

  function recognize() {
    const text = textIn.value;
    if (!text.trim()) { toast('Najpierw wklej przepis', { type: 'error' }); textIn.focus(); return; }
    const url = urlIn.value.trim();
    try { parsed = parseRecipeText(text, { url: /^https?:\/\//i.test(url) ? url : '' }); }
    catch (e) { console.error(e); toast('Nie udało się rozpoznać przepisu', { type: 'error' }); return; }
    paintPreview();
    setTimeout(() => preview.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  async function translateParsed(btn) {
    btn.disabled = true;
    const label = btn.querySelector('span');
    try {
      parsed.recipe = await translateRecipe(parsed.recipe, (d, t) => { label.textContent = `Tłumaczę… ${d}/${t}`; });
      parsed.translated = true;
      toast('Przetłumaczono na polski');
      paintPreview();
    } catch (e) { toast(e.message || 'Nie udało się przetłumaczyć', { type: 'error', ms: 5000 }); btn.disabled = false; label.textContent = 'Przetłumacz na polski'; }
  }

  function paintPreview() {
    if (!parsed) { preview.replaceChildren(); return; }
    const { recipe: r, issues, stats } = parsed;
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
    const foreign = !parsed.translated && detectLang(`${r.name} ${r.steps.map((x) => x.text).join(' ')}`) === 'en';
    if (foreign) kids.push(button('Przetłumacz na polski', { icon: 'globe', block: true, onClick: (e) => translateParsed(e.currentTarget) }));
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
    h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, icon('globe', 20), 'Szukaj w sieci'),
      h('p', { class: 'muted' }, 'Wyszukiwarka działa w aplikacji: znajdź przepis, zobacz podgląd i dodaj go jednym stuknięciem — z tłumaczeniem na polski.'),
      button('Otwórz wyszukiwarkę przepisów', { kind: 'primary', icon: 'search', block: true, onClick: () => navigate('/search') }),
      button('Wklej adres strony', { icon: 'link', block: true, onClick: () => navigate('/search') })),
    h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, icon('upload', 20), 'Wklej przepis'),
      fileIn, textIn,
      field('Adres strony (źródło)', urlIn),
      h('div', { class: 'row wrap gap' },
        button('Wklej ze schowka', { icon: 'copy', onClick: pasteFromClipboard }),
        button('Wczytaj plik', { icon: 'upload', kind: 'ghost', onClick: () => fileIn.click() })),
      button('Rozpoznaj przepis', { kind: 'primary', lg: true, block: true, icon: 'sparkle', onClick: recognize }),
      h('p', { class: 'muted small' }, 'Obce jednostki (cups, oz, lb, °F) i nazwy składników zamieniam na polskie i metryczne. Kroki w obcym języku przetłumaczysz przyciskiem „Przetłumacz na polski” po rozpoznaniu.')),
    preview);
  void emptyState; void hostOf;
  return { el: s.el };
}
