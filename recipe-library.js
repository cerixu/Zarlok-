/* ==========================================================================
   recipe-library.js — prawdziwy korpus startowy Kucharka.
   Źródło: AdamBouhmad/open-recipe-archive (public-domain).
   Ten plik NIE mnoży wariantów. Każdy rekord pochodzi z osobnej receptury
   archiwalnej i ma stabilne ID oparte na skrócie treści.
   ========================================================================== */

import { ARCHIVE_RECIPES } from './recipe-library-data/index.js';
import { translateRecipe, normalizeArchivePolishText, normalizeArchivePolishName, normalizeArchivePolishTag } from './recipe-translation.js';


const UNIT_FACTORS = {
  oz: ['g', 28.349523125],
  ounce: ['g', 28.349523125],
  ounces: ['g', 28.349523125],
  lb: ['g', 453.59237],
  pound: ['g', 453.59237],
  pounds: ['g', 453.59237],
  cup: ['ml', 236.5882365],
  cups: ['ml', 236.5882365],
  tbsp: ['ml', 14.7867648],
  tablespoon: ['ml', 14.7867648],
  tablespoons: ['ml', 14.7867648],
  tsp: ['ml', 4.92892159],
  teaspoon: ['ml', 4.92892159],
  teaspoons: ['ml', 4.92892159],
  pint: ['ml', 473.176473],
  pints: ['ml', 473.176473],
  quart: ['ml', 946.352946],
  quarts: ['ml', 946.352946],
  gallon: ['l', 3.785411784],
  gallons: ['l', 3.785411784],
  inch: ['cm', 2.54],
  inches: ['cm', 2.54],
};

function roundKitchenAmount(n) {
  if (!Number.isFinite(n)) return n;
  if (Math.abs(n) >= 100) return Math.round(n);
  if (Math.abs(n) >= 10) return Math.round(n * 10) / 10;
  return Math.round(n * 100) / 100;
}

const TRAILING_QTY_RE = /^(.*?)[,;]\s*(\d+(?:[.,]\d+)?)\s*(grams?|g|kilograms?|kg|milliliters?|ml|liters?|l)\s*$/i;

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, half: 0.5, quarter: 0.25, third: 1 / 3, fourth: 0.25, few: null, several: null
};

function parseRawQuantity(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const m = text.match(/^((?:\d+(?:[.,]\d+)?|\d+\/\d+|two-thirds|three-quarters|three-fourths|one-half|(?:one|two|three|four|five|six|seven|eight|nine|ten|a|an)(?:\s+(?:and-)?(?:a|one|two|three|four|five|six|seven|eight|nine|ten))?)(?:\s*[- ](?:half|third|quarter|fourth))?)\s+(cups?|tablespoons?|tbsp|teaspoons?|tsp|pounds?|lbs?|ounces?|oz|pints?|quarts?|gallons?|inches?|heads?|head)\b\s*(.*)$/i);
  if (!m) return null;
  let q = m[1].toLowerCase().replace(',', '.').trim();
  let amount = Number(q);
  if (!Number.isFinite(amount)) amount = WORD_NUMBERS[q];
  if (q.includes('two-thirds')) amount = 2 / 3;
  else if (q.includes('three-quarters') || q.includes('three-fourths')) amount = 3 / 4;
  else if (q.includes('one-half') || q.includes('one half')) amount = 0.5;
  if (!Number.isFinite(amount)) return null;
  const unit = m[2].toLowerCase().replace(/s$/, '');
  const rest = m[3].trim().replace(/^(?:of|the)\s+/i, '');
  return { amount, unit, rest };
}

function ingredientNameFromRaw(raw, fallback) {
  const parsed = parseRawQuantity(raw);
  const trailing = String(raw || '').match(TRAILING_QTY_RE);
  const source = parsed ? parsed.rest : (trailing ? trailing[1] : String(raw || fallback || ''));
  const cleanedSource = source.replace(/[()]/g, '');
  const translated = translateRecipe({ name: cleanedSource, sections: [], steps: [] }).name;
  return normalizeArchivePolishText(translated)
    .replace(/^[-–—:;,]+\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeArchiveIngredient(i) {
  const raw = String(i.raw || '').trim();
  const parsed = parseRawQuantity(raw);
  const trailing = raw.match(TRAILING_QTY_RE);
  const next = { ...i };
  next.name = ingredientNameFromRaw(raw, i.name);
  if (parsed && Number.isFinite(parsed.amount)) {
    const conversion = UNIT_FACTORS[parsed.unit];
    if (conversion) {
      next.amount = roundKitchenAmount(parsed.amount * conversion[1]);
      next.unit = conversion[0];
    } else {
      next.amount = roundKitchenAmount(parsed.amount);
      next.unit = parsed.unit;
    }
  } else if (trailing) {
    next.amount = roundKitchenAmount(Number(trailing[2].replace(',', '.')));
    const u = trailing[3].toLowerCase();
    next.unit = /kilogram|^kg$/i.test(u) ? 'kg' : /milliliter|^ml$/i.test(u) ? 'ml' : /liter|^l$/i.test(u) ? 'l' : 'g';
  } else {
    const key = String(i.unit || '').trim().toLowerCase();
    const conversion = UNIT_FACTORS[key];
    if (conversion && Number.isFinite(Number(i.amount))) {
      next.amount = roundKitchenAmount(Number(i.amount) * conversion[1]);
      next.unit = conversion[0];
    }
  }
  if (!next.name) next.name = normalizeArchivePolishText(i.name);
  return next;
}

function normalizeArchiveRecipe(r) {
  const next = {
    ...r,
    name: normalizeArchivePolishName(r.name),
    description: normalizeArchivePolishText(r.description),
    notes: normalizeArchivePolishText(r.notes),
    tags: Array.isArray(r.tags) ? r.tags.map((t) => normalizeArchivePolishTag(t)) : [],
    sections: (r.sections || []).map((s) => ({
      ...s,
      name: normalizeArchivePolishText(s.name),
      ingredients: (s.ingredients || []).map(normalizeArchiveIngredient),
    })),
    steps: (r.steps || []).map((s) => ({ ...s, text: normalizeArchivePolishText(s.text) })),
    translationLanguage: 'pl',
    translationVersion: 34,
  };
  return next;
}

export function recipeLibrary(now = Date.now()) {
  return ARCHIVE_RECIPES.map((r) => {
    const translated = r.translationLanguage === 'pl' && Number(r.translationVersion || 0) >= 10 ? r : translateRecipe(r);
    return {
      ...normalizeArchiveRecipe(translated),
      createdAt: now,
      updatedAt: now,
    };
  });
}
