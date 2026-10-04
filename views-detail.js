/* ==========================================================================
   views-detail.js — podgląd receptury: GOTUJĘ, PRZELICZ, procenty piekarskie,
   food cost, historia zmian, własne uwagi (autozapis).
   ========================================================================== */
import {
  h, icon, screen, button, iconBtn, toast, openSheet, confirmDialog, field, numInput, selectEl, segmented, textArea, emptyState,
} from './ui.js';
import { navigate, goBack } from './router.js';
import {
  subscribe, getRecipe, markOpened, patchRecipe, saveRecipe, deleteRecipe, duplicateRecipe, getHistory, restoreVersion,
  cloneRecipe, allIngredients, getSetting, catName,
} from './recipes.js';
import {
  scaleRecipe, factorFromServings, factorFromYield, factorFromIngredient, effectiveYield, bakersTable, bakersRecalc, recipeCost,
  priceForFoodCost,
} from './calculator.js';
import { fmtAmount, fmtNum, fmtPct, fmtMoney, fmtMinutes, fmtDateTime, fmtDate, copyText, debounce, uid } from './util.js';
import { heartBtn, tradMark, qtyParts, recipeToText, originOf } from './components.js';
import { openAddToShopping } from './shopping.js';
import { hostOf } from './importer.js';
import { recipeArtUrl } from './art.js';

const KIND_LABEL = { flour: 'mąka', water: 'woda', salt: 'sól', yeast: 'drożdże', fat: 'tłuszcz', other: '' };

export function detailView({ id }) {
  const base0 = getRecipe(id);
  if (!base0) {
    const s = screen({ title: 'Receptura', left: iconBtn('left', 'Wstecz', () => goBack('/recipes')) },
      emptyState('🤷', 'Nie ma takiej receptury', 'Mogła zostać usunięta.', button('Wszystkie receptury', { kind: 'primary', onClick: () => navigate('/recipes', { replace: true }) })));
    return { el: s.el };
  }
  markOpened(id);

  let scaled = null;          // przeliczona kopia (niezapisana) albo null
  let scaleLabel = '';
  let skipPaint = false;
  const amateur = () => getSetting('mode') === 'amateur';
  const base = () => getRecipe(id);
  const cur = () => scaled || base();

  const heartSlot = h('span', { class: 'heart-slot' });
  const s = screen({
    title: base0.name || 'Receptura', left: iconBtn('left', 'Wstecz', () => goBack('/recipes')),
    right: h('div', { class: 'row' }, heartSlot, iconBtn('more', 'Więcej', () => openMore())), cls: 'detail',
  });

  /* ----- Przeliczanie ----- */

  function applyScaled(r, label) {
    const b = base();
    const same = JSON.stringify(allIngredients(r).map((i) => i.amount)) === JSON.stringify(allIngredients(b).map((i) => i.amount)) && r.servings === b.servings;
    if (same) { scaled = null; scaleLabel = ''; } else { scaled = r; scaleLabel = label; }
    paint();
    if (scaled) s.scroll.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function applyFactor(k, label) {
    if (!(k > 0) || !Number.isFinite(k)) { toast('Podaj poprawną wartość', { type: 'error' }); return false; }
    const r = scaleRecipe(base(), k);
    applyScaled(r, label || `×${fmtNum(k, 3)}`);
  }

  function openScale() {
    const r = base();
    let mode = 'servings';
    const y = effectiveYield(r);
    let servings = cur().servings || r.servings, yAmt = y ? y.amount * (cur().servings && r.servings ? cur().servings / r.servings : 1) : null, yUnit = (y && y.unit) || 'g';
    const ings = allIngredients(r).filter((i) => i.name && i.amount > 0 && i.unit !== '%');
    let ingId = ings[0] ? ings[0].id : '', ingAmt = null, ingUnit = ings[0] ? ings[0].unit : 'g';
    const out = h('div', { class: 'preview-line' });
    const holder = h('div', { class: 'stack' });

    const factor = () => {
      if (mode === 'servings') return factorFromServings(r, servings);
      if (mode === 'yield') return factorFromYield(r, yAmt, yUnit);
      const ing = ings.find((i) => i.id === ingId);
      return ing ? factorFromIngredient(ing, ingAmt, ingUnit) : null;
    };
    const showOut = () => {
      const k = factor();
      out.replaceChildren(k ? h('span', null, 'Współczynnik ', h('strong', { class: 'num' }, '×' + fmtNum(k, 3)),
        r.servings ? ` · ${fmtNum(r.servings * k, 1)} porcji` : '') : h('span', { class: 'muted' }, 'Wpisz wartość docelową'));
    };
    const build = () => {
      const showPct = !!(table && table.ok && r.bakers && !amateur());
    const pct = new Map(table && table.ok ? table.rows.map((x) => [x.id, x]) : []);
    const rCost = !amateur() ? recipeCost(r, 1) : null;
    const previewIngredients = allIngredients(r).filter((i) => i.name).slice(0, 6);
    const ingredientOrb = (ing) => {
      const name = String(ing.name || '').trim();
      const letters = name.replace(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '').slice(0, 2).toUpperCase() || '•';
      return h('div', { class: 'ingredient-orb', title: name, 'aria-label': name },
        h('span', { class: 'ingredient-orb-mark' }, letters));
    };
    const stat = (ico, value, label) => h('div', { class: 'detail-stat' },
      icon(ico, 18), h('div', { class: 'detail-stat-copy' }, h('strong', null, value), h('span', null, label)));

    const kids = [];
    kids.push(h('section', { class: 'recipe-hero' },
      h('div', { class: 'recipe-hero-photo' },
        h('img', {
          src: base().photo || base().thumb || recipeArtUrl(base()),
          alt: base().photo ? `Zdjęcie: ${r.name}` : '',
          decoding: 'async',
        }),
        h('div', { class: 'recipe-hero-shine', 'aria-hidden': 'true' })),
      h('div', { class: 'recipe-hero-glass' },
        h('div', { class: 'recipe-hero-kicker' },
          tradMark(base()) ? h('span', { class: 'hero-trad' }, tradMark(base()), originOf(base().origin) ? originOf(base().origin).name : 'Tradycyjna') : null,
          h('span', { class: 'hero-category' }, catName(r.category))),
        h('h2', { class: 'recipe-hero-title' }, r.name || 'Bez nazwy'),
        r.description ? h('p', { class: 'recipe-hero-desc' }, r.description) : null,
        h('div', { class: 'recipe-hero-meta' },
          base().rating ? h('span', { class: 'hero-rating' }, icon('star', 16), fmtNum(base().rating, 1), base().openCount ? `(${base().openCount})` : '') : null,
          r.servings ? h('span', null, icon('users', 16), `${fmtNum(r.servings, 1)} porcji`) : null,
          (r.prepTime || r.cookTime) ? h('span', null, icon('clock', 16), fmtMinutes((r.prepTime || 0) + (r.cookTime || 0))) : null,
          r.temperature ? h('span', null, icon('thermo', 16), r.temperature) : null),
        r.tags && r.tags.length ? h('div', { class: 'recipe-hero-tags' }, r.tags.slice(0, 4).map((t) => h('span', null, '#' + t))) : null),
      h('div', { class: 'recipe-hero-edge', 'aria-hidden': 'true' })));

    kids.push(h('section', { class: 'recipe-command' },
      h('div', { class: 'recipe-stat-grid' },
        r.servings ? stat('users', fmtNum(r.servings, 1), 'porcje') : null,
        (r.prepTime || r.cookTime) ? stat('clock', fmtMinutes((r.prepTime || 0) + (r.cookTime || 0)), 'czas') : null,
        rCost && rCost.perPortion != null ? stat('coins', fmtMoney(rCost.perPortion, getSetting('currency') || 'zł'), 'koszt / porcję') : null,
        r.fermentTime ? stat('timer', fmtMinutes(r.fermentTime), 'fermentacja') : null),
      h('div', { class: 'recipe-actions-glass' },
        button('Rozpocznij gotowanie', { kind: 'primary', lg: true, block: true, icon: 'chef', onClick: () => navigate('/guide/' + id) }),
        h('div', { class: 'actions-row compact-actions' },
          button('Przelicz', { icon: 'swap', onClick: openScale }),
          button('Do zakupów', { icon: 'cart', onClick: () => openAddToShopping(r, 1) }),
          button('Edytuj', { icon: 'edit', onClick: () => navigate('/edit/' + id) }))));

    if (scaled) {
      kids.push(h('div', { class: 'banner scale-banner', role: 'status' },
        h('div', { class: 'banner-text' }, h('strong', null, 'Przeliczone: ' + scaleLabel), h('span', { class: 'muted' }, 'Podgląd — nic jeszcze nie zapisano.')),
        h('div', { class: 'row wrap gap' },
          button('Zapisz jako nową', { sm: true, onClick: saveScaledNew }),
          button('Zapisz w tej', { sm: true, onClick: saveScaledHere }),
          button('Reset', { sm: true, kind: 'ghost', onClick: () => { scaled = null; scaleLabel = ''; paint(); } }))));    
    }

    kids.push(h('section', { class: 'card recipe-ingredients-glass ingredients' },
      h('div', { class: 'recipe-section-head' },
        h('div', null, h('span', { class: 'section-eyebrow' }, 'Do przygotowania'), h('h2', null, 'Składniki')),
        h('span', { class: 'section-count' }, String(previewIngredients.length))),
      previewIngredients.length ? h('div', { class: 'ingredient-orbs' },
        previewIngredients.map((ing) => h('div', { class: 'ingredient-token' }, ingredientOrb(ing), h('span', null, ing.name)))) :
        h('p', { class: 'muted' }, 'Brak składników.'),
      r.sections.length > 1 ? h('div', { class: 'recipe-full-list' }, r.sections.map((sec) => h('div', { class: 'ing-section' },
        sec.name ? h('div', { class: 'tape' }, sec.name) : null,
        h('ul', { class: 'ing-list' }, sec.ingredients.map((i) => {
          const q = qtyParts(i);
          const p = pct.get(i.id);
          return h('li', { class: 'ing' },
            h('span', { class: 'ing-name' }, i.name || '—', showPct && p && KIND_LABEL[p.kind] ? h('span', { class: 'kind' }, KIND_LABEL[p.kind]) : null),
            showPct && p && p.pct != null ? h('span', { class: 'ing-pct num' }, fmtPct(p.pct)) : null,
            h('span', { class: 'ing-qty' }, h('span', { class: 'amt num' }, q.num), h('span', { class: 'unit' }, q.unit)));
        }))))) : null,
      h('button', { type: 'button', class: 'recipe-more-link', onClick: () => navigate('/cook/' + id) }, 'Zobacz pełną listę składników', icon('right', 16))));

    kids.push(bakersCard(r, table));

    kids.push(h('section', { class: 'card recipe-steps-glass' },
      h('div', { class: 'recipe-section-head' },
        h('div', null, h('span', { class: 'section-eyebrow' }, 'Instrukcja'), h('h2', null, 'Przygotowanie')),
        r.steps.length ? h('span', { class: 'section-count' }, String(r.steps.length)) : null),
      r.steps.length ? h('ol', { class: 'steps' }, r.steps.map((st) => h('li', null, h('span', { class: 'step-text' }, st.text)))) :
        h('p', { class: 'muted' }, 'Brak kroków. Dodaj je w edytorze.'),
      button('Gotuj krok po kroku', { icon: 'chef', kind: 'primary', block: true, onClick: () => navigate('/guide/' + id) })));

    if (!amateur()) kids.push(costCard());

    const startNotes = notesDirty && notesEl ? notesEl.value : base().notes || '';
    notesEl = textArea({ value: startNotes, label: 'Własne uwagi', placeholder: 'Np. ciasto wyszło za twarde — następnym razem +10 g wody…', rows: 3, onInput: (v) => { notesDirty = true; savedHint.textContent = '…'; notesSave(v); } });
    kids.push(h('section', { class: 'card recipe-notes-glass' },
      h('div', { class: 'recipe-section-head' }, h('div', null, h('span', { class: 'section-eyebrow' }, 'Notatnik'), h('h2', null, 'Własne uwagi')), savedHint),
      notesEl));

    const src = [];
    if (base().source) src.push(h('div', null, 'Źródło: ', base().source));
    if (base().sourceUrl) src.push(h('div', null, h('a', { class: 'ext', href: base().sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('link', 16), hostOf(base().sourceUrl) || base().sourceUrl)));
    src.push(h('div', null, `Dodano ${fmtDate(base().createdAt, true)} · zmieniono ${fmtDateTime(base().updatedAt)}`));
    kids.push(h('div', { class: 'meta-foot muted small' }, src));
    if (!amateur()) kids.push(h('div', { class: 'row center' }, button('Historia zmian', { icon: 'history', kind: 'ghost', onClick: openHistory })));

    s.content.replaceChildren(...kids.filter(Boolean));
  }

  paint();
  const unsub = subscribe((t) => {
    if (skipPaint) return;
    if (t === 'recipes' || t === 'settings' || t === 'categories') {
      if (!getRecipe(id)) { navigate('/recipes', { replace: true }); return; }
      paint();
    }
  });
  return { el: s.el, destroy: () => { unsub(); if (notesDirty && notesEl) notesSave.flush(notesEl.value); } };
}
