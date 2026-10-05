/* ==========================================================================
   calculator.js — czysta logika obliczeń (bez DOM): przeliczanie receptur,
   procenty piekarskie, kalkulator pizzy, food cost.
   ========================================================================== */
import { UNITS, isWV, toGrams, fromGrams, convertAmount, sum, clamp } from './util.js';
import { cloneRecipe, allIngredients } from './recipes.js';

/* ---------- Przeliczanie receptury ---------- */

const roundServ = (v) => (Math.abs(v - Math.round(v)) < 0.01 ? Math.round(v) : Math.round(v * 10) / 10);

/** Łączna masa składników w g/ml (i łyżkach itp. — przybliżenie 1 ml ≈ 1 g). */
export const totalMass = (r) => sum(allIngredients(r).map((i) => toGrams(i.amount, i.unit) || 0));

/** Wydajność zadana w recepturze albo policzona z sumy składników (g). */
export function effectiveYield(r) {
  if (r.yieldAmount > 0) return { amount: r.yieldAmount, unit: r.yieldUnit || 'g', computed: false };
  const g = totalMass(r);
  return g > 0 ? { amount: g, unit: 'g', computed: true } : null;
}

export const factorFromServings = (r, target) => (r.servings > 0 && target > 0 ? target / r.servings : null);

export function factorFromYield(r, targetAmount, targetUnit) {
  const y = effectiveYield(r);
  if (!y || !(targetAmount > 0)) return null;
  const t = y.unit === 'szt.' || y.unit === 'porcja' ? (targetUnit === y.unit ? targetAmount : null) : convertAmount(targetAmount, targetUnit, y.unit);
  return t == null ? null : t / y.amount;
}

export function factorFromIngredient(ing, targetAmount, targetUnit) {
  if (!(ing.amount > 0) || !(targetAmount > 0)) return null;
  const t = convertAmount(targetAmount, targetUnit, ing.unit);
  return t == null ? null : t / ing.amount;
}

/** Kopia receptury z ilościami pomnożonymi przez k (jednostka „%” zostaje bez zmian). */
export function scaleRecipe(r, k) {
  if (k === 1) return r;
  const c = cloneRecipe(r);
  c.sections.forEach((s) => s.ingredients.forEach((i) => {
    if (i.unit !== '%' && Number.isFinite(i.amount)) i.amount *= k;
  }));
  if (c.servings) c.servings = roundServ(c.servings * k);
  if (c.yieldAmount) c.yieldAmount *= k;
  return c;
}

/* ---------- Procenty piekarskie ---------- */

const RX = {
  flour: /mąk|mak[ai]\b|flour|farina|semolin|semola|mehl|grys pszenny/i,
  water: /(^|\s)(woda|wody|water|acqua|wasser)(\s|$)/i,
  salt: /(^|\s)(sól|soli|sol|salt|sale|salz|sel)(\s|$)/i,
  yeast: /drożdż|yeast|lievito|hefe|levure/i,
  fat: /oliw|olej|masł|tłuszcz|smalec|\boil\b|butter|lard|shortening|olio|burro/i,
};

/** Rozpoznanie roli składnika na podstawie nazwy (flour: true/false nadpisuje). */
export function ingKind(ing) {
  if (typeof ing.flour === 'boolean') { if (ing.flour) return 'flour'; }
  else if (RX.flour.test(ing.name)) return 'flour';
  if (RX.yeast.test(ing.name)) return 'yeast';
  if (RX.salt.test(ing.name)) return 'salt';
  if (RX.water.test(ing.name)) return 'water';
  if (RX.fat.test(ing.name)) return 'fat';
  return 'other';
}

/**
 * Tabela procentów piekarskich. Zakres = sekcje zawierające mąkę (np. „CIASTO”);
 * sos i dodatki nie wpływają na procenty. Mąka (łącznie) = 100%.
 */
export function bakersTable(r) {
  const secs = r.sections.filter((s) => s.ingredients.some((i) => ingKind(i) === 'flour' && isWV(i.unit) && i.amount > 0));
  const ings = secs.flatMap((s) => s.ingredients);
  const flourG = sum(ings.filter((i) => ingKind(i) === 'flour').map((i) => toGrams(i.amount, i.unit)));
  const rows = ings.map((i) => {
    const g = toGrams(i.amount, i.unit);
    return { id: i.id, name: i.name, kind: ingKind(i), grams: g, pct: g != null && flourG > 0 ? (g / flourG) * 100 : null };
  });
  const by = (k) => sum(rows.filter((x) => x.kind === k).map((x) => x.grams));
  const pctOf = (k) => (flourG > 0 ? (by(k) / flourG) * 100 : 0);
  return {
    ok: flourG > 0, rows, flourG, totalG: sum(rows.map((x) => x.grams)),
    hydration: pctOf('water'), salt: pctOf('salt'), yeast: pctOf('yeast'), fat: pctOf('fat'),
    ids: new Set(rows.map((x) => x.id)),
  };
}

/**
 * Przelicza ciasto po zmianie: total (całkowita masa ciasta, g), hydration, salt, yeast, fat (% mąki).
 * Pozostałe składniki zachowują swój procent; składniki spoza ciasta skalują się razem z ciastem.
 */
export function bakersRecalc(r, o = {}) {
  const t = bakersTable(r);
  if (!t.ok) return r;
  const c = cloneRecipe(r);
  const pct = {};
  t.rows.forEach((x) => { if (x.pct != null) pct[x.id] = x.pct; });
  const setGroup = (kind, target) => {
    if (!(target >= 0)) return;
    const rows = t.rows.filter((x) => x.kind === kind && x.pct != null);
    if (!rows.length) return;
    const cur = sum(rows.map((x) => x.pct));
    if (cur > 0) rows.forEach((x) => { pct[x.id] = (x.pct * target) / cur; });
    else pct[rows[0].id] = target;
  };
  setGroup('water', o.hydration); setGroup('salt', o.salt); setGroup('yeast', o.yeast); setGroup('fat', o.fat);
  const pctSum = sum(Object.values(pct));
  let flour = t.flourG;
  if (o.total > 0) flour = o.total / (pctSum / 100);
  const k = flour / t.flourG;
  c.sections.forEach((s) => s.ingredients.forEach((i) => {
    if (pct[i.id] != null && isWV(i.unit)) {
      i.amount = fromGrams((pct[i.id] * flour) / 100, i.unit);
      if (t.ids.has(i.id)) i.percent = Math.round(pct[i.id] * 100) / 100;
    } else if (i.unit !== '%' && Number.isFinite(i.amount)) i.amount *= k;
  }));
  if (c.servings) c.servings = roundServ(c.servings * k);
  if (c.yieldAmount) c.yieldAmount *= k;
  return c;
}

/* ---------- Kalkulator pizzy ---------- */

export const YEAST_TYPES = { fresh: { label: 'świeże', f: 1 }, dry: { label: 'suche aktywne', f: 0.4 }, instant: { label: 'instant', f: 0.33 } };

/** total = kulki × masa; mąka = total / (1 + suma procentów). */
export function pizzaCalc({ balls, ballWeight, hydration, salt, oil, yeast }) {
  const total = balls * ballWeight;
  const pctSum = 100 + hydration + salt + oil + yeast;
  const flour = total / (pctSum / 100);
  const part = (p) => (flour * p) / 100;
  return { flour, water: part(hydration), salt: part(salt), oil: part(oil), yeast: part(yeast), total, pctSum };
}

/**
 * Orientacyjna ilość drożdży świeżych (% mąki) dla temperatury i czasu fermentacji.
 * Model: ilość ~ 1 / (czas × 2^((T−20)/10)); 24 h w 20 °C ≈ 0,25%.
 */
/** Kalkulator ciasta od posiadanej ilości mąki. Mąka = 100%. */
export function pizzaCalcFromFlour({ flour, ballWeight, hydration, salt, oil, yeast }) {
  const flourG = Number(flour);
  const pctSum = 100 + Number(hydration || 0) + Number(salt || 0) + Number(oil || 0) + Number(yeast || 0);
  const part = (p) => (flourG * Number(p || 0)) / 100;
  const total = flourG * pctSum / 100;
  return {
    flour: flourG,
    water: part(hydration),
    salt: part(salt),
    oil: part(oil),
    yeast: part(yeast),
    total,
    pctSum,
    balls: Number(ballWeight) > 0 ? Math.floor(total / Number(ballWeight)) : null,
    remainder: Number(ballWeight) > 0 ? total % Number(ballWeight) : null,
  };
}

export function yeastSuggestion(tempC, hours) {
  if (!(hours > 0) || !Number.isFinite(tempC)) return null;
  return clamp(6 / (hours * Math.pow(2, (tempC - 20) / 10)), 0.02, 3);
}

/* ---------- Food cost ---------- */

/** Cena za gram/ml (dim 'wv') albo za sztukę (dim 'count'); null gdy brak ceny. */
export function unitPrice(ing) {
  const p = ing.price;
  if (!(Number.isFinite(p) && p >= 0)) return null;
  switch (ing.priceUnit) {
    case 'kg': case 'l': return { dim: 'wv', v: p / 1000 };
    case 'g': case 'ml': return { dim: 'wv', v: p };
    case 'szt.': return { dim: 'count', v: p };
    case 'opak.': {
      const w = ing.packageWeight;
      if (!(w > 0)) return null;
      return (ing.packageUnit || 'g') === 'szt.' ? { dim: 'count', v: p / w } : { dim: 'wv', v: p / w };
    }
    default: return null;
  }
}

export function ingredientCost(ing, k = 1) {
  const up = unitPrice(ing);
  if (!up || !Number.isFinite(ing.amount)) return null;
  const amt = ing.amount * k;
  if (up.dim === 'count') return ing.unit === 'szt.' ? amt * up.v : null;
  const g = toGrams(amt, ing.unit);
  return g == null ? null : g * up.v;
}

export function recipeCost(r, k = 1) {
  const lines = allIngredients(r).map((ing) => ({ ing, cost: ingredientCost(ing, k) }));
  const total = sum(lines.map((l) => l.cost));
  const missing = lines.filter((l) => l.cost == null).length;
  const portions = r.servings > 0 ? r.servings * k : null;
  const perPortion = portions ? total / portions : null;
  const foodCostPct = perPortion != null && r.salePrice > 0 ? (perPortion / r.salePrice) * 100 : null;
  return { lines, total, missing, portions, perPortion, foodCostPct };
}

/** Cena sprzedaży dla zadanego food cost % (np. 30%). */
export const priceForFoodCost = (costPerPortion, targetPct) => (targetPct > 0 ? costPerPortion / (targetPct / 100) : null);

export { UNITS };
