/* ==========================================================================
   views-tools.js — narzędzia kuchenne: przelicznik jednostek, temperatury
   mięs, czasy gotowania, zamienniki, solanki, zakwas, formy do pieczenia,
   „Co mam w lodówce?” i „Co dziś gotujemy?”.
   ========================================================================== */
import { h, icon, button, iconBtn, toast, field, numInput, selectEl, segmented, textInput, emptyState } from './ui.js';
import { navigate } from './router.js';
import { state, listRecipes, getRecipe, catName } from './recipes.js';
import { scaleRecipe } from './calculator.js';
import { pantryScore } from './kitchen.js';
import { startTimer } from './timers.js';
import { fmtNum, fmtAmount, norm, fmtMinutes } from './util.js';
import { qtyParts, recipeCard } from './components.js';
import { calcScreen, memo, col, result } from './calc-kit.js';
import {
  MASS_UNITS, VOL_UNITS, DENSITY, DONENESS, COOK_TIMES, SUBSTITUTES, BRINES, PAN_SHAPES, panArea, STARTER_RATIOS, TIPS,
} from './tools-data.js';

const c2f = (c) => c * 9 / 5 + 32;
const f2c = (f) => (f - 32) * 5 / 9;
const GAS = [[120, 0.5], [140, 1], [150, 2], [160, 3], [180, 4], [190, 5], [200, 6], [220, 7], [230, 8], [240, 9]];

/* ---------- Przelicznik jednostek ---------- */

export function unitsTool() {
  const { st, save, ready } = memo('units', { v: null, from: 'szkl', to: 'g', dens: 'Mąka pszenna', c: null, f: null });
  const holder = h('div', { class: 'stack' });
  const s = calcScreen('Przelicznik', holder);
  const ALL = [...MASS_UNITS.map(([k, l, f]) => [k, l, f, 'm']), ...VOL_UNITS.map(([k, l, f]) => [k, l, f, 'v'])];
  const find = (k) => ALL.find((u) => u[0] === k);

  function build() {
    const out = h('div', { class: 'results' });
    const calc = () => {
      const a = find(st.from), b = find(st.to);
      if (!(st.v > 0)) { out.replaceChildren(h('p', { class: 'muted pad' }, 'Wpisz ilość.')); return; }
      let res;
      let note = '';
      if (a[3] === b[3]) res = (st.v * a[2]) / b[2];
      else {
        const d = (DENSITY.find((x) => x[0] === st.dens) || DENSITY[0])[1];
        if (a[3] === 'v') res = (st.v * a[2] * d) / b[2];          // objętość → masa
        else res = (st.v * a[2]) / d / b[2];                         // masa → objętość
        note = `Dla: ${st.dens} (${fmtNum(d, 2)} g/ml)`;
      }
      out.replaceChildren(result(`${fmtNum(st.v, 3)} ${a[1]} =`, fmtNum(res, res >= 100 ? 0 : res >= 10 ? 1 : 2), b[1].replace(/\s*\(.*\)/, ''), 'total'),
        note ? h('p', { class: 'muted small' }, note) : null);
    };
    const crossing = () => find(st.from)[3] !== find(st.to)[3];
    const densWrap = h('div', { class: 'field-wrap' }, field('Składnik (gęstość)', selectEl(DENSITY.map(([n]) => n), st.dens, (v) => { st.dens = v; save(); calc(); })));
    densWrap.hidden = !crossing();
    const opts = ALL.map(([k, l]) => [k, l]);
    const tc = numInput({ value: st.c, label: 'Temperatura °C', dec: 1, onInput: (v) => { st.c = v; st.f = v == null ? null : Math.round(c2f(v) * 10) / 10; fIn.value = st.f == null ? '' : fmtNum(st.f, 1); save(); gas(); } });
    const fIn = numInput({ value: st.f, label: 'Temperatura °F', dec: 1, onInput: (v) => { st.f = v; st.c = v == null ? null : Math.round(f2c(v) * 10) / 10; tc.value = st.c == null ? '' : fmtNum(st.c, 1); save(); gas(); } });
    const gasOut = h('p', { class: 'muted small' });
    const gas = () => {
      if (st.c == null) { gasOut.textContent = ''; return; }
      const g = GAS.reduce((best, x) => (Math.abs(x[0] - st.c) < Math.abs(best[0] - st.c) ? x : best), GAS[0]);
      gasOut.textContent = Math.abs(g[0] - st.c) <= 12 ? `Piekarnik gazowy: ok. ${g[1] === 0.5 ? '½' : g[1]} (znamionowo ${g[0]} °C)` : '';
    };
    holder.replaceChildren(
      h('section', { class: 'card stack' },
        h('h2', { class: 'card-title' }, icon('scale', 20), 'Masa i objętość'),
        h('div', { class: 'row gap' },
          col(field('Ilość', numInput({ value: st.v, label: 'Ilość', dec: 3, onInput: (v) => { st.v = v; save(); calc(); } }))),
          col(field('Z', selectEl(opts, st.from, (v) => { st.from = v; densWrap.hidden = !crossing(); save(); calc(); })))),
        button('Zamień miejscami', { icon: 'swap', sm: true, kind: 'ghost', onClick: () => { [st.from, st.to] = [st.to, st.from]; save(); build(); } }),
        field('Na', selectEl(opts, st.to, (v) => { st.to = v; densWrap.hidden = !crossing(); save(); calc(); })),
        densWrap, out),
      h('section', { class: 'card stack' },
        h('h2', { class: 'card-title' }, icon('thermo', 20), 'Temperatura'),
        h('div', { class: 'row gap' }, col(field('°C', tc)), col(field('°F', fIn))), gasOut,
        h('div', { class: 'chips wrap' }, [100, 140, 160, 180, 200, 220, 250].map((c) => h('button', { type: 'button', class: 'chip', onClick: () => { st.c = c; st.f = Math.round(c2f(c)); save(); build(); } }, `${c} °C`)))));
    calc(); gas();
  }
  ready.then(build);
  build();
  return { el: s.el };
}

/* ---------- Temperatury mięs i ryb ---------- */

export function donenessTool() {
  const holder = h('div', { class: 'stack' });
  const s = calcScreen('Temperatury', holder);
  holder.append(h('div', { class: 'banner info' }, h('div', { class: 'banner-text' },
    h('strong', null, 'Wyjmij trochę wcześniej'), h('span', { class: 'muted' }, 'Mięso „dojdzie” o 3–5 °C podczas odpoczynku. Temperaturę mierz w najgrubszym miejscu, bez dotykania kości. Zalecenia bezpieczeństwa (USDA) są wyższe niż temperatura serwowania steków.'))));
  DONENESS.forEach((g) => holder.append(h('section', { class: 'card' }, h('h2', { class: 'card-title' }, icon('thermo', 20), g.group),
    h('div', { class: 'kv' }, g.rows.map(([name, a, b, note]) => h('div', { class: 'kv-row temp-row' },
      h('span', null, h('strong', null, name), note ? h('small', { class: 'muted sub-line' }, note) : null),
      h('span', { class: 'num temp-val' }, a === b ? `${a} °C` : `${a}–${b} °C`, h('small', { class: 'muted sub-line' }, a === b ? `${Math.round(c2f(a))} °F` : `${Math.round(c2f(a))}–${Math.round(c2f(b))} °F`))))))));
  return { el: s.el };
}

/* ---------- Czasy gotowania + ściągi ---------- */

export function timesTool() {
  const holder = h('div', { class: 'stack' });
  const s = calcScreen('Czasy gotowania', holder);
  holder.append(h('section', { class: 'card' }, h('h2', { class: 'card-title' }, icon('timer', 20), 'Orientacyjne czasy'),
    h('div', { class: 'kv' }, COOK_TIMES.map(([name, min, note, tm]) => h('div', { class: 'kv-row temp-row' },
      h('span', null, h('strong', null, name), note ? h('small', { class: 'muted sub-line' }, note) : null),
      h('span', { class: 'row gap' }, h('span', { class: 'num temp-val' }, fmtMinutes(min)),
        iconBtn('timer', `Minutnik: ${name}`, () => { startTimer(Math.round(tm * 60), name); toast(`Minutnik: ${fmtMinutes(tm)} — ${name}`); }, 'glassy')))))),
    h('section', { class: 'card' }, h('h2', { class: 'card-title' }, icon('bulb', 20), 'Ściąga'),
      h('div', { class: 'kv' }, TIPS.map(([t, d]) => h('div', { class: 'kv-row' }, h('span', null, h('strong', null, t), h('small', { class: 'muted sub-line' }, d)))))));
  return { el: s.el };
}

/* ---------- Zamienniki ---------- */

export function subsTool() {
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Czego brakuje? np. masło, jajko…', 'aria-label': 'Szukaj zamiennika', autocomplete: 'off', autocapitalize: 'off' });
  const list = h('div', { class: 'stack' });
  const s = calcScreen('Zamienniki', input, list);
  const paint = () => {
    const w = norm(input.value).split(/\s+/).filter(Boolean);
    const items = SUBSTITUTES.filter(([a, b, c]) => { const t = norm(a + ' ' + b + ' ' + c); return w.every((x) => t.includes(x)); });
    list.replaceChildren(...(items.length ? items.map(([a, b, c]) => h('div', { class: 'card sub-card' }, h('div', { class: 'sub-from' }, a), h('div', { class: 'sub-to' }, icon('swap', 18), h('span', null, b)), c ? h('p', { class: 'muted small' }, c) : null))
      : [emptyState('🔎', 'Brak zamiennika', 'Spróbuj innego słowa.')]));
  };
  input.addEventListener('input', paint);
  paint();
  return { el: s.el };
}

/* ---------- Solanki i sól ---------- */

export function brineTool() {
  const { st, save, ready } = memo('brine', { mode: 'brine', water: 1000, pct: 5, meat: null, dry: 1.2, veg: null });
  const holder = h('div', { class: 'stack' });
  const s = calcScreen('Sól i solanki', holder);
  function build() {
    const out = h('div', { class: 'results' });
    const calc = () => {
      if (st.mode === 'brine') {
        const salt = (st.water || 0) * (st.pct || 0) / 100;
        out.replaceChildren(h('div', { class: 'results-grid' }, result('Sól', fmtNum(salt, 1), 'g', 'big'), result('Woda', fmtAmount(st.water || 0), 'ml', 'big')),
          h('p', { class: 'muted small' }, `Solanka ${fmtNum(st.pct, 1)}% (sól wagowo do wody). Łyżka soli ≈ ${fmtNum(18, 0)} g, łyżeczka ≈ 6 g.${salt ? ` To ok. ${fmtNum(salt / 6, 1)} łyżeczki soli.` : ''}`));
      } else if (st.mode === 'dry') {
        const salt = (st.meat || 0) * (st.dry || 0) / 100;
        out.replaceChildren(h('div', { class: 'results-grid' }, result('Sól', fmtNum(salt, 1), 'g', 'big'), result('Mięso', fmtAmount(st.meat || 0), 'g', 'big')),
          h('p', { class: 'muted small' }, `Solenie na sucho ${fmtNum(st.dry, 2)}% wagi mięsa. Posól 1–24 h wcześniej (stek: 40 min lub przez noc), nie płucz.`));
      } else {
        const salt = (st.veg || 0) * 0.02;
        out.replaceChildren(h('div', { class: 'results-grid' }, result('Sól', fmtNum(salt, 1), 'g', 'big'), result('Warzywa', fmtAmount(st.veg || 0), 'g', 'big')),
          h('p', { class: 'muted small' }, 'Kiszenie kapusty/warzyw: 2% wagi warzyw (ok. 20 g soli na kg). Sól niejodowana.'));
      }
    };
    const seg = segmented([['brine', 'Solanka'], ['dry', 'Na sucho'], ['ferm', 'Kiszenie']], st.mode, (v) => { st.mode = v; save(); build(); }, { label: 'Rodzaj' });
    let fields;
    if (st.mode === 'brine') fields = [h('div', { class: 'row gap' }, col(field('Woda (ml)', numInput({ value: st.water, label: 'Woda w mililitrach', dec: 0, onInput: (v) => { st.water = v; save(); calc(); } }))), col(field('Sól (%)', numInput({ value: st.pct, label: 'Procent soli', dec: 1, onInput: (v) => { st.pct = v; save(); calc(); } })))),
      h('div', { class: 'field-label' }, 'Typowe solanki'),
      h('div', { class: 'brine-list' }, BRINES.map(([n, p, t, note]) => h('button', { type: 'button', class: 'brine-item', onClick: () => { st.pct = p; save(); build(); } }, h('strong', null, n), h('span', { class: 'muted small' }, `${p}% · ${t}${note ? ' — ' + note : ''}`))))];
    else if (st.mode === 'dry') fields = [h('div', { class: 'row gap' }, col(field('Waga mięsa (g)', numInput({ value: st.meat, label: 'Waga mięsa', dec: 0, onInput: (v) => { st.meat = v; save(); calc(); } }))), col(field('Sól (%)', numInput({ value: st.dry, label: 'Procent soli', dec: 2, onInput: (v) => { st.dry = v; save(); calc(); } })))),
      h('div', { class: 'chips wrap' }, [0.8, 1, 1.2, 1.5].map((p) => h('button', { type: 'button', class: 'chip' + (st.dry === p ? ' on' : ''), onClick: () => { st.dry = p; save(); build(); } }, `${String(p).replace('.', ',')}%`)))];
    else fields = [field('Waga warzyw (g)', numInput({ value: st.veg, label: 'Waga warzyw', dec: 0, onInput: (v) => { st.veg = v; save(); calc(); } }))];
    holder.replaceChildren(h('section', { class: 'card stack' }, seg, ...fields), out);
    calc();
  }
  ready.then(build);
  build();
  return { el: s.el };
}

/* ---------- Zakwas ---------- */

export function starterTool() {
  const { st, save, ready } = memo('starter', { mode: 'have', starter: 20, target: 300, ratio: '1:5:5' });
  const holder = h('div', { class: 'stack' });
  const s = calcScreen('Zakwas', holder);
  function build() {
    const out = h('div', { class: 'results' });
    const r = STARTER_RATIOS.find((x) => x[0] === st.ratio) || STARTER_RATIOS[1];
    const calc = () => {
      let starter, flour, water;
      if (st.mode === 'have') { starter = st.starter || 0; flour = starter * r[2]; water = starter * r[3]; }
      else { const parts = r[1] + r[2] + r[3]; starter = (st.target || 0) * r[1] / parts; flour = (st.target || 0) * r[2] / parts; water = (st.target || 0) * r[3] / parts; }
      out.replaceChildren(h('div', { class: 'results-grid' }, result('Zakwas', fmtNum(starter, 1), 'g'), result('Mąka', fmtNum(flour, 1), 'g'), result('Woda', fmtNum(water, 1), 'g'), result('Razem', fmtNum(starter + flour + water, 1), 'g', 'total')),
        h('p', { class: 'muted small' }, 'Nawodnienie 100% (mąka : woda = 1 : 1). Im większa proporcja, tym wolniej zakwas dojrzewa: 1:1:1 ok. 4 h, 1:5:5 ok. 8–12 h, 1:10:10 ok. 12–16 h w temp. pokojowej.'));
    };
    holder.replaceChildren(h('section', { class: 'card stack' },
      segmented([['have', 'Mam zakwas'], ['want', 'Chcę tyle zakwasu']], st.mode, (v) => { st.mode = v; save(); build(); }, { label: 'Tryb' }),
      st.mode === 'have' ? field('Zakwas, który mam (g)', numInput({ value: st.starter, label: 'Zakwas w gramach', dec: 1, onInput: (v) => { st.starter = v; save(); calc(); } }))
        : field('Docelowa ilość razem (g)', numInput({ value: st.target, label: 'Docelowa ilość', dec: 0, onInput: (v) => { st.target = v; save(); calc(); } })),
      h('div', { class: 'field-label' }, 'Proporcja (zakwas : mąka : woda)'),
      h('div', { class: 'chips wrap' }, STARTER_RATIOS.map(([k]) => h('button', { type: 'button', class: 'chip' + (st.ratio === k ? ' on' : ''), onClick: () => { st.ratio = k; save(); build(); } }, k)))), out);
    calc();
  }
  ready.then(build);
  build();
  return { el: s.el };
}

/* ---------- Formy do pieczenia ---------- */

export function panTool() {
  const { st, save, ready } = memo('pan', { s1: 'round', a1: 24, b1: null, s2: 'rect', a2: 30, b2: 20, id: '' });
  const holder = h('div', { class: 'stack' });
  const s = calcScreen('Forma do pieczenia', holder);
  const dims = (shape, key, label) => h('div', { class: 'row gap' },
    col(field(shape === 'round' ? 'Średnica (cm)' : shape === 'square' ? 'Bok (cm)' : 'Bok a (cm)', numInput({ value: st['a' + key], label: label + ' — wymiar', dec: 1, onInput: (v) => { st['a' + key] = v; save(); calc(); } }))),
    shape === 'rect' ? col(field('Bok b (cm)', numInput({ value: st['b' + key], label: label + ' — drugi bok', dec: 1, onInput: (v) => { st['b' + key] = v; save(); calc(); } }))) : null);
  const out = h('div', { class: 'stack' });
  function calc() {
    const A1 = panArea(st.s1, st.a1, st.b1), A2 = panArea(st.s2, st.a2, st.b2);
    if (!(A1 > 0 && A2 > 0)) { out.replaceChildren(h('p', { class: 'muted pad' }, 'Podaj wymiary obu form.')); return; }
    const k = A2 / A1;
    const kids = [result('Współczynnik', '×' + fmtNum(k, 2), '', 'total'),
      h('p', { class: 'muted small' }, `Powierzchnia: ${fmtNum(A1, 0)} cm² → ${fmtNum(A2, 0)} cm². ${k > 1.15 ? 'Ciasto będzie cieńsze — skróć pieczenie o ok. 10–20%.' : k < 0.87 ? 'Ciasto będzie grubsze — wydłuż pieczenie o ok. 10–25% i obniż temperaturę o 10 °C.' : 'Podobna grubość — czas pieczenia bez zmian.'}`)];
    const recs = listRecipes().filter((r) => r.category === 'cat-desery' || r.category === 'cat-pieczywo').sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    if (recs.length) {
      if (!recs.find((r) => r.id === st.id)) st.id = recs[0].id;
      const r = getRecipe(st.id);
      const sc = scaleRecipe(r, k);
      kids.push(h('section', { class: 'card stack' }, field('Receptura (wypieki)', selectEl(recs.map((x) => [x.id, x.name]), st.id, (v) => { st.id = v; save(); calc(); })),
        ...sc.sections.map((sec) => h('div', { class: 'ing-section' }, sec.name ? h('div', { class: 'tape' }, sec.name) : null,
          h('ul', { class: 'ing-list' }, sec.ingredients.filter((i) => i.name).map((i) => { const q = qtyParts(i); return h('li', { class: 'ing' }, h('span', { class: 'ing-name' }, i.name), h('span', { class: 'ing-qty' }, h('span', { class: 'amt num' }, q.num), h('span', { class: 'unit' }, q.unit))); })))),
        button('Otwórz recepturę', { icon: 'book', kind: 'ghost', onClick: () => navigate('/recipe/' + r.id) })));
    }
    out.replaceChildren(...kids);
  }
  function build() {
    holder.replaceChildren(
      h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'Forma z receptury'),
        field('Kształt', selectEl(PAN_SHAPES, st.s1, (v) => { st.s1 = v; save(); build(); })), dims(st.s1, '1', 'Forma z receptury')),
      h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'Twoja forma'),
        field('Kształt', selectEl(PAN_SHAPES, st.s2, (v) => { st.s2 = v; save(); build(); })), dims(st.s2, '2', 'Twoja forma')), out);
    calc();
  }
  ready.then(build);
  build();
  return { el: s.el };
}

/* ---------- Co mam w lodówce? ---------- */

const PANTRY_IDEAS = ['jajka', 'makaron', 'ser', 'cebula', 'ziemniaki', 'kurczak', 'pomidory', 'czosnek', 'śmietana', 'mąka', 'ryż', 'mięso mielone', 'papryka', 'mleko'];

export function pantryTool() {
  const { st, save, ready } = memo('pantry', { have: [] });
  const input = textInput({ value: '', label: 'Dodaj składnik', placeholder: 'np. jajka, makaron…', capitalize: 'none' });
  const chips = h('div', { class: 'chips wrap' });
  const results = h('div', { class: 'stack' });
  const s = calcScreen('Co mam w lodówce?', h('section', { class: 'card stack' }, h('div', { class: 'row gap' }, h('div', { class: 'grow' }, input), button('Dodaj', { kind: 'primary', onClick: () => add(input.value) })),
    h('div', { class: 'field-label' }, 'Szybko'), h('div', { class: 'chips wrap' }, PANTRY_IDEAS.map((x) => h('button', { type: 'button', class: 'chip', onClick: () => add(x) }, x))),
    h('div', { class: 'field-label' }, 'Mam'), chips), results);
  function add(v) {
    v.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).forEach((x) => { if (!st.have.includes(x)) st.have.push(x); });
    input.value = ''; save(); paint();
  }
  function paint() {
    chips.replaceChildren(...(st.have.length ? st.have.map((x) => h('button', { type: 'button', class: 'chip on', 'aria-label': `Usuń ${x}`, onClick: () => { st.have = st.have.filter((y) => y !== x); save(); paint(); } }, x, icon('x', 14)))
      : [h('span', { class: 'muted small' }, 'Dodaj to, co masz w domu — pokażę receptury, które możesz zrobić.')]));
    if (!st.have.length) { results.replaceChildren(); return; }
    const ranked = listRecipes().map((r) => ({ r, m: pantryScore(r, st.have) })).filter((x) => x.m.have.length > 0).sort((a, b) => b.m.score - a.m.score || a.m.missing.length - b.m.missing.length).slice(0, 15);
    results.replaceChildren(...(ranked.length ? [h('p', { class: 'muted counter' }, `Pasujące receptury: ${ranked.length}`), ...ranked.map(({ r, m }) => h('div', { class: 'pantry-item' }, recipeCard(r),
      h('div', { class: 'pantry-meta' }, h('span', { class: 'pill' }, `${Math.round(m.score * 100)}% składników`), m.missing.length ? h('span', { class: 'muted small' }, `Brakuje: ${m.missing.slice(0, 4).map((i) => i.name.replace(/\s*\(.*\)/, '')).join(', ')}${m.missing.length > 4 ? '…' : ''}`) : h('span', { class: 'small ok' }, 'Masz wszystko!'))))]
      : [emptyState('🤔', 'Nic nie pasuje', 'Dodaj więcej składników albo importuj nowe receptury.', button('Szukaj w sieci', { icon: 'globe', onClick: () => navigate('/search') }))]));
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(input.value); } });
  ready.then(paint);
  paint();
  return { el: s.el };
}

/* ---------- Co dziś gotujemy? ---------- */

export function randomTool() {
  const { st, save, ready } = memo('random', { max: 0, cat: '' });
  const holder = h('div', { class: 'stack' });
  const s = calcScreen('Co dziś gotujemy?', holder);
  let pick = null;
  function roll() {
    let list = listRecipes();
    if (st.cat) list = list.filter((r) => r.category === st.cat);
    if (st.max) list = list.filter((r) => { const t = (r.prepTime || 0) + (r.cookTime || 0); return t > 0 && t <= st.max; });
    const pool = list.filter((r) => !pick || r.id !== pick.id);
    pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : (list[0] || null);
    paint();
  }
  function paint() {
    const used = new Set(listRecipes().map((r) => r.category));
    holder.replaceChildren(
      h('section', { class: 'card stack' },
        h('div', { class: 'row gap' }, col(field('Kategoria', selectEl([['', 'Dowolna'], ...state.categories.filter((c) => used.has(c.id)).map((c) => [c.id, `${c.icon} ${c.name}`])], st.cat, (v) => { st.cat = v; save(); roll(); }))),
          col(field('Czas czynny', selectEl([[0, 'Dowolny'], [15, 'do 15 min'], [30, 'do 30 min'], [60, 'do 1 h']], st.max, (v) => { st.max = +v; save(); roll(); }))))),
      pick ? h('div', { class: 'stack' }, recipeCard(pick),
        h('div', { class: 'row gap wrap' }, button('Prowadź mnie', { kind: 'primary', icon: 'chef', onClick: () => navigate('/guide/' + pick.id) }), button('Podgląd', { onClick: () => navigate('/recipe/' + pick.id) }), button('Inny', { icon: 'shuffle', kind: 'ghost', onClick: roll })))
        : emptyState('🤷', 'Brak pasujących receptur', 'Zmień filtry.'));
  }
  ready.then(roll);
  roll();
  return { el: s.el };
}

export const TOOLS = { units: unitsTool, doneness: donenessTool, times: timesTool, subs: subsTool, brine: brineTool, starter: starterTool, pan: panTool, pantry: pantryTool, random: randomTool };
void catName;
