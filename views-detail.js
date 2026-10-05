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
import { recipeArtUrl, ingredientArtUrl } from './art.js';
import { openRecipeAiSheet } from './views-ai.js';

const KIND_LABEL = { flour: 'mąka', water: 'woda', salt: 'sól', yeast: 'drożdże', fat: 'tłuszcz', other: '' };

export function detailView({ id }, query) {
  const expanded = !!(query && query.get('details') === '1');
  const base0 = getRecipe(id);
  if (!base0) {
    const s = screen({ title: 'Receptura', left: iconBtn('left', 'Wstecz', () => goBack('/recipes')) },
      emptyState('🤷', 'Nie ma takiej receptury', 'Mogła zostać usunięta.', button('Wszystkie receptury', { kind: 'primary', onClick: () => navigate('/recipes', { replace: true }) })));
    return { el: s.el };
  }
  markOpened(id);
  if (expanded) document.body.classList.add('no-tabs');

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
      const kids = [];
      if (mode === 'servings') {
        kids.push(field('Liczba porcji', numInput({ value: servings, label: 'Liczba porcji', onInput: (v) => { servings = v; showOut(); } }), `Receptura jest na ${r.servings || '?'} porcji`));
      } else if (mode === 'yield') {
        kids.push(h('div', { class: 'row gap' },
          h('div', { class: 'grow' }, field('Wydajność', numInput({ value: yAmt, label: 'Wydajność', onInput: (v) => { yAmt = v; showOut(); } }))),
          h('div', { class: 'grow' }, field('Jednostka', selectEl(['g', 'kg', 'ml', 'l', 'szt.', 'porcja'], yUnit, (v) => { yUnit = v; showOut(); })))));
        kids.push(h('p', { class: 'muted small' }, y ? `Obecnie: ${fmtAmount(y.amount)} ${y.unit}${y.computed ? ' (suma składników)' : ''}` : 'Receptura nie ma wydajności ani ilości w g/ml.'));
      } else {
        if (!ings.length) kids.push(h('p', { class: 'muted' }, 'Brak składników z ilością.'));
        else {
          kids.push(field('Składnik', selectEl(ings.map((i) => [i.id, `${i.name} (${fmtAmount(i.amount)} ${i.unit})`]), ingId, (v) => { ingId = v; const i = ings.find((x) => x.id === v); ingUnit = i.unit; build(); })));
          kids.push(h('div', { class: 'row gap' },
            h('div', { class: 'grow' }, field('Mam / chcę użyć', numInput({ value: ingAmt, label: 'Docelowa ilość', onInput: (v) => { ingAmt = v; showOut(); } }))),
            h('div', { class: 'grow' }, field('Jednostka', selectEl(['g', 'kg', 'ml', 'l', 'szt.', 'łyżka', 'łyżeczka'], ingUnit, (v) => { ingUnit = v; showOut(); })))));
        }
      }
      holder.replaceChildren(...kids);
      showOut();
    };
    const chips = h('div', { class: 'chips wrap' }, [0.5, 2, 3, 5, 10].map((k) => h('button', { type: 'button', class: 'chip', onClick: () => { sh.close(); applyFactor(k, `×${k}`); } }, '×' + String(k).replace('.', ','))));
    const modes = [['servings', 'Porcje'], ['yield', 'Wydajność'], ['ingredient', 'Składnik']];
    const sh = openSheet({
      title: 'Przelicz', variant: 'sheet',
      body: h('div', { class: 'stack' },
        h('div', null, h('div', { class: 'field-label' }, 'Szybko'), chips),
        segmented(modes, mode, (v) => { mode = v; build(); }, { label: 'Przelicz według' }),
        holder, out),
      actions: [
        { label: 'Anuluj', kind: 'ghost' },
        { label: 'Przelicz', kind: 'primary', icon: 'swap', onClick: () => {
          const k = factor();
          if (!k) { toast('Uzupełnij wartość docelową', { type: 'error' }); return false; }
          const lbl = mode === 'servings' ? `${fmtNum(servings, 1)} porcji` : mode === 'yield' ? `${fmtAmount(yAmt)} ${yUnit}` : `×${fmtNum(k, 3)}`;
          applyFactor(k, lbl);
        } },
      ],
    });
    build();
  }

  function openBakers() {
    const r = base();
    const t = bakersTable(r);
    if (!t.ok) return;
    let total = t.totalG, hyd = t.hydration, salt = t.salt, yeast = t.yeast, fat = t.fat;
    let balls = r.servings || 1, bw = total / (r.servings || 1);
    const prev = h('div', { class: 'bk-preview' });
    const hasFat = t.rows.some((x) => x.kind === 'fat');
    const show = () => {
      const res = bakersRecalc(r, { total, hydration: hyd, salt, yeast, fat: hasFat ? fat : undefined });
      const tt = bakersTable(res);
      prev.replaceChildren(h('div', { class: 'kv' }, tt.rows.map((x) =>
        h('div', { class: 'kv-row' }, h('span', null, x.name), h('span', { class: 'num' }, `${fmtAmount(x.grams)} g · ${fmtPct(x.pct)}`)))),
        h('div', { class: 'kv-total' }, 'Masa ciasta ', h('strong', { class: 'num' }, fmtAmount(tt.totalG) + ' g'), ' · mąka ', h('strong', { class: 'num' }, fmtAmount(tt.flourG) + ' g')));
      prev._res = res;
    };
    const totalIn = numInput({ value: total, label: 'Masa ciasta w gramach', dec: 1, onInput: (v) => { if (v > 0) { total = v; bw = total / balls; bwIn.value = fmtNum(bw, 1); } show(); } });
    const ballsIn = numInput({ value: balls, label: 'Liczba kulek', dec: 0, onInput: (v) => { if (v > 0) { balls = v; total = balls * bw; totalIn.value = fmtNum(total, 1); } show(); } });
    const bwIn = numInput({ value: bw, label: 'Waga kulki w gramach', dec: 1, onInput: (v) => { if (v > 0) { bw = v; total = balls * bw; totalIn.value = fmtNum(total, 1); } show(); } });
    const sh = openSheet({
      title: 'Procenty piekarskie', variant: 'sheet',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, 'Mąka = 100%. Zmień masę ciasta lub proporcje — pozostałe składniki przeliczą się same.'),
        field('Masa całego ciasta (g)', totalIn),
        h('div', { class: 'row gap' }, h('div', { class: 'grow' }, field('Liczba kulek', ballsIn)), h('div', { class: 'grow' }, field('Waga kulki (g)', bwIn))),
        h('div', { class: 'row gap' },
          h('div', { class: 'grow' }, field('Hydracja %', numInput({ value: hyd, label: 'Hydracja', dec: 1, onInput: (v) => { if (v >= 0) hyd = v; show(); } }))),
          h('div', { class: 'grow' }, field('Sól %', numInput({ value: salt, label: 'Sól', dec: 2, onInput: (v) => { if (v >= 0) salt = v; show(); } })))),
        h('div', { class: 'row gap' },
          h('div', { class: 'grow' }, field('Drożdże %', numInput({ value: yeast, label: 'Drożdże', dec: 2, onInput: (v) => { if (v >= 0) yeast = v; show(); } }))),
          hasFat ? h('div', { class: 'grow' }, field('Tłuszcz %', numInput({ value: fat, label: 'Tłuszcz', dec: 2, onInput: (v) => { if (v >= 0) fat = v; show(); } }))) : h('div', { class: 'grow' })),
        prev),
      actions: [
        { label: 'Anuluj', kind: 'ghost' },
        { label: 'Zastosuj', kind: 'primary', icon: 'check', onClick: () => applyScaled(prev._res, `ciasto ${fmtAmount(total)} g`) },
      ],
    });
    show();
  }

  /* ----- Zapis przeliczonej ----- */

  async function saveScaledHere() {
    const ok = await confirmDialog({ title: 'Zapisać w tej recepturze?', message: 'Ilości zostaną nadpisane. Poprzednią wersję znajdziesz w historii zmian.', confirmText: 'Zapisz' });
    if (!ok) return;
    const next = { ...scaled, id };
    await saveRecipe(next, { note: `Przeliczono (${scaleLabel})` });
    scaled = null; scaleLabel = '';
    toast('Zapisano przeliczoną recepturę');
    paint();
  }
  async function saveScaledNew() {
    const c = cloneRecipe(scaled);
    const now = Date.now();
    Object.assign(c, { id: uid('rcp_'), name: `${base().name} (${scaleLabel})`, favorite: false, favoritedAt: 0, createdAt: now, updatedAt: now, lastOpenedAt: 0, openCount: 0, photo: base().photo, thumb: base().thumb });
    c.sections.forEach((sec) => { sec.id = uid('sec_'); sec.ingredients.forEach((i) => { i.id = uid('ing_'); }); });
    c.steps.forEach((st) => { st.id = uid('stp_'); });
    const saved = await saveRecipe(c);
    toast('Zapisano jako nową recepturę', { action: { label: 'Otwórz', fn: () => navigate('/recipe/' + saved.id) } });
  }

  /* ----- Food cost ----- */

  function openPrices() {
    const r = cloneRecipe(base());
    const ings = allIngredients(r).filter((i) => i.name);
    const cur$ = getSetting('currency') || 'zł';
    const total = h('div', { class: 'preview-line' });
    const upd = () => {
      const c = recipeCost(r, 1);
      total.replaceChildren(h('span', null, 'Koszt razem ', h('strong', { class: 'num' }, fmtMoney(c.total, cur$)), c.perPortion != null ? ` · porcja ${fmtMoney(c.perPortion, cur$)}` : '', c.foodCostPct != null ? ` · food cost ${fmtNum(c.foodCostPct, 1)}%` : ''),
        c.missing ? h('div', { class: 'muted small' }, `Brak ceny lub zgodnej jednostki: ${c.missing}`) : null);
    };
    const rows = ings.map((i) => {
      const pkg = h('div', { class: 'row gap pkg' });
      const buildPkg = () => {
        pkg.replaceChildren();
        pkg.hidden = i.priceUnit !== 'opak.';
        if (i.priceUnit === 'opak.') {
          pkg.append(h('div', { class: 'grow' }, field('Waga / ilość w opakowaniu', numInput({ value: i.packageWeight, label: 'Waga opakowania', onInput: (v) => { i.packageWeight = v; upd(); } }))),
            h('div', { class: 'grow' }, field('Jednostka', selectEl(['g', 'ml', 'szt.'], i.packageUnit || 'g', (v) => { i.packageUnit = v; upd(); }))));
        }
      };
      buildPkg();
      return h('div', { class: 'price-row' },
        h('div', { class: 'price-name' }, i.name, h('small', { class: 'muted num' }, i.amount != null ? ` ${fmtAmount(i.amount)} ${i.unit}` : '')),
        h('div', { class: 'row gap' },
          h('div', { class: 'grow' }, numInput({ value: i.price, label: `Cena: ${i.name}`, placeholder: 'cena', dec: 2, onInput: (v) => { i.price = v; upd(); } })),
          h('div', { class: 'grow' }, selectEl([['kg', `${cur$}/kg`], ['l', `${cur$}/l`], ['g', `${cur$}/g`], ['ml', `${cur$}/ml`], ['szt.', `${cur$}/szt.`], ['opak.', `${cur$}/opak.`]], i.priceUnit || 'kg', (v) => { i.priceUnit = v; buildPkg(); upd(); }, { label: 'Jednostka ceny' }))),
        pkg);
    });
    const sale = numInput({ value: r.salePrice, label: 'Cena sprzedaży porcji', dec: 2, placeholder: 'np. 32', onInput: (v) => { r.salePrice = v; upd(); } });
    openSheet({
      title: 'Ceny składników', variant: 'sheet',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, 'Ceny zapisują się w recepturze i w katalogu składników (podpowiadają się w innych recepturach). Cena 0 jest dozwolona (np. woda).'),
        field(`Cena sprzedaży porcji (${cur$})`, sale), total, h('div', { class: 'stack' }, rows)),
      actions: [
        { label: 'Anuluj', kind: 'ghost' },
        { label: 'Zapisz ceny', kind: 'primary', onClick: async () => {
          await saveRecipe({ ...base(), sections: r.sections, salePrice: r.salePrice }, { note: 'Zaktualizowano ceny' });
          if (scaled) { scaled = null; scaleLabel = ''; }
          toast('Zapisano ceny'); paint();
        } },
      ],
    });
    upd();
  }

  function costCard() {
    const r = cur();
    const cur$ = getSetting('currency') || 'zł';
    const c = recipeCost(r, 1);
    const any = c.lines.some((l) => l.cost != null);
    const kv = (k, v, cls = '') => h('div', { class: 'stat ' + cls }, h('span', { class: 'stat-k' }, k), h('span', { class: 'stat-v num' }, v));
    const body = [];
    if (any) {
      body.push(h('div', { class: 'stats' },
        kv('Koszt receptury', fmtMoney(c.total, cur$)),
        kv('Koszt porcji', fmtMoney(c.perPortion, cur$)),
        kv('Cena sprzedaży', r.salePrice > 0 ? fmtMoney(r.salePrice, cur$) : '—'),
        kv('Food cost', c.foodCostPct != null ? fmtNum(c.foodCostPct, 1) + '%' : '—', c.foodCostPct > 35 ? 'warn' : '')));
      if (c.perPortion > 0) body.push(h('p', { class: 'muted small' }, `Dla food cost 30%: cena porcji ok. ${fmtMoney(priceForFoodCost(c.perPortion, 30), cur$)}`));
      if (c.missing) body.push(h('p', { class: 'muted small' }, `Składników bez ceny lub zgodnej jednostki: ${c.missing}`));
    } else body.push(h('p', { class: 'muted' }, 'Dodaj ceny składników, aby policzyć koszt receptury, porcji i food cost.'));
    body.push(button(any ? 'Edytuj ceny' : 'Dodaj ceny', { icon: 'coins', block: true, onClick: openPrices }));
    return h('section', { class: 'card' }, h('h2', { class: 'card-title' }, icon('coins', 20), 'Koszt'), ...body);
  }

  /* ----- Historia ----- */

  async function openHistory() {
    const list = await getHistory(id);
    const body = h('div', { class: 'stack' });
    if (!list.length) body.append(emptyState('🕓', 'Brak historii', 'Każda zapisana zmiana pojawi się tutaj, z możliwością przywrócenia.'));
    list.forEach((e) => {
      const detail = h('div', { class: 'hist-detail', hidden: true });
      const btnPrev = button('Podgląd', { sm: true, kind: 'ghost', onClick: () => {
        if (!detail.hidden) { detail.hidden = true; btnPrev.lastChild.textContent = 'Podgląd'; return; }
        const snap = e.snapshot;
        detail.replaceChildren(
          h('div', { class: 'muted small' }, `${snap.servings} porcji · ${catName(snap.category)}`),
          ...snap.sections.map((sec) => h('div', null, sec.name ? h('div', { class: 'tape' }, sec.name) : null,
            h('ul', { class: 'plain' }, sec.ingredients.map((i) => { const q = qtyParts(i); return h('li', null, `${i.name} — ${[q.num, q.unit].filter(Boolean).join(' ')}`); })))),
          snap.steps.length ? h('ol', { class: 'plain steps-mini' }, snap.steps.map((st) => h('li', null, st.text))) : null);
        detail.hidden = false; btnPrev.lastChild.textContent = 'Ukryj';
      } });
      const btnRestore = button('Przywróć wersję', { sm: true, kind: 'primary', onClick: async () => {
        const ok = await confirmDialog({ title: 'Przywrócić tę wersję?', message: `Receptura wróci do stanu z ${fmtDateTime(e.at)}. Obecna wersja trafi do historii, więc możesz to cofnąć.`, confirmText: 'Przywróć' });
        if (!ok) return;
        await restoreVersion(e);
        sheet.close(); scaled = null; toast('Przywrócono wersję'); paint();
      } });
      body.append(h('div', { class: 'hist-item' },
        h('div', { class: 'hist-date' }, fmtDateTime(e.at)),
        h('ul', { class: 'plain hist-changes' }, e.changes.map((c) => h('li', null, c))),
        h('div', { class: 'row gap' }, btnPrev, btnRestore), detail));
    });
    const sheet = openSheet({ title: 'Historia zmian', variant: 'sheet', body, actions: [{ label: 'Zamknij', kind: 'ghost' }] });
  }

  /* ----- Menu „więcej” ----- */

  function openMore() {
    const r = base();
    const sh = openSheet({
      title: r.name || 'Receptura', variant: 'sheet',
      body: h('div', { class: 'menu' },
        button('Zapytaj Żarłoka AI', { icon: 'sparkle', block: true, onClick: () => { sh.close(); openRecipeAiSheet({ openSheet, recipe: r }); } }),
        button('Edytuj recepturę', { icon: 'edit', block: true, onClick: () => { sh.close(); navigate('/edit/' + id); } }),
        button('Duplikuj', { icon: 'copy', block: true, onClick: async () => { sh.close(); const c = await duplicateRecipe(id); toast('Utworzono kopię', { action: { label: 'Otwórz', fn: () => navigate('/recipe/' + c.id) } }); } }),
        button('Skopiuj jako tekst', { icon: 'copy', block: true, onClick: async () => { sh.close(); const ok = await copyText(recipeToText(cur())); toast(ok ? 'Skopiowano recepturę' : 'Nie udało się skopiować', { type: ok ? '' : 'error' }); } }),
        navigator.share ? button('Udostępnij', { icon: 'share', block: true, onClick: async () => { sh.close(); try { await navigator.share({ title: r.name, text: recipeToText(cur()) }); } catch (_) { /* anulowano */ } } }) : null,
        amateur() ? null : button('Historia zmian', { icon: 'history', block: true, onClick: () => { sh.close(); openHistory(); } }),
        button('Usuń recepturę', { icon: 'trash', kind: 'danger', block: true, onClick: async () => {
          sh.close();
          const ok = await confirmDialog({ title: `Usunąć „${r.name}”?`, message: 'Receptura wraz z historią zmian zostanie usunięta z tego telefonu. Tej operacji nie da się cofnąć (chyba że masz kopię JSON).', confirmText: 'Usuń', danger: true });
          if (!ok) return;
          await deleteRecipe(id); toast('Receptura usunięta'); navigate('/recipes', { replace: true });
        } })),
    });
  }

  /* ----- Rysowanie ----- */

  let notesDirty = false;
  const notesSave = debounce(async (val) => {
    skipPaint = true;
    try { await patchRecipe(id, { notes: val }, { touch: true }); } finally { skipPaint = false; }
    notesDirty = false;
    savedHint.textContent = 'Zapisano';
    setTimeout(() => { if (savedHint.textContent === 'Zapisano') savedHint.textContent = ''; }, 1500);
  }, 500);
  const savedHint = h('span', { class: 'muted small saved-hint', 'aria-live': 'polite' });
  let notesEl = null;

  function ingredientsCard(r, table) {
    const showPct = !!(table && table.ok && r.bakers && !amateur());
    const pct = new Map(table && table.ok ? table.rows.map((x) => [x.id, x]) : []);
    const secs = r.sections.filter((sec) => sec.ingredients.length || sec.name);
    return h('section', { class: 'card ingredients' },
      h('h2', { class: 'card-title' }, icon('list', 20), 'Składniki'),
      secs.length ? secs.map((sec) => h('div', { class: 'ing-section' },
        sec.name ? h('div', { class: 'tape' }, sec.name) : null,
        h('ul', { class: 'ing-list' }, sec.ingredients.map((i) => {
          const q = qtyParts(i);
          const p = pct.get(i.id);
          return h('li', { class: 'ing' },
            h('span', { class: 'ing-name' }, i.name || '—', showPct && p && KIND_LABEL[p.kind] ? h('span', { class: 'kind' }, KIND_LABEL[p.kind]) : null),
            showPct && p && p.pct != null ? h('span', { class: 'ing-pct num' }, fmtPct(p.pct)) : null,
            h('span', { class: 'ing-qty' }, h('span', { class: 'amt num' }, q.num), h('span', { class: 'unit' }, q.unit)));
        })))) : h('p', { class: 'muted' }, 'Brak składników.'));
  }

  function bakersCard(r, table) {
    if (!r.bakers || amateur() || !table.ok) return null;
    const kv = (k, v) => h('div', { class: 'stat' }, h('span', { class: 'stat-k' }, k), h('span', { class: 'stat-v num' }, v));
    return h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, icon('percent', 20), 'Procenty piekarskie'),
      h('div', { class: 'stats' }, kv('Mąka', fmtAmount(table.flourG) + ' g'), kv('Masa ciasta', fmtAmount(table.totalG) + ' g'), kv('Hydracja', fmtPct(table.hydration)),
        kv('Sól', fmtPct(table.salt)), kv('Drożdże', fmtPct(table.yeast)), table.fat > 0 ? kv('Tłuszcz', fmtPct(table.fat)) : null),
      button('Przelicz ciasto', { icon: 'swap', block: true, onClick: openBakers }));
  }

  function paint() {
    const r = cur();
    s.setTitle(r.name || 'Receptura');
    heartSlot.replaceChildren(heartBtn(base()));
    const table = bakersTable(r);
    const all = allIngredients(r).filter((i) => i.name);
    const preview = all.slice(0, 4);
    const ingredientOrb = (ing) => {
      const src = ing.photo || ing.image || ingredientArtUrl(ing.name);
      return h('div', { class: 'ref-ingredient-orb', title: ing.name, 'aria-label': ing.name },
        h('img', { src, alt: '', loading: 'lazy' }));
    };
    const stat = (value, label, cls = '') => h('span', { class: 'ref-detail-stat ' + cls }, h('strong', null, value), h('small', null, label));

    const card = h('article', { class: 'recipe-reference-card' },
      h('div', { class: 'recipe-reference-photo' },
        h('img', { src: base().photo || base().thumb || recipeArtUrl(base()), alt: base().photo ? 'Zdjęcie: ' + r.name : '' }),
        h('div', { class: 'recipe-reference-photo-shade', 'aria-hidden': 'true' })),
      h('div', { class: 'recipe-reference-content' },
        h('div', { class: 'recipe-reference-top' },
          iconBtn('left', 'Wstecz', () => goBack('/recipes'), 'ref-card-nav'),
          h('div', { class: 'ref-card-nav-group' },
            heartBtn(base()),
            iconBtn('more', 'Więcej', () => openMore(), 'ref-card-nav'))),
        h('div', { class: 'recipe-reference-kicker' },
          h('span', null, catName(r.category)),
          r.traditional ? h('span', { class: 'ref-trad-dot' }, icon('star', 12)) : null),
        h('h1', { class: 'recipe-reference-title' }, r.name || 'Bez nazwy'),
        h('div', { class: 'recipe-reference-meta' },
          r.rating ? h('span', { class: 'ref-rating' }, icon('star', 15), fmtNum(r.rating, 1)) : null,
          r.calories ? h('span', null, fmtNum(r.calories, 0) + ' kcal') : null,
          r.servings ? h('span', null, fmtNum(r.servings, 1) + ' porcje') : null,
          (r.prepTime || r.cookTime) ? h('span', null, fmtMinutes((r.prepTime || 0) + (r.cookTime || 0))) : null),
        r.description ? h('p', { class: 'recipe-reference-desc' }, r.description) : null,
        h('div', { class: 'recipe-reference-ingredients' },
          h('div', { class: 'ref-section-title' }, 'Składniki', h('span', null, r.servings ? 'na ' + fmtNum(r.servings, 1) + ' porcję' : '')),
          h('div', { class: 'ref-ingredient-row' },
            preview.map((ing) => h('div', { class: 'ref-ingredient-item' }, ingredientOrb(ing), h('span', null, ing.name))),
            all.length > preview.length ? h('button', {
              type: 'button',
              class: 'ref-ingredient-more',
              'aria-label': 'Otwórz pełną recepturę',
              title: 'Otwórz pełną recepturę',
              onClick: (e) => { e.preventDefault(); e.stopPropagation(); navigate('/recipe/' + encodeURIComponent(id) + '?details=1'); }
            }, '+' + (all.length - preview.length)) : null)),
        h('div', { class: 'recipe-reference-primary' },
          button('GOTUJĘ', { kind: 'primary', lg: true, block: true, icon: 'chef', onClick: () => navigate('/guide/' + id) }))));

    const details = h('div', { class: 'ref-details' },
      h('div', { class: 'ref-details-grid' },
        r.servings ? stat(fmtNum(r.servings, 1), 'porcje') : null,
        (r.prepTime || r.cookTime) ? stat(fmtMinutes((r.prepTime || 0) + (r.cookTime || 0)), 'czas') : null,
        !amateur() && recipeCost(r, 1).perPortion != null ? stat(fmtMoney(recipeCost(r, 1).perPortion, getSetting('currency') || 'zł'), 'koszt / porcję', 'cost') : null,
        r.fermentTime ? stat(fmtMinutes(r.fermentTime), 'fermentacja') : null),
      h('div', { class: 'ref-detail-actions' },
        button('Przelicz', { icon: 'swap', onClick: openScale }),
        button('Do zakupów', { icon: 'cart', onClick: () => openAddToShopping(r, 1) }),
        button('Edytuj', { icon: 'edit', onClick: () => navigate('/edit/' + id) })),
      scaled ? h('div', { class: 'banner scale-banner', role: 'status' },
        h('div', { class: 'banner-text' }, h('strong', null, 'Przeliczone: ' + scaleLabel), h('span', { class: 'muted' }, 'Podgląd — nic jeszcze nie zapisano.')),
        h('div', { class: 'row wrap gap' },
          button('Zapisz jako nową', { sm: true, onClick: saveScaledNew }),
          button('Zapisz w tej', { sm: true, onClick: saveScaledHere }),
          button('Reset', { sm: true, kind: 'ghost', onClick: () => { scaled = null; scaleLabel = ''; paint(); } }))) : null,
      ingredientsCard(r, table),
      bakersCard(r, table),
      h('section', { class: 'card' },
        h('h2', { class: 'card-title' }, icon('list', 20), 'Przygotowanie'),
        r.steps.length ? h('ol', { class: 'steps' }, r.steps.map((st) => h('li', null, h('span', { class: 'step-text' }, st.text)))) : h('p', { class: 'muted' }, 'Brak kroków. Dodaj je w edytorze.')),
      !amateur() ? costCard() : null,
      (() => {
        const startNotes = notesDirty && notesEl ? notesEl.value : base().notes || '';
        notesEl = textArea({ value: startNotes, label: 'Własne uwagi', placeholder: 'Np. ciasto wyszło za twarde — następnym razem +10 g wody…', rows: 3, onInput: (v) => { notesDirty = true; savedHint.textContent = '…'; notesSave(v); } });
        return h('section', { class: 'card' }, h('div', { class: 'row between' }, h('h2', { class: 'card-title' }, icon('edit', 20), 'Własne uwagi'), savedHint), notesEl);
      })());

    const fullHero = h('div', { class: 'recipe-full-hero' },
      h('img', {
        src: base().photo || base().thumb || recipeArtUrl(base()),
        alt: base().photo ? 'Zdjęcie: ' + r.name : '',
        loading: 'eager',
        decoding: 'async'
      }),
      h('div', { class: 'recipe-full-hero-shade', 'aria-hidden': 'true' }),
      h('div', { class: 'recipe-full-top' },
        iconBtn('left', 'Wstecz', () => goBack('/recipe/' + encodeURIComponent(id)), 'ref-card-nav'),
        h('div', { class: 'ref-card-nav-group' },
          heartBtn(base()),
          iconBtn('more', 'Więcej', () => openMore(), 'ref-card-nav'))),
      h('div', { class: 'recipe-full-copy' },
        h('div', { class: 'recipe-reference-kicker' },
          h('span', null, catName(r.category)),
          originOf(r.origin) ? h('span', { class: 'recipe-full-origin' }, originOf(r.origin).flag + ' ' + originOf(r.origin).name) : null,
          r.traditional ? h('span', { class: 'ref-trad-dot' }, icon('star', 12)) : null),
        h('h1', { class: 'recipe-full-title' }, r.name || 'Bez nazwy'),
        h('div', { class: 'recipe-full-meta' },
          r.rating ? h('span', { class: 'ref-rating' }, icon('star', 15), fmtNum(r.rating, 1)) : null,
          r.servings ? h('span', null, fmtNum(r.servings, 1) + ' porcji') : null,
          (r.prepTime || r.cookTime) ? h('span', null, fmtMinutes((r.prepTime || 0) + (r.cookTime || 0))) : null,
          r.fermentTime ? h('span', null, 'ferm. ' + fmtMinutes(r.fermentTime)) : null)),
      );
    const sourceFoot = h('div', { class: 'meta-foot muted small' },
      base().source ? h('div', null, 'Źródło: ', base().source) : null,
      base().sourceUrl ? h('div', null, h('a', { class: 'ext', href: base().sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('link', 16), hostOf(base().sourceUrl) || base().sourceUrl)) : null,
      h('div', null, 'Dodano ' + fmtDate(base().createdAt, true) + ' · zmieniono ' + fmtDateTime(base().updatedAt)),
      !amateur() ? h('div', { class: 'row center' }, button('Historia zmian', { icon: 'history', kind: 'ghost', onClick: openHistory })) : null
    );

    if (expanded) {
      s.content.replaceChildren(
        h('div', { class: 'recipe-fullscreen' },
          fullHero,
          details,
          sourceFoot)
      );
    } else {
      s.content.replaceChildren(
        h('div', { class: 'ref-detail-stage' }, card)
      );
    }
  }
  paint();
  const unsub = subscribe((t) => {
    if (skipPaint) return;
    if (t === 'recipes' || t === 'settings' || t === 'categories') {
      if (!getRecipe(id)) { navigate('/recipes', { replace: true }); return; }
      paint();
    }
  });
  return { el: s.el, destroy: () => { unsub(); if (notesDirty && notesEl) notesSave.flush(notesEl.value); if (expanded) document.body.classList.remove('no-tabs'); } };
}
