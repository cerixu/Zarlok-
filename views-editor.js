/* ==========================================================================
   views-editor.js — edytor receptury (nowa / edycja / po imporcie).
   Wszystko edytowalne: sekcje, składniki, kroki, zdjęcie, tagi, czasy.
   Szkic zapisuje się w IndexedDB na bieżąco (draft:<id>) — nic nie ginie.
   ========================================================================== */
import {
  h, icon, screen, button, iconBtn, toast, openSheet, confirmDialog, promptDialog, field, textInput, textArea, numInput, selectEl,
  switchEl, emptyState, focusLater, autosizeAll,
} from './ui.js';
import { navigate, goBack } from './router.js';
import {
  state, getRecipe, blankRecipe, blankSection, blankIngredient, blankStep, normalizeRecipe, cloneRecipe, saveRecipe, ORIGINS,
  ingredientNames, catalogLookup,
} from './recipes.js';
import { kv } from './db.js';
import { bakersTable } from './calculator.js';
import { parseIngredientLine, cleanStep } from './importer.js';
import { UNITS, debounce, fmtDateTime } from './util.js';

/* ---------- Zdjęcia: kompresja lokalna ---------- */

async function loadBitmap(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* fallback */ }
  }
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Nie można odczytać obrazu')); };
    img.src = url;
  });
}
function toJpeg(bmp, max, q) {
  const w = bmp.width || bmp.naturalWidth, hh = bmp.height || bmp.naturalHeight;
  const k = Math.min(1, max / Math.max(w, hh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(hh * k));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
export async function compressPhoto(file) {
  const bmp = await loadBitmap(file);
  const out = { photo: toJpeg(bmp, 1280, 0.78), thumb: toJpeg(bmp, 400, 0.72) };
  if (bmp.close) bmp.close();
  return out;
}

/* ---------- Pole czasu (minuty ↔ min/h) ---------- */

function timeField(label, minutes, onChange) {
  let unit = minutes >= 60 && minutes % 60 === 0 ? 'h' : 'min';
  let val = unit === 'h' ? minutes / 60 : minutes || null;
  const emit = () => onChange(val == null ? 0 : Math.round(unit === 'h' ? val * 60 : val));
  const num = numInput({ value: val, label, dec: 2, onInput: (v) => { val = v; emit(); } });
  const sel = selectEl([['min', 'min'], ['h', 'godz.']], unit, (u) => { unit = u; emit(); }, { label: `${label} — jednostka` });
  return field(label, h('div', { class: 'row gap' }, h('div', { class: 'grow' }, num), h('div', { class: 'unit-sel' }, sel)));
}

/* ---------- Widok ---------- */

export function editorView({ id }, query) {
  const isNew = !id;
  const existing = id ? getRecipe(id) : null;
  if (id && !existing) {
    const s = screen({ title: 'Edytor', left: iconBtn('left', 'Wstecz', () => goBack('/recipes')) },
      emptyState('🤷', 'Nie ma takiej receptury', 'Mogła zostać usunięta.', button('Receptury', { kind: 'primary', onClick: () => navigate('/recipes', { replace: true }) })));
    return { el: s.el };
  }

  let work = existing ? cloneRecipe(existing) : blankRecipe();
  let baseline = JSON.stringify(work);
  let issues = [];
  const draftKey = isNew ? 'draft:new' : 'draft:' + id;
  const amateur = () => state.settings.mode === 'amateur';

  const saveDraft = debounce(() => { kv.set(draftKey, { savedAt: Date.now(), recipe: work }).catch(() => {}); }, 700);
  const touch = () => { saveDraft(); };
  const isDirty = () => JSON.stringify(work) !== baseline;

  /* ----- Kontener ----- */
  const s = screen({ title: isNew ? 'Nowa receptura' : 'Edycja', left: iconBtn('x', 'Zamknij edytor', () => leave()), cls: 'editor' });
  const banner = h('div', { class: 'banner-slot' });
  const form = h('div', { class: 'form' });
  s.content.append(banner, form);

  const foot = h('div', { class: 'actionbar' },
    button('Anuluj', { kind: 'ghost', onClick: () => leave() }),
    button('Zapisz', { kind: 'primary', icon: 'check', cls: 'grow', onClick: () => doSave() }));
  s.el.append(foot);

  const datalist = h('datalist', { id: 'ing-names' }, ingredientNames().map((n) => h('option', { value: n })));

  /* ----- Wyjście / zapis ----- */

  async function leave() {
    if (!isDirty()) { saveDraft.cancel(); await kv.del(draftKey).catch(() => {}); return back(); }
    const choice = await new Promise((resolve) => {
      let res = 'stay';
      openSheet({
        title: 'Niezapisane zmiany', variant: 'center',
        body: h('p', { class: 'dialog-msg' }, 'Zapisać recepturę? Jeśli wyjdziesz bez zapisu, szkic zostanie w telefonie i będziesz mógł do niego wrócić.'),
        actions: [
          { label: 'Zostań', kind: 'ghost', onClick: () => { res = 'stay'; } },
          { label: 'Odrzuć', kind: 'danger', onClick: () => { res = 'discard'; } },
          { label: 'Zapisz', kind: 'primary', onClick: () => { res = 'save'; } },
        ],
        onClose: () => resolve(res),
      });
    });
    if (choice === 'save') doSave();
    else if (choice === 'discard') { saveDraft.cancel(); baseline = JSON.stringify(work); await kv.del(draftKey).catch(() => {}); back(); }
  }
  const back = () => (isNew ? goBack('/recipes') : goBack('/recipe/' + id));

  async function doSave() {
    const r = normalizeRecipe(work);
    r.name = (r.name || '').trim();
    if (!r.name) { toast('Podaj nazwę receptury', { type: 'error' }); const n = form.querySelector('[data-f="name"]'); if (n) { n.scrollIntoView({ block: 'center' }); focusLater(n); } return; }
    r.sections.forEach((sec) => { sec.ingredients = sec.ingredients.filter((i) => (i.name || '').trim() || i.amount != null); sec.ingredients.forEach((i) => { i.name = (i.name || '').trim(); }); });
    r.steps = r.steps.filter((st) => (st.text || '').trim()).map((st) => ({ ...st, text: st.text.trim() }));
    if (r.sections.length > 1) r.sections = r.sections.filter((sec, k) => sec.ingredients.length || (sec.name || '').trim() || k === 0);
    if (!r.traditional) r.origin = r.origin || '';
    if (r.bakers) {
      const t = bakersTable(r);
      if (t.ok) { const m = new Map(t.rows.map((x) => [x.id, x])); r.sections.forEach((sec) => sec.ingredients.forEach((i) => { const x = m.get(i.id); if (x && x.pct != null) i.percent = Math.round(x.pct * 100) / 100; })); }
    }
    try {
      saveDraft.cancel();
      const saved = await saveRecipe(r);
      await kv.del(draftKey).catch(() => {});
      baseline = JSON.stringify(work);
      toast('Zapisano');
      if (isNew) navigate('/recipe/' + saved.id, { replace: true });
      else goBack('/recipe/' + id);
    } catch (e) {
      console.error(e);
      toast('Nie udało się zapisać: ' + (e && e.message ? e.message : 'błąd bazy danych'), { type: 'error', sticky: true });
    }
  }

  /* ----- Podstawowe pola ----- */

  function photoBlock() {
    const fileIn = h('input', { type: 'file', accept: 'image/*', class: 'sr-file', 'aria-label': 'Wybierz zdjęcie' });
    const holder = h('div', { class: 'photo-block' });
    const paintPhoto = () => {
      holder.replaceChildren(
        work.photo ? h('img', { class: 'photo-prev', src: work.photo, alt: 'Zdjęcie receptury' }) : h('div', { class: 'photo-empty' }, icon('image', 30), h('span', null, 'Brak zdjęcia')),
        h('div', { class: 'row gap wrap' },
          button(work.photo ? 'Zmień zdjęcie' : 'Dodaj zdjęcie', { icon: 'image', onClick: () => fileIn.click() }),
          work.photo ? button('Usuń', { icon: 'trash', kind: 'ghost', onClick: () => { work.photo = ''; work.thumb = ''; paintPhoto(); touch(); } }) : null));
    };
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files && fileIn.files[0];
      if (!f) return;
      try {
        const t = toast('Przetwarzam zdjęcie…', { sticky: true });
        const { photo, thumb } = await compressPhoto(f);
        t.dismiss();
        work.photo = photo; work.thumb = thumb; paintPhoto(); touch();
      } catch (e) { toast('Nie udało się wczytać zdjęcia', { type: 'error' }); }
      fileIn.value = '';
    });
    paintPhoto();
    return h('div', null, fileIn, holder);
  }

  function basics() {
    const name = textInput({ value: work.name, label: 'Nazwa receptury', placeholder: 'Nazwa receptury', capitalize: 'sentences', onInput: (v) => { work.name = v; touch(); } });
    name.dataset.f = 'name';
    const cat = selectEl(state.categories.map((c) => [c.id, `${c.icon || ''} ${c.name}`.trim()]), work.category, (v) => { work.category = v; touch(); }, { label: 'Kategoria' });
    const originSel = selectEl([['', '— wybierz kraj —'], ...ORIGINS.map((o) => [o.code, `${o.flag} ${o.name}`])], work.origin || '', (v) => { work.origin = v; touch(); }, { label: 'Kraj pochodzenia' });
    const originWrap = h('div', { class: 'field-wrap', hidden: !work.traditional }, field('Kraj pochodzenia (flaga)', originSel));
    const col = (el) => h('div', { class: 'grow' }, el);
    return h('section', { class: 'card stack' },
      field('Nazwa', name),
      field('Kategoria', cat),
      field('Opis', textArea({ value: work.description, label: 'Opis', rows: 2, placeholder: 'Krótki opis (opcjonalnie)', onInput: (v) => { work.description = v; touch(); } })),
      photoBlock(),
      field('Porcje', numInput({ value: work.servings, label: 'Liczba porcji', dec: 1, onInput: (v) => { work.servings = v || 0; touch(); } })),
      h('div', { class: 'row gap' },
        col(field('Wydajność', numInput({ value: work.yieldAmount, label: 'Wydajność', onInput: (v) => { work.yieldAmount = v; touch(); } }))),
        col(field('Jednostka', selectEl(['g', 'kg', 'ml', 'l', 'szt.', 'porcja'], work.yieldUnit || 'g', (v) => { work.yieldUnit = v; touch(); })))),
      switchEl(!!work.traditional, (v) => { work.traditional = v; originWrap.hidden = !v; touch(); }, 'Tradycyjna receptura', 'Zostanie przypięta na górze z gwiazdką i flagą'),
      originWrap);
  }

  function timesCard() {
    return h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, icon('clock', 20), 'Czasy i temperatura'),
      timeField('Przygotowanie', work.prepTime, (m) => { work.prepTime = m; touch(); }),
      timeField('Gotowanie / pieczenie', work.cookTime, (m) => { work.cookTime = m; touch(); }),
      timeField('Fermentacja / odpoczynek', work.fermentTime, (m) => { work.fermentTime = m; touch(); }),
      field('Temperatura', textInput({ value: work.temperature, label: 'Temperatura', placeholder: 'np. 250 °C', onInput: (v) => { work.temperature = v; touch(); } })));
  }

  /* ----- Sekcje i składniki ----- */

  const secBox = h('div', { class: 'stack' });

  function openIngSheet(ing) {
    const secOptions = work.sections.map((sec, k) => [sec.id, sec.name || `Sekcja ${k + 1}`]);
    let secId = work.sections.find((sec) => sec.ingredients.includes(ing)).id;
    const flourSel = selectEl([['auto', 'Automatycznie (po nazwie)'], ['yes', 'To jest mąka (100%)'], ['no', 'To nie jest mąka']], typeof ing.flour === 'boolean' ? (ing.flour ? 'yes' : 'no') : 'auto', (v) => { ing.flour = v === 'auto' ? null : v === 'yes'; touch(); });
    const pkg = h('div', { class: 'row gap', hidden: ing.priceUnit !== 'opak.' },
      h('div', { class: 'grow' }, field('Waga opakowania', numInput({ value: ing.packageWeight, label: 'Waga opakowania', onInput: (v) => { ing.packageWeight = v; touch(); } }))),
      h('div', { class: 'grow' }, field('Jednostka', selectEl(['g', 'ml', 'szt.'], ing.packageUnit || 'g', (v) => { ing.packageUnit = v; touch(); }))));
    const cur$ = state.settings.currency || 'zł';
    openSheet({
      title: ing.name || 'Składnik', variant: 'sheet',
      body: h('div', { class: 'stack' },
        work.bakers ? field('Procent piekarski (opcjonalnie)', numInput({ value: ing.percent, label: 'Procent', dec: 2, onInput: (v) => { ing.percent = v; touch(); } }), 'Przy zapisie liczy się też automatycznie z mąki.') : null,
        work.bakers ? field('Rola składnika', flourSel) : null,
        h('div', { class: 'row gap' },
          h('div', { class: 'grow' }, field(`Cena (${cur$})`, numInput({ value: ing.price, label: 'Cena', dec: 2, onInput: (v) => { ing.price = v; touch(); } }))),
          h('div', { class: 'grow' }, field('Za', selectEl([['kg', 'kg'], ['l', 'l'], ['g', 'g'], ['ml', 'ml'], ['szt.', 'szt.'], ['opak.', 'opakowanie']], ing.priceUnit || 'kg', (v) => { ing.priceUnit = v; pkg.hidden = v !== 'opak.'; touch(); })))),
        pkg,
        work.sections.length > 1 ? field('Sekcja', selectEl(secOptions, secId, (v) => { secId = v; })) : null),
      actions: [{ label: 'Gotowe', kind: 'primary', onClick: () => {
        const from = work.sections.find((sec) => sec.ingredients.includes(ing));
        if (from && from.id !== secId) { from.ingredients.splice(from.ingredients.indexOf(ing), 1); work.sections.find((sec) => sec.id === secId).ingredients.push(ing); touch(); paintSections(); }
      } }],
    });
  }

  function moveIng(sec, idx, dir) {
    const si = work.sections.indexOf(sec);
    const j = idx + dir;
    if (j >= 0 && j < sec.ingredients.length) {
      [sec.ingredients[idx], sec.ingredients[j]] = [sec.ingredients[j], sec.ingredients[idx]];
    } else {
      const ns = work.sections[si + dir];
      if (!ns) return;
      const [ing] = sec.ingredients.splice(idx, 1);
      if (dir < 0) ns.ingredients.push(ing); else ns.ingredients.unshift(ing);
    }
    touch(); paintSections();
  }

  function ingRow(sec, idx) {
    const ing = sec.ingredients[idx];
    const nameIn = textInput({ value: ing.name, label: 'Nazwa składnika', placeholder: 'Składnik', list: 'ing-names', onInput: (v) => { ing.name = v; touch(); } });
    nameIn.addEventListener('change', () => {
      if (ing.price == null) {
        const c = catalogLookup(ing.name);
        if (c) { Object.assign(ing, { price: c.price, priceUnit: c.priceUnit, packageWeight: c.packageWeight, packageUnit: c.packageUnit }); touch(); toast(`Podstawiono cenę z katalogu: ${c.price} zł/${c.priceUnit}`); }
      }
    });
    const amt = numInput({ value: ing.amount, label: 'Ilość', placeholder: 'ilość', onInput: (v) => { ing.amount = v; touch(); } });
    const unit = selectEl(UNITS, ing.unit || 'g', (v) => { ing.unit = v; touch(); }, { label: 'Jednostka' });
    const si = work.sections.indexOf(sec);
    const canUp = idx > 0 || si > 0, canDown = idx < sec.ingredients.length - 1 || si < work.sections.length - 1;
    const up = iconBtn('up', 'Przesuń wyżej', () => moveIng(sec, idx, -1), 'quiet'); up.disabled = !canUp;
    const down = iconBtn('down', 'Przesuń niżej', () => moveIng(sec, idx, 1), 'quiet'); down.disabled = !canDown;
    return h('div', { class: 'ing-edit' },
      h('div', { class: 'row gap' }, h('div', { class: 'grow' }, nameIn), iconBtn('coins', `Cena i szczegóły: ${ing.name || 'składnik'}`, () => openIngSheet(ing), 'quiet' + (ing.price != null ? ' has' : ''))),
      h('div', { class: 'row gap ing-line2' }, h('div', { class: 'grow' }, amt), h('div', { class: 'grow unit-sel' }, unit), up, down,
        iconBtn('trash', `Usuń składnik ${ing.name || ''}`.trim(), () => { sec.ingredients.splice(idx, 1); touch(); paintSections(); }, 'quiet danger')));
  }

  function addIngredient(sec) {
    const ing = blankIngredient();
    sec.ingredients.push(ing);
    paintSections();
    touch();
    const rows = secBox.querySelectorAll(`[data-sec="${sec.id}"] .ing-edit`);
    const last = rows[rows.length - 1];
    if (last) { const inp = last.querySelector('input'); last.scrollIntoView({ block: 'center', behavior: 'smooth' }); focusLater(inp); }
  }

  function pasteIngredients(sec) {
    const ta = textArea({ value: '', label: 'Wklej składniki', rows: 8, placeholder: '500 g mąki\n2 łyżki oliwy\nsól do smaku' });
    openSheet({
      title: 'Wklej listę składników', variant: 'sheet',
      body: h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Jedna linia = jeden składnik. Rozpoznam ilości i jednostki (także cups, oz, lb — przeliczę na g/ml).'), ta),
      actions: [{ label: 'Anuluj', kind: 'ghost' }, { label: 'Dodaj', kind: 'primary', onClick: () => {
        const list = ta.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => parseIngredientLine(l)).filter(Boolean);
        if (!list.length) { toast('Nie rozpoznano składników', { type: 'error' }); return false; }
        const target = sec.ingredients.length === 1 && !sec.ingredients[0].name && sec.ingredients[0].amount == null ? (sec.ingredients.length = 0, sec.ingredients) : sec.ingredients;
        list.forEach((i) => target.push(i));
        touch(); paintSections(); toast(`Dodano składniki: ${list.length}`);
      } }],
    });
    setTimeout(() => ta._fit && ta._fit(), 50);
  }

  async function removeSection(sec) {
    const n = sec.ingredients.filter((i) => i.name).length;
    if (n || sec.name) {
      const ok = await confirmDialog({ title: `Usunąć sekcję${sec.name ? ` „${sec.name}”` : ''}?`, message: n ? `Zniknie też ${n} składników z tej sekcji.` : 'Sekcja jest pusta.', confirmText: 'Usuń', danger: true });
      if (!ok) return;
    }
    work.sections.splice(work.sections.indexOf(sec), 1);
    if (!work.sections.length) work.sections.push(blankSection(''));
    touch(); paintSections();
  }

  function moveSection(sec, dir) {
    const i = work.sections.indexOf(sec), j = i + dir;
    if (j < 0 || j >= work.sections.length) return;
    [work.sections[i], work.sections[j]] = [work.sections[j], work.sections[i]];
    touch(); paintSections();
  }

  function paintSections() {
    const multi = work.sections.length > 1;
    secBox.replaceChildren(...work.sections.map((sec, si) => {
      const nameIn = textInput({ value: sec.name, label: 'Nazwa sekcji', placeholder: 'Nazwa sekcji (np. CIASTO, SOS, DODATKI)', capitalize: 'characters', cls: 'sec-name', onInput: (v) => { sec.name = v; touch(); } });
      const up = iconBtn('up', 'Sekcja wyżej', () => moveSection(sec, -1), 'quiet'); up.disabled = si === 0;
      const dn = iconBtn('down', 'Sekcja niżej', () => moveSection(sec, 1), 'quiet'); dn.disabled = si === work.sections.length - 1;
      return h('section', { class: 'card sec-card', dataset: { sec: sec.id } },
        h('div', { class: 'row gap sec-head' }, h('div', { class: 'grow' }, nameIn), multi ? up : null, multi ? dn : null, iconBtn('trash', 'Usuń sekcję', () => removeSection(sec), 'quiet danger')),
        sec.ingredients.length ? h('div', { class: 'stack' }, sec.ingredients.map((_, i) => ingRow(sec, i))) : h('p', { class: 'muted small' }, 'Brak składników w tej sekcji.'),
        h('div', { class: 'row gap wrap' }, button('Składnik', { icon: 'plus', onClick: () => addIngredient(sec) }), button('Wklej listę', { icon: 'copy', kind: 'ghost', onClick: () => pasteIngredients(sec) })));
    }));
    autosizeAll(secBox);
  }

  function ingredientsCard() {
    return h('div', { class: 'stack' },
      h('div', { class: 'sechead' }, h('h2', null, 'Składniki')),
      secBox,
      button('Dodaj sekcję (np. SOS, DODATKI)', { icon: 'plus', block: true, onClick: async () => {
        const n = await promptDialog({ title: 'Nowa sekcja', label: 'Nazwa sekcji', placeholder: 'np. SOS', confirmText: 'Dodaj' });
        if (n == null) return;
        work.sections.push(blankSection(n.toUpperCase())); touch(); paintSections();
        const cards = secBox.querySelectorAll('.sec-card'); const last = cards[cards.length - 1];
        if (last) { last.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (!n) focusLater(last.querySelector('input')); }
      } }));
  }

  /* ----- Kroki ----- */

  const stepBox = h('div', { class: 'stack' });
  function paintSteps() {
    stepBox.replaceChildren(...work.steps.map((st, i) => {
      const ta = textArea({ value: st.text, label: `Krok ${i + 1}`, rows: 2, placeholder: 'Opisz krok…', onInput: (v) => { st.text = v; touch(); } });
      const up = iconBtn('up', 'Krok wyżej', () => { [work.steps[i - 1], work.steps[i]] = [work.steps[i], work.steps[i - 1]]; touch(); paintSteps(); }, 'quiet'); up.disabled = i === 0;
      const dn = iconBtn('down', 'Krok niżej', () => { [work.steps[i + 1], work.steps[i]] = [work.steps[i], work.steps[i + 1]]; touch(); paintSteps(); }, 'quiet'); dn.disabled = i === work.steps.length - 1;
      return h('div', { class: 'step-edit' }, h('span', { class: 'step-n num' }, String(i + 1)), h('div', { class: 'grow' }, ta),
        h('div', { class: 'step-btns' }, up, dn, iconBtn('trash', 'Usuń krok', () => { work.steps.splice(i, 1); touch(); paintSteps(); }, 'quiet danger')));
    }));
    if (!work.steps.length) stepBox.append(h('p', { class: 'muted small' }, 'Brak kroków.'));
    autosizeAll(stepBox);
  }

  function stepsCard() {
    return h('div', { class: 'stack' },
      h('div', { class: 'sechead' }, h('h2', null, 'Przygotowanie')),
      stepBox,
      h('div', { class: 'row gap wrap' },
        button('Krok', { icon: 'plus', onClick: () => {
          work.steps.push(blankStep('')); touch(); paintSteps();
          const areas = stepBox.querySelectorAll('textarea'); const last = areas[areas.length - 1];
          if (last) { last.scrollIntoView({ block: 'center', behavior: 'smooth' }); focusLater(last); }
        } }),
        button('Wklej kroki', { icon: 'copy', kind: 'ghost', onClick: () => {
          const ta = textArea({ value: '', label: 'Wklej kroki', rows: 8, placeholder: '1. Wymieszaj mąkę z wodą\n2. Odstaw na godzinę' });
          openSheet({
            title: 'Wklej kroki', variant: 'sheet', body: h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Jedna linia = jeden krok. Numery i punktory zostaną usunięte.'), ta),
            actions: [{ label: 'Anuluj', kind: 'ghost' }, { label: 'Dodaj', kind: 'primary', onClick: () => {
              const lines = ta.value.split('\n').map((l) => cleanStep(l)).filter(Boolean);
              if (!lines.length) { toast('Nic do dodania', { type: 'error' }); return false; }
              lines.forEach((l) => work.steps.push(blankStep(l)));
              touch(); paintSteps(); toast(`Dodano kroki: ${lines.length}`);
            } }],
          });
          setTimeout(() => ta._fit && ta._fit(), 50);
        } })));
  }

  /* ----- Pozostałe ----- */

  function extraCard() {
    const tagsIn = textInput({ value: work.tags.join(', '), label: 'Tagi', placeholder: 'np. ciasto, włoskie, szybkie', capitalize: 'none', onInput: (v) => { work.tags = v.split(',').map((t) => t.trim()).filter(Boolean); touch(); } });
    const kids = [
      h('h2', { class: 'card-title' }, icon('tag', 20), 'Dodatkowe'),
      field('Tagi (po przecinku)', tagsIn),
      field('Własne uwagi', textArea({ value: work.notes, label: 'Własne uwagi', rows: 3, placeholder: 'Twoje notatki do receptury', onInput: (v) => { work.notes = v; touch(); } })),
      field('Źródło', textInput({ value: work.source, label: 'Źródło', placeholder: 'np. książka, strona, od kogo', onInput: (v) => { work.source = v; touch(); } })),
      field('Adres strony (URL)', textInput({ value: work.sourceUrl, label: 'Adres URL źródła', placeholder: 'https://…', type: 'url', capitalize: 'none', inputmode: 'url', onInput: (v) => { work.sourceUrl = v; touch(); } })),
    ];
    if (!amateur()) {
      kids.push(switchEl(!!work.bakers, (v) => { work.bakers = v; touch(); paintSections(); }, 'Procenty piekarskie', 'Mąka = 100%, hydracja, sól, drożdże — pokaż i przelicz'));
      kids.push(field('Cena sprzedaży porcji (zł)', numInput({ value: work.salePrice, label: 'Cena sprzedaży', dec: 2, placeholder: 'do food costu', onInput: (v) => { work.salePrice = v; touch(); } })));
    }
    return h('section', { class: 'card stack' }, kids);
  }

  /* ----- Złożenie ----- */

  function renderAll() {
    form.replaceChildren(datalist, basics(), timesCard(), ingredientsCard(), stepsCard(), extraCard());
    paintSections(); paintSteps();
    autosizeAll(form);
  }

  function showBanner(kind, text, actions) {
    banner.replaceChildren(h('div', { class: 'banner ' + kind, role: 'status' }, h('div', { class: 'banner-text' }, ...text), h('div', { class: 'row wrap gap' }, actions)));
  }

  renderAll();

  /* ----- Szkic / import ----- */
  (async () => {
    try {
      if (isNew && query && query.get && query.get('import')) {
        const pend = await kv.get('draft:new-import');
        if (pend && pend.recipe) {
          work = normalizeRecipe(pend.recipe); issues = pend.issues || [];
          await kv.del('draft:new-import');
          baseline = '';
          renderAll(); touch();
          showBanner('warn', [h('strong', null, 'Sprawdź zaimportowaną recepturę'), issues.length ? h('ul', { class: 'plain small' }, issues.map((i) => h('li', null, i))) : h('span', { class: 'muted' }, 'Wszystko rozpoznane — przejrzyj i zapisz.')],
            [button('OK', { sm: true, onClick: () => banner.replaceChildren() })]);
          return;
        }
      }
      const d = await kv.get(draftKey);
      if (!d || !d.recipe) return;
      const differs = JSON.stringify(d.recipe) !== baseline;
      const meaningful = isNew ? (d.recipe.name || d.recipe.sections.some((x) => x.ingredients.some((i) => i.name)) || d.recipe.steps.length) : differs && d.savedAt > existing.updatedAt;
      if (!meaningful) { await kv.del(draftKey); return; }
      showBanner('info', [h('strong', null, 'Znaleziono niezapisany szkic'), h('span', { class: 'muted' }, `z ${fmtDateTime(d.savedAt)}`)], [
        button('Wznów', { sm: true, kind: 'primary', onClick: () => { work = normalizeRecipe(d.recipe); renderAll(); banner.replaceChildren(); touch(); } }),
        button('Odrzuć', { sm: true, kind: 'ghost', onClick: async () => { await kv.del(draftKey); banner.replaceChildren(); toast('Szkic odrzucony'); } }),
      ]);
    } catch (e) { console.error(e); }
  })();

  const flush = () => { if (isDirty()) saveDraft.flush(); };
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);

  return { el: s.el, destroy: () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); flush(); } };
}
