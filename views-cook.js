/* ==========================================================================
   views-cook.js — tryb GOTUJĘ: duże checkboxy składników i kroków (postęp
   zapisuje się w IndexedDB), minutnik z dźwiękiem, przeliczanie, uwagi,
   blokada wygaszania ekranu (Wake Lock).
   ========================================================================== */
import { h, icon, screen, button, iconBtn, toast, openSheet, confirmDialog, numInput, textArea, field, emptyState } from './ui.js';
import { navigate, goBack } from './router.js';
import { getRecipe, patchRecipe, getSetting } from './recipes.js';
import { kv } from './db.js';
import { recordCook } from './history.js';
import { consumeRecipeIngredients } from './inventory.js';
import { addItems } from './shopping.js';
import { scaleRecipe, factorFromServings } from './calculator.js';
import { qtyParts } from './components.js';
import { fmtNum, debounce, parseNum } from './util.js';
import { startTimer, openTimersSheet } from './timers.js';
import { consumeRecipeIngredients } from './inventory.js';
import { addItems, addLowStockToShopping } from './shopping.js';
import { recordCook } from './history.js';

/* ---------- Widok ---------- */

const TIME_RE = /(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*(minut\w*|min\.?|godzin\w*|godz\.?|h|sekund\w*|sek\.?|s)(?![a-ząćęłńóśźż])/gi;

/** Wszystkie czasy w tekście kroku → [{ sec, label }] (dla zakresu „8–10 min” bierze górną granicę). */
export function findTimes(text) {
  const out = [];
  for (const m of text.matchAll(TIME_RE)) {
    const n = parseNum(m[2] || m[1]);
    if (!(n > 0)) continue;
    const u = m[3].toLowerCase();
    const sec = u.startsWith('min') ? n * 60 : u.startsWith('g') || u === 'h' ? n * 3600 : n;
    if (sec < 10 || sec > 12 * 3600) continue;
    if (!out.some((o) => o.sec === Math.round(sec))) out.push({ sec: Math.round(sec), label: m[0].trim() });
  }
  return out.slice(0, 3);
}
const stepTimer = (text) => findTimes(text)[0] || null;

export function cookView({ id }) {
  const r0 = getRecipe(id);
  if (!r0) {
    const s = screen({ title: 'Gotuję', left: iconBtn('left', 'Wstecz', () => goBack('/recipes')) },
      emptyState('🤷', 'Nie ma takiej receptury', '', button('Receptury', { kind: 'primary', onClick: () => navigate('/recipes', { replace: true }) })));
    return { el: s.el };
  }

  let prog = { ing: {}, steps: {}, factor: 1, tab: 'ing', ts: 1.15, inventoryConsumedAt: 0, inventoryConsumptionId: '', cookHistoryId: '' };
  let loaded = false;
  const base = () => getRecipe(id) || r0;
  const view = () => scaleRecipe(base(), prog.factor || 1);
  const saveProg = debounce(() => { kv.set('cook:' + id, prog).catch(() => {}); }, 300);

  const s = screen({ title: r0.name, left: iconBtn('left', 'Wróć do receptury', () => goBack('/recipe/' + id)), cls: 'cook',
    right: h('div', { class: 'row' },
      h('button', { type: 'button', class: 'iconbtn txt', 'aria-label': 'Mniejszy tekst', onClick: () => setTs(-0.1) }, 'A−'),
      h('button', { type: 'button', class: 'iconbtn txt big', 'aria-label': 'Większy tekst', onClick: () => setTs(0.1) }, 'A+'),
      iconBtn('more', 'Więcej', () => openMore())) });
  const progress = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { class: 'bar' }));
  const progressText = h('span', { class: 'muted small num' });
  const tabs = h('div', { class: 'cook-tabs' });
  s.top.append(h('div', { class: 'cook-sub' }, tabs, h('div', { class: 'row between' }, progressText), progress));

  const foot = h('div', { class: 'cookbar' },
    button('Minutnik', { icon: 'timer', onClick: () => openTimersSheet() }),
    button('Przelicz', { icon: 'swap', onClick: () => openScale() }),
    button('Zakończ', { icon: 'check', kind: 'primary', onClick: () => finish() }));
  s.el.append(foot);

  function setTs(d) {
    prog.ts = Math.min(1.8, Math.max(0.9, Math.round((prog.ts + d) * 10) / 10));
    s.el.style.setProperty('--cook-ts', String(prog.ts));
    saveProg();
  }

  /* ----- Treść ----- */

  const counts = () => {
    const r = view();
    const ings = r.sections.flatMap((x) => x.ingredients).filter((i) => i.name);
    const di = ings.filter((i) => prog.ing[i.id]).length;
    const ds = r.steps.filter((st) => prog.steps[st.id]).length;
    return { ni: ings.length, di, ns: r.steps.length, ds };
  };

  function paintProgress() {
    const c = counts();
    const total = c.ni + c.ns, done = c.di + c.ds;
    const pct = total ? Math.round((done / total) * 100) : 0;
    progress.firstChild.style.width = pct + '%';
    progress.setAttribute('aria-valuenow', pct);
    progressText.textContent = `Składniki ${c.di}/${c.ni} · Kroki ${c.ds}/${c.ns}`;
    tabs.replaceChildren(...[['ing', 'Składniki'], ['steps', 'Kroki'], ['notes', 'Uwagi']].map(([k, l]) =>
      h('button', { type: 'button', class: 'ctab' + (prog.tab === k ? ' on' : ''), 'aria-pressed': prog.tab === k, onClick: () => { prog.tab = k; saveProg(); paint(); s.scroll.scrollTop = 0; } }, l)));
  }

  function toggle(map, key, rowEl) {
    map[key] = !map[key];
    if (!map[key]) delete map[key];
    saveProg();
    rowEl.classList.toggle('on', !!map[key]);
    rowEl.setAttribute('aria-checked', !!map[key]);
    paintProgress();
    if (prog.tab === 'steps') markCurrent();
  }

  function checkRow(key, map, inner, cls = '') {
    const row = h('div', { class: `cook-row ${cls} ${map[key] ? 'on' : ''}`, role: 'checkbox', tabindex: '0', 'aria-checked': !!map[key] },
      h('span', { class: 'cbox' }, icon('check', 22)), inner);
    row.addEventListener('click', (e) => { if (e.target.closest('.step-timer')) return; toggle(map, key, row); });
    row.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(map, key, row); } });
    return row;
  }

  function markCurrent() {
    const rows = [...s.content.querySelectorAll('.cook-row.step')];
    let found = false;
    rows.forEach((row) => { const cur = !found && !row.classList.contains('on'); if (cur) found = true; row.classList.toggle('current', cur); });
  }

  function ingTab(r) {
    const kids = [];
    r.sections.forEach((sec) => {
      const list = sec.ingredients.filter((i) => i.name);
      if (!list.length) return;
      if (sec.name) kids.push(h('div', { class: 'tape' }, sec.name));
      list.forEach((i) => {
        const q = qtyParts(i);
        kids.push(checkRow(i.id, prog.ing, h('span', { class: 'cook-text' },
          h('span', { class: 'cook-name' }, i.name),
          h('span', { class: 'cook-qty' }, h('span', { class: 'amt num' }, q.num), h('span', { class: 'unit' }, q.unit)))));
      });
    });
    if (!kids.length) kids.push(h('p', { class: 'muted' }, 'Brak składników.'));
    return h('div', { class: 'cook-list' }, kids);
  }

  function stepsTab(r) {
    if (!r.steps.length) return h('p', { class: 'muted' }, 'Brak kroków. Dodaj je w edytorze.');
    return h('div', { class: 'cook-list' }, r.steps.map((st, n) => {
      const t = stepTimer(st.text);
      return checkRow(st.id, prog.steps, h('span', { class: 'cook-text' },
        h('span', { class: 'cook-step-n num' }, String(n + 1)),
        h('span', { class: 'cook-step' }, st.text),
        t ? h('button', { type: 'button', class: 'chip step-timer', 'aria-label': `Uruchom minutnik: ${t.label}`, onClick: (e) => { e.stopPropagation(); startTimer(t.sec, `krok ${n + 1} · ${r0.name}`); toast(`Minutnik: ${t.label}`); } }, icon('timer', 16), t.label) : null), 'step');
    }));
  }

  let notesEl = null, notesDirty = false;
  const saved = h('span', { class: 'muted small', 'aria-live': 'polite' });
  const notesSave = debounce(async (v) => {
    await patchRecipe(id, { notes: v }, { touch: true });
    notesDirty = false; saved.textContent = 'Zapisano';
    setTimeout(() => { if (saved.textContent === 'Zapisano') saved.textContent = ''; }, 1500);
  }, 500);
  function notesTab() {
    notesEl = textArea({ value: base().notes || '', label: 'Własne uwagi', rows: 6, placeholder: 'Notuj w trakcie: zmiany, czasy, wrażenia…', onInput: (v) => { notesDirty = true; saved.textContent = '…'; notesSave(v); } });
    return h('div', { class: 'stack' }, h('div', { class: 'row between' }, h('h3', { class: 'group-title' }, 'Własne uwagi'), saved), notesEl);
  }

  function paint() {
    paintProgress();
    const r = view();
    let body;
    if (prog.tab === 'steps') body = stepsTab(r);
    else if (prog.tab === 'notes') body = notesTab();
    else body = ingTab(r);
    const kids = [];
    if ((prog.factor || 1) !== 1) kids.push(h('div', { class: 'banner info small', role: 'status' }, h('strong', null, `Przeliczone ×${fmtNum(prog.factor, 3)}`), h('button', { type: 'button', class: 'linkbtn', onClick: () => { prog.factor = 1; saveProg(); paint(); } }, 'Reset')));
    kids.push(body);
    s.content.replaceChildren(...kids);
    if (prog.tab === 'steps') markCurrent();
    if (notesEl) notesEl._fit && requestAnimationFrame(() => notesEl._fit());
  }

  /* ----- Arkusze ----- */

  function openScale() {
    const r = base();
    let servings = r.servings ? r.servings * (prog.factor || 1) : null;
    const out = h('div', { class: 'preview-line' });
    const apply = (k) => { prog.factor = k; saveProg(); paint(); };
    const chips = [0.5, 1, 2, 3, 4].map((k) => h('button', { type: 'button', class: 'chip' + ((prog.factor || 1) === k ? ' on' : ''), onClick: () => { apply(k); sh.close(); } }, '×' + String(k).replace('.', ',')));
    const sh = openSheet({
      title: 'Przelicz w trakcie gotowania', variant: 'sheet',
      body: h('div', { class: 'stack' }, h('div', { class: 'chips wrap' }, chips),
        r.servings ? field('Liczba porcji', numInput({ value: servings, label: 'Liczba porcji', dec: 1, onInput: (v) => { servings = v; const k = factorFromServings(r, v); out.textContent = k ? `Współczynnik ×${fmtNum(k, 3)}` : ''; } })) : null, out),
      actions: [{ label: 'Anuluj', kind: 'ghost' }, { label: 'Przelicz', kind: 'primary', onClick: () => {
        const k = r.servings ? factorFromServings(r, servings) : null;
        if (!k) { toast('Podaj liczbę porcji albo wybierz mnożnik', { type: 'error' }); return false; }
        apply(k);
      } }],
    });
  }

  function openMore() {
    const sh = openSheet({
      title: 'Gotuję', variant: 'sheet',
      body: h('div', { class: 'menu' },
        button('Wyczyść zaznaczenia', { icon: 'refresh', block: true, onClick: async () => { sh.close(); prog.ing = {}; prog.steps = {}; saveProg(); paint(); toast('Wyczyszczono postęp'); } }),
        button('Edytuj recepturę', { icon: 'edit', block: true, onClick: () => { sh.close(); navigate('/edit/' + id); } }),
        button('Wróć do receptury', { icon: 'left', block: true, onClick: () => { sh.close(); goBack('/recipe/' + id); } })),
    });
  }

  async function finish() {
    const c = counts();
    const all = c.di === c.ni && c.ds === c.ns;
    if (!all) {
      const ok = await confirmDialog({ title: 'Zakończyć gotowanie?', message: 'Nie wszystko jest odhaczone. Postęp zostanie zapamiętany, więc możesz wrócić do tego miejsca.', confirmText: 'Zakończ' });
      if (!ok) return;
    }

    if (all && !prog.inventoryConsumedAt) {
      const autoConsumption = getSetting('inventoryAutoConsumption') !== false;
      const useStock = autoConsumption ? true : await confirmDialog({
        title: 'Odjąć składniki z magazynu?',
        message: 'Aplikacja odejmie od Magazynu ilości użyte w tej recepturze.',
        confirmText: 'Odjąć',
      });

      if (useStock) {
        const sourceId = prog.inventoryConsumptionId || `cook:${id}:${Date.now()}`;
        prog.inventoryConsumptionId = sourceId;
        try {
          const result = await consumeRecipeIngredients(base(), prog.factor || 1, { sourceId });

          if (result.shortages.length) {
            const autoShopping = getSetting('inventoryAutoShopping') !== false;
            if (autoShopping) {
              await addItems(result.shortages.map((x) => ({
                name: x.name, amount: x.missing, unit: x.unit, recipeId: id, recipeName: r0.name
              })));
              toast('Magazyn zaktualizowany · braki dodane do zakupów 📦');
            } else {
              toast('Magazyn zaktualizowany · występują braki 📦', { type: 'error' });
            }
          } else {
            toast('Zużycie zapisane w magazynie 📦');
          }

          prog.inventoryConsumedAt = Date.now();
        } catch (e) {
          console.error(e);
          toast(e?.message || 'Nie udało się zaktualizować magazynu.', { type: 'error' });
          saveProg.flush();
          return;
        }
      }
    }

    if (all) {
      const cookedAt = Date.now();
      const cookEventId = prog.cookHistoryId || `cook:${id}:${cookedAt}`;
      prog.cookHistoryId = cookEventId;
      const cookedRecipe = base();
      const cookedFactor = Number(prog.factor || 1);
      const cookedServings = Number(view().servings || cookedRecipe.servings || 1);

      try {
        await recordCook({
          id: cookEventId,
          recipeId: id,
          recipeName: cookedRecipe.name,
          at: cookedAt,
          factor: cookedFactor,
          servings: cookedServings,
          inventoryConsumed: !!prog.inventoryConsumedAt,
        });
        await patchRecipe(id, {
          lastCookedAt: cookedAt,
          cookCount: Number(cookedRecipe.cookCount || 0) + 1,
        }, { touch: true });
      } catch (e) {
        console.error(e);
        toast('Gotowanie zakończone, ale nie udało się zapisać historii.', { type: 'error' });
      }

      prog.ing = {};
      prog.steps = {};
      prog.tab = 'ing';
      prog.inventoryConsumedAt = 0;
      prog.inventoryConsumptionId = '';
      prog.cookHistoryId = '';
      saveProg.flush();
      toast('Smacznego! 👨‍🍳');
    }

    goBack('/recipe/' + id);
  }

  /* ----- Wake Lock ----- */

  let lock = null;
  async function acquire() {
    if (!getSetting('keepAwake') || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch (_) { /* odmowa */ }
  }
  const onVis = () => { if (document.visibilityState === 'visible' && !lock) acquire(); };
  document.addEventListener('visibilitychange', onVis);

  /* ----- Start ----- */

  s.el.style.setProperty('--cook-ts', String(prog.ts));
  paint();
  kv.get('cook:' + id).then((p) => {
    if (p && typeof p === 'object') {
      prog = { ing: {}, steps: {}, factor: 1, tab: 'ing', ts: 1.15, inventoryConsumedAt: 0, inventoryConsumptionId: '', cookHistoryId: '', ...p };
      s.el.style.setProperty('--cook-ts', String(prog.ts));
      const c = counts();
      if (p.tab === undefined && c.ni && c.di === c.ni) prog.tab = 'steps';
    }
    loaded = true;
    paint();
  }).catch(() => { loaded = true; });
  acquire();

  return {
    el: s.el,
    destroy: () => {
      document.removeEventListener('visibilitychange', onVis);
      if (loaded) saveProg.flush();
      if (notesDirty && notesEl) notesSave.flush(notesEl.value);
      if (lock) { try { lock.release(); } catch (_) { /* */ } lock = null; }
    },
  };
}
