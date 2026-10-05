/* ==========================================================================
   history.js — historia zakończonych gotowań.
   Jedno zdarzenie = jedno zakończone gotowanie, niezależnie od liczby składników.
   ========================================================================== */
import { db } from './db.js';
import { uid } from './util.js';

export async function recordCook(event = {}) {
  const at = Number(event.at || Date.now());
  const id = String(event.id || uid('cook_'));
  const row = {
    id,
    recipeId: String(event.recipeId || ''),
    recipeName: String(event.recipeName || 'Receptura'),
    at,
    factor: Number(event.factor || 1),
    servings: Number(event.servings || 1),
    inventoryConsumed: !!event.inventoryConsumed,
  };
  await db.put('cookHistory', row);
  return row;
}

export async function listCookHistory(limit = 100) {
  const rows = await db.getAll('cookHistory');
  return rows
    .filter((x) => x && x.recipeId && Number(x.at) > 0)
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
    .slice(0, Math.max(1, Number(limit) || 100));
}

export async function clearCookHistory() {
  return db.clear('cookHistory');
}
