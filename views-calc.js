/* ==========================================================================
   views-calc.js — kalkulatory: pizza (procenty piekarskie), procenty,
   przeliczanie receptury, koszt receptury (food cost). Wartości wpisane
   w kalkulatorach zapamiętują się (calc:*).
   ========================================================================== */
import {
  h, icon, screen, button, iconBtn, toast, field, numInput, selectEl, segmented, emptyState,
} from './ui.js';
import { navigate, goBack } from './router.js';
import {
  state, listRecipes, getRecipe, saveRecipe, blankRecipe, blankIngredient, blankSection, blankStep, getSetting, allIngredients,
} from './recipes.js';
import {
  pizzaCalc, yeastSuggestion, YEAST_TYPES, scaleRecipe, factorFromServings, factorFromYield, factorFromIngredient, effectiveYield, recipeCost, priceForFoodCost,
} from './calculator.js';
import { fmtAmount, fmtNum, fmtMoney, debounce } from './util.js';
import { qtyParts } from './components.js';
import { addItems, openAddToShopping } from './shopping.js';
import { calcScreen, memo, col, result } from './calc-kit.js';
import { TOOLS } from './views-tools.js';
import { openTimersSheet } from './timers.js';

const GROUPS = [
  ['Kalkulatory', [
    ['pizza', 'Pizza i ciasto', 'Kulki, hydracja, sól, drożdże → mąka, woda, sól, drożdże', 'pizza'],
    ['percent', 'Procenty', 'Ile to X%, jaki to procent, zmiana, dodaj/odejmij', 'percent'],
    ['scale', 'Przeliczanie receptury', 'Na inną liczbę porcji, wydajność lub ilość składnika', 'swap'],
    ['cost', 'Koszt receptury', 'Ceny składników, koszt porcji, food cost i cena sprzedaży', 'coins'],
    ['brine', 'Sól i solanki', 'Solanka %, sól na sucho, kiszenie', 'drop'],
    ['starter', 'Zakwas', 'Karmienie zakwasu: zakwas · mąka · woda', 'wave'],
    ['pan', 'Forma do pieczenia', 'Przelicz ciasto na inną formę', 'ruler'],
  ]],
  ['Przeliczniki i ściągi', [
    ['units', 'Przelicznik jednostek', 'Szklanki, łyżki, uncje, funty, °F — także g ↔ ml dla składników', 'scale'],
    ['doneness', 'Temperatury mięs i ryb', 'Stopnie wysmażenia, bezpieczne temperatury', 'thermo'],
    ['times', 'Czasy gotowania', 'Jajka, makarony, kasze, warzywa — z minutnikiem', 'timer'],
    ['subs', 'Zamienniki składników', 'Brakuje masła, jajka, drożdży? Znajdź zamiennik', 'swap'],
  ]],
  ['Pomysły', [
    ['pantry', 'Co mam w lodówce?', 'Wpisz składniki — pokażę pasujące receptury', 'fridge'],
    ['random', 'Co dziś gotujemy?', 'Losuj przepis według kategorii i czasu', 'shuffle'],
  ]],
];

export function calcView({ kind }) {
  if (!kind) return hub();
  if (kind === 'pizza') return pizzaCalculator();
  if (kind === 'percent') return percentCalculator();
  if (kind === 'scale') return scaleCalculator();
  if (kind === 'cost') return costCalculator();
  if (TOOLS[kind]) return TOOLS[kind]();
  return hub();
}

function hub() {
  const s = screen({ title: 'Kalkulatory', cls: 'calc-hub', right: iconBtn('timer', 'Minutniki', () => openTimersSheet()) },
    ...GROUPS.flatMap(([title, items]) => [
      h('h3', { class: 'group-title' }, title),
      h('div', { class: 'cards' }, items.map(([k, t, d, ico]) =>
        h('a', { class: 'bigcard', href: '#/calc/' + k, onClick: (e) => { e.preventDefault(); navigate('/calc/' + k); } },
          h('span', { class: 'bigcard-ico' }, icon(ico, 28)),
          h('span', { class: 'bigcard-text' }, h('strong', null, t), h('span', { class: 'muted' }, d)),
          icon('right', 20)))),
    ]));
  return { el: s.el };
}

/* ---------- Pizza ---------- */

function pizzaCalculator() {
  const { st, save, ready } = memo('pizza', { balls: 4, ballWeight: 250, hydration: 65, salt: 3, oil: 0, yeast: 0.2, yeastType: 'fresh', temp: 20, hours: 24 });
  const out = h('div', { class: 'results' });
  const form = h('div', { class: 'stack' });
  const s = calcScreen('Pizza i ciasto', form, out);

  function compute() {
    const r = pizzaCalc({ balls: st.balls || 0, ballWeight: st.ballWeight || 0, hydration: st.hydration || 0, salt: st.salt || 0, oil: st.oil || 0, yeast: st.yeast || 0 });
    return r;
  }

  function paintOut() {
    const r = compute();
    const ok = r.total > 0 && Number.isFinite(r.flour);
    if (!ok) { out.replaceChildren(h('p', { class: 'muted pad' }, 'Wpisz liczbę kulek i wagę kulki.')); return; }
    const yl = YEAST_TYPES[st.yeastType].label;
    out.replaceChildren(
      h('div', { class: 'results-grid' },
        result('Mąka', fmtAmount(r.flour), 'g', 'big'),
        result('Woda', fmtAmount(r.water), 'g', 'big'),
        result('Sól', fmtAmount(r.salt), 'g'),
        result('Drożdże ' + yl, fmtNum(r.yeast, 2), 'g'),
        st.oil > 0 ? result('Oliwa', fmtAmount(r.oil), 'g') : null,
        result('Masa całkowita', fmtAmount(r.total), 'g', 'total')),
      h('p', { class: 'muted small' }, `${st.balls} × ${fmtAmount(st.ballWeight)} g · suma procentów ${fmtNum(r.pctSum, 2)}% (mąka = 100%)`),
      h('div', { class: 'row wrap gap' },
        button('Zapisz jako recepturę', { icon: 'plus', kind: 'primary', onClick: () => saveAsRecipe(r) }),
        button('Do zakupów', { icon: 'cart', onClick: async () => {
          await addItems([
            { name: 'Mąka pszenna', amount: Math.round(r.flour), unit: 'g' }, { name: 'Sól', amount: Math.round(r.salt * 10) / 10, unit: 'g' },
            { name: `Drożdże ${yl}`, amount: Math.round(r.yeast * 100) / 100, unit: 'g' },
            ...(r.oil > 0 ? [{ name: 'Oliwa', amount: Math.round(r.oil), unit: 'g' }] : []),
          ]);
          toast('Dodano do zakupów', { action: { label: 'Pokaż', fn: () => navigate('/shopping') } });
        } })));
  }

  async function saveAsRecipe(r) {
    const I = (name, amount, unit, extra = {}) => blankIngredient({ name, amount, unit, ...extra });
    const r1 = (v) => Math.round(v * 10) / 10;
    const ings = [I('Mąka pszenna', r1(r.flour), 'g', { flour: true, percent: 100 }), I('Woda', r1(r.water), 'g', { percent: st.hydration }), I('Sól', r1(r.salt), 'g', { percent: st.salt })];
    if (st.oil > 0) ings.push(I('Oliwa', r1(r.oil), 'g', { percent: st.oil }));
    ings.push(I(`Drożdże ${YEAST_TYPES[st.yeastType].label}`, Math.round(r.yeast * 100) / 100, 'g', { percent: st.yeast }));
    const sec = blankSection('CIASTO'); sec.ingredients = ings;
    const rec = blankRecipe({
      name: `Ciasto na pizzę (${st.balls} × ${fmtAmount(st.ballWeight)} g)`, category: 'cat-pizza', servings: st.balls, yieldAmount: Math.round(r.total), yieldUnit: 'g',
      fermentTime: Math.round((st.hours || 0) * 60), temperature: `fermentacja w ${st.temp} °C`, bakers: true, sections: [sec],
      description: `Hydracja ${st.hydration}%, sól ${st.salt}%${st.oil ? `, oliwa ${st.oil}%` : ''}, drożdże ${st.yeast}%.`, tags: ['ciasto', 'kalkulator'],
      steps: [blankStep('Rozpuść sól w wodzie, dodaj drożdże.'), blankStep('Dodaj mąkę i wyrabiaj do gładkiego, elastycznego ciasta.'),
        blankStep(`Podziel na ${st.balls} kulek po ${fmtAmount(st.ballWeight)} g.`), blankStep(`Fermentuj ok. ${fmtNum(st.hours, 1)} h w ${st.temp} °C.`)],
    });
    const saved = await saveRecipe(rec);
    toast('Zapisano recepturę', { action: { label: 'Otwórz', fn: () => navigate('/recipe/' + saved.id) } });
  }

  function build() {
    const upd = (k) => (v) => { st[k] = v; save(); paintOut(); };
    const chips = (key, vals, suffix = '') => h('div', { class: 'chips wrap' }, vals.map((v) => h('button', { type: 'button', class: 'chip' + (st[key] === v ? ' on' : ''),
      onClick: () => { st[key] = v; save(); build(); paintOut(); } }, String(v).replace('.', ',') + suffix)));
    const sug = yeastSuggestion(st.temp, st.hours);
    const factor = YEAST_TYPES[st.yeastType].f;
    form.replaceChildren(
      h('section', { class: 'card stack' },
        h('div', { class: 'row gap' }, col(field('Liczba kulek', numInput({ value: st.balls, label: 'Liczba kulek', dec: 0, onInput: upd('balls') }))), col(field('Waga kulki (g)', numInput({ value: st.ballWeight, label: 'Waga kulki', dec: 1, onInput: upd('ballWeight') })))),
        chips('ballWeight', [200, 250, 280, 320, 350], ' g')),
      h('section', { class: 'card stack' },
        h('div', { class: 'row gap' }, col(field('Hydracja %', numInput({ value: st.hydration, label: 'Hydracja', dec: 1, onInput: upd('hydration') }))), col(field('Sól %', numInput({ value: st.salt, label: 'Sól', dec: 2, onInput: upd('salt') })))),
        chips('hydration', [60, 62, 65, 70, 75], '%'),
        field('Oliwa % (opcjonalnie)', numInput({ value: st.oil, label: 'Oliwa', dec: 2, onInput: upd('oil') }))),
      h('section', { class: 'card stack' },
        h('h2', { class: 'card-title' }, icon('thermo', 20), 'Drożdże i fermentacja'),
        h('div', { class: 'row gap' }, col(field('Temperatura (°C)', numInput({ value: st.temp, label: 'Temperatura fermentacji', dec: 1, onInput: (v) => { st.temp = v; save(); build(); paintOut(); } }))),
          col(field('Czas (godz.)', numInput({ value: st.hours, label: 'Czas fermentacji w godzinach', dec: 1, onInput: (v) => { st.hours = v; save(); build(); paintOut(); } })))),
        h('div', { class: 'row gap' },
          col(field('Rodzaj drożdży', selectEl(Object.entries(YEAST_TYPES).map(([k, v]) => [k, v.label]), st.yeastType, (v) => { st.yeastType = v; save(); build(); paintOut(); }))),
          col(field('Drożdże %', numInput({ value: st.yeast, label: 'Drożdże procent', dec: 2, onInput: upd('yeast') })))),
        sug != null ? h('div', { class: 'suggest' },
          h('span', null, `Orientacyjnie dla ${fmtNum(st.temp, 1)} °C i ${fmtNum(st.hours, 1)} h: `, h('strong', { class: 'num' }, fmtNum(sug * factor, 2) + '%'), ` (${YEAST_TYPES[st.yeastType].label})`),
          button('Użyj', { sm: true, onClick: () => { st.yeast = Math.round(sug * factor * 100) / 100; save(); build(); paintOut(); } })) : null,
        h('p', { class: 'muted small' }, 'To tylko wskazówka — mąka, woda i temperatura ciasta zmieniają tempo fermentacji. Dostosuj do swojego procesu.')));
  }

  ready.then(() => { build(); paintOut(); });
  build(); paintOut();
  return { el: s.el };
}

/* ---------- Procenty ---------- */

function percentCalculator() {
  const { st, save, ready } = memo('percent', { mode: 'of', a: null, b: null });
  const holder = h('div', { class: 'stack' });
  const seg = h('div');
  const s = calcScreen('Procenty', seg, holder);
  const MODES = [['of', 'X% z Y'], ['what', 'Ile %'], ['chg', 'Zmiana'], ['add', '± %']];
  const fm = (v) => fmtNum(v, 4);

  function build() {
    seg.replaceChildren(segmented(MODES, st.mode, (v) => { st.mode = v; save(); build(); }, { label: 'Rodzaj obliczenia' }));
    const out = h('div', { class: 'results' });
    const calc = () => {
      const a = st.a, b = st.b;
      let res = null, text = '';
      if (a != null && b != null) {
        if (st.mode === 'of') { res = (a / 100) * b; text = `${fm(a)}% z ${fm(b)}`; }
        else if (st.mode === 'what') { if (b !== 0) { res = (a / b) * 100; text = `${fm(a)} z ${fm(b)}`; } }
        else if (st.mode === 'chg') { if (a !== 0) { res = ((b - a) / Math.abs(a)) * 100; text = `z ${fm(a)} do ${fm(b)}`; } }
        else { res = a * (1 + b / 100); text = `${fm(a)} ${b >= 0 ? '+' : '−'} ${fm(Math.abs(b))}%`; }
      }
      out.replaceChildren(res == null ? h('p', { class: 'muted pad' }, 'Wpisz obie wartości.') :
        h('div', { class: 'results-grid' }, result(text, fm(res), st.mode === 'what' || st.mode === 'chg' ? '%' : '', 'big total')));
    };
    const labels = {
      of: ['Procent (%)', 'Z liczby'], what: ['Ta liczba', 'Z liczby'], chg: ['Wartość początkowa', 'Wartość końcowa'], add: ['Wartość', 'Dodaj / odejmij (%)'],
    }[st.mode];
    holder.replaceChildren(
      h('section', { class: 'card stack' },
        h('div', { class: 'row gap' },
          col(field(labels[0], numInput({ value: st.a, label: labels[0], dec: 4, onInput: (v) => { st.a = v; save(); calc(); } }))),
          col(field(labels[1], numInput({ value: st.b, label: labels[1], dec: 4, onInput: (v) => { st.b = v; save(); calc(); } })))),
        st.mode === 'add' ? h('p', { class: 'muted small' }, 'Ujemny procent odejmuje (np. −10 to rabat 10%).') : null),
      out);
    calc();
  }
  ready.then(build);
  build();
  return { el: s.el };
}

/* ---------- Wybór receptury ---------- */

function recipeSelect(st, key, onChange) {
  const list = listRecipes().sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  if (!list.find((r) => r.id === st[key])) st[key] = list[0] ? list[0].id : '';
  return selectEl(list.map((r) => [r.id, r.name]), st[key], (v) => { st[key] = v; onChange(v); }, { label: 'Receptura' });
}

/* ---------- Przeliczanie receptury ---------- */

function scaleCalculator() {
  const { st, save, ready } = memo('scale', { id: '', mode: 'servings', servings: null, yAmt: null, yUnit: 'g', ingId: '', ingAmt: null, ingUnit: 'g' });
  const holder = h('div', { class: 'stack' });
  const s = calcScreen('Przeliczanie receptury', holder);

  function build() {
    if (!state.recipes.size) { holder.replaceChildren(emptyState('📒', 'Brak receptur', 'Dodaj recepturę, żeby ją przeliczyć.', button('Nowa receptura', { kind: 'primary', onClick: () => navigate('/new') }))); return; }
    const sel = recipeSelect(st, 'id', () => { st.servings = st.yAmt = st.ingAmt = null; st.ingId = ''; save(); build(); });
    const r = getRecipe(st.id);
    const y = effectiveYield(r);
    const ings = allIngredients(r).filter((i) => i.name && i.amount > 0 && i.unit !== '%');
    if (!ings.find((i) => i.id === st.ingId)) { st.ingId = ings[0] ? ings[0].id : ''; st.ingUnit = ings[0] ? ings[0].unit : 'g'; }
    let k = null;
    if (st.mode === 'servings') k = factorFromServings(r, st.servings);
    else if (st.mode === 'yield') k = factorFromYield(r, st.yAmt, st.yUnit);
    else { const ing = ings.find((i) => i.id === st.ingId); k = ing ? factorFromIngredient(ing, st.ingAmt, st.ingUnit) : null; }
    const out = h('div', { class: 'stack' });
    const paintOut = () => {
      let kk = null;
      if (st.mode === 'servings') kk = factorFromServings(r, st.servings);
      else if (st.mode === 'yield') kk = factorFromYield(r, st.yAmt, st.yUnit);
      else { const ing = ings.find((i) => i.id === st.ingId); kk = ing ? factorFromIngredient(ing, st.ingAmt, st.ingUnit) : null; }
      if (!kk) { out.replaceChildren(h('p', { class: 'muted pad' }, 'Wpisz wartość docelową.')); return; }
      const sc = scaleRecipe(r, kk);
      out.replaceChildren(
        result('Współczynnik', '×' + fmtNum(kk, 3), '', 'total'),
        h('div', { class: 'card' }, sc.sections.map((sec) => h('div', { class: 'ing-section' }, sec.name ? h('div', { class: 'tape' }, sec.name) : null,
          h('ul', { class: 'ing-list' }, sec.ingredients.filter((i) => i.name).map((i) => { const q = qtyParts(i); return h('li', { class: 'ing' }, h('span', { class: 'ing-name' }, i.name), h('span', { class: 'ing-qty' }, h('span', { class: 'amt num' }, q.num), h('span', { class: 'unit' }, q.unit))); }))))),
        h('div', { class: 'row wrap gap' },
          button('Do zakupów', { icon: 'cart', onClick: () => openAddToShopping(r, kk) }),
          button('Otwórz recepturę', { icon: 'book', kind: 'ghost', onClick: () => navigate('/recipe/' + r.id) })));
    };
    const inputs = [];
    if (st.mode === 'servings') inputs.push(field('Liczba porcji', numInput({ value: st.servings, label: 'Liczba porcji', dec: 1, placeholder: `teraz ${r.servings || '?'}`, onInput: (v) => { st.servings = v; save(); paintOut(); } })));
    else if (st.mode === 'yield') {
      inputs.push(h('div', { class: 'row gap' }, col(field('Wydajność', numInput({ value: st.yAmt, label: 'Wydajność', onInput: (v) => { st.yAmt = v; save(); paintOut(); } }))),
        col(field('Jednostka', selectEl(['g', 'kg', 'ml', 'l', 'szt.', 'porcja'], st.yUnit, (v) => { st.yUnit = v; save(); paintOut(); })))));
      inputs.push(h('p', { class: 'muted small' }, y ? `Obecnie: ${fmtAmount(y.amount)} ${y.unit}${y.computed ? ' (suma składników)' : ''}` : 'Ta receptura nie ma wydajności.'));
    } else if (ings.length) {
      inputs.push(field('Składnik', selectEl(ings.map((i) => [i.id, `${i.name} (${fmtAmount(i.amount)} ${i.unit})`]), st.ingId, (v) => { st.ingId = v; st.ingUnit = ings.find((i) => i.id === v).unit; save(); build(); })));
      inputs.push(h('div', { class: 'row gap' }, col(field('Docelowa ilość', numInput({ value: st.ingAmt, label: 'Docelowa ilość', onInput: (v) => { st.ingAmt = v; save(); paintOut(); } }))),
        col(field('Jednostka', selectEl(['g', 'kg', 'ml', 'l', 'szt.', 'łyżka', 'łyżeczka'], st.ingUnit, (v) => { st.ingUnit = v; save(); paintOut(); })))));
    }
    void k;
    holder.replaceChildren(
      h('section', { class: 'card stack' }, field('Receptura', sel),
        segmented([['servings', 'Porcje'], ['yield', 'Wydajność'], ['ingredient', 'Składnik']], st.mode, (v) => { st.mode = v; save(); build(); }, { label: 'Przelicz według' }), ...inputs),
      out);
    paintOut();
  }
  ready.then(build);
  build();
  return { el: s.el };
}

/* ---------- Koszt receptury ---------- */

function costCalculator() {
  const { st, save, ready } = memo('cost', { id: '', target: 30 });
  const holder = h('div', { class: 'stack' });
  const s = calcScreen('Koszt receptury', holder);
  const cur$ = () => getSetting('currency') || 'zł';

  function build() {
    if (!state.recipes.size) { holder.replaceChildren(emptyState('📒', 'Brak receptur', 'Dodaj recepturę, żeby policzyć jej koszt.', button('Nowa receptura', { kind: 'primary', onClick: () => navigate('/new') }))); return; }
    const sel = recipeSelect(st, 'id', () => { save(); build(); });
    const base = getRecipe(st.id);
    // Praca na kopii — zapis dopiero po kliknięciu „Zapisz w recepturze”.
    const r = JSON.parse(JSON.stringify(base));
    const ings = allIngredients(r).filter((i) => i.name);
    const sum = h('div', { class: 'results' });
    const paintSum = () => {
      const c = recipeCost(r, 1);
      const sugg = c.perPortion > 0 ? priceForFoodCost(c.perPortion, st.target) : null;
      sum.replaceChildren(h('div', { class: 'results-grid' },
        result('Koszt receptury', fmtMoney(c.total, cur$()), '', 'big'),
        result('Koszt porcji', fmtMoney(c.perPortion, cur$()), '', 'big'),
        result('Cena sprzedaży', r.salePrice > 0 ? fmtMoney(r.salePrice, cur$()) : '—'),
        result('Food cost', c.foodCostPct != null ? fmtNum(c.foodCostPct, 1) : '—', c.foodCostPct != null ? '%' : '', c.foodCostPct > 35 ? 'warn' : '')),
        sugg ? h('p', { class: 'muted' }, `Cena porcji dla food cost ${fmtNum(st.target, 1)}%: `, h('strong', { class: 'num' }, fmtMoney(sugg, cur$()))) : null,
        c.missing ? h('p', { class: 'muted small' }, `Składników bez ceny lub zgodnej jednostki: ${c.missing}`) : null);
    };
    const rows = ings.map((i) => {
      const pkg = h('div', { class: 'row gap', hidden: i.priceUnit !== 'opak.' });
      const buildPkg = () => {
        pkg.hidden = i.priceUnit !== 'opak.';
        pkg.replaceChildren(col(field('Waga opakowania', numInput({ value: i.packageWeight, label: 'Waga opakowania', onInput: (v) => { i.packageWeight = v; paintSum(); } }))),
          col(field('Jednostka', selectEl(['g', 'ml', 'szt.'], i.packageUnit || 'g', (v) => { i.packageUnit = v; paintSum(); }))));
      };
      buildPkg();
      return h('div', { class: 'price-row' },
        h('div', { class: 'price-name' }, i.name, h('small', { class: 'muted num' }, i.amount != null ? ` ${fmtAmount(i.amount)} ${i.unit}` : '')),
        h('div', { class: 'row gap' },
          col(numInput({ value: i.price, label: `Cena: ${i.name}`, placeholder: 'cena', dec: 2, onInput: (v) => { i.price = v; paintSum(); } })),
          col(selectEl([['kg', `${cur$()}/kg`], ['l', `${cur$()}/l`], ['g', `${cur$()}/g`], ['ml', `${cur$()}/ml`], ['szt.', `${cur$()}/szt.`], ['opak.', `${cur$()}/opak.`]], i.priceUnit || 'kg', (v) => { i.priceUnit = v; buildPkg(); paintSum(); }, { label: 'Jednostka ceny' }))),
        pkg);
    });
    holder.replaceChildren(
      h('section', { class: 'card stack' }, field('Receptura', sel),
        h('div', { class: 'row gap' },
          col(field('Porcje', numInput({ value: r.servings, label: 'Liczba porcji', dec: 1, onInput: (v) => { r.servings = v || 0; paintSum(); } }))),
          col(field(`Cena sprzedaży (${cur$()})`, numInput({ value: r.salePrice, label: 'Cena sprzedaży porcji', dec: 2, onInput: (v) => { r.salePrice = v; paintSum(); } })))),
        field('Docelowy food cost (%)', numInput({ value: st.target, label: 'Docelowy food cost', dec: 1, onInput: (v) => { st.target = v || 30; save(); paintSum(); } }))),
      sum,
      h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, icon('coins', 20), 'Ceny składników'), ...rows),
      h('div', { class: 'row wrap gap' },
        button('Zapisz w recepturze', { icon: 'check', kind: 'primary', onClick: async () => {
          await saveRecipe({ ...base, sections: r.sections, servings: r.servings, salePrice: r.salePrice }, { note: 'Zaktualizowano ceny (kalkulator kosztu)' });
          toast('Zapisano ceny w recepturze');
        } }),
        button('Otwórz recepturę', { icon: 'book', kind: 'ghost', onClick: () => navigate('/recipe/' + base.id) })));
    paintSum();
  }
  ready.then(build);
  build();
  return { el: s.el };
}
