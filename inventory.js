import { db } from './db.js';
import { uid, norm } from './util.js';
let items = []; let loaded = false; let loadingPromise = null; const listeners = new Set();
export const subscribeInventory = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function normalizeEAN(value) {
  const ean = String(value ?? '').replace(/\D/g, '');
  return ean || '';
}
export function validEAN(value) {
  const ean = normalizeEAN(value);
  if (![8, 12, 13, 14].includes(ean.length)) return false;
  let sum = 0;
  for (let i = ean.length - 2, p = 1; i >= 0; i--, p++) sum += Number(ean[i]) * (p % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(ean.at(-1));
}
export const ingredientKey = (value) => norm(value).replace(/[^a-z0-9]+/g, ' ').trim();

const emit = () => listeners.forEach((fn) => { try { fn(); } catch (_) {} });
export async function reloadInventory() { loaded = false; items = []; return loadInventory(); }
export async function loadInventory() {
  if (loaded) return items;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    items = (await db.getAll('inventory')).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pl'));
    loaded = true;
    return items;
  })().finally(() => { loadingPromise = null; });
  return loadingPromise;
}
export const listInventory = () => items.slice();
export function stockState(item) { const qty=Number(item.quantity||0), min=Number(item.minQuantity||0); if(qty<=0)return 'empty'; if(min>0&&qty<=min)return 'low'; return 'ok'; }
export async function saveInventoryItem(data) { await loadInventory(); const now=Date.now(); const item={id:data.id||uid('stock_'),name:String(data.name||'').trim(),quantity:Number(data.quantity||0),unit:data.unit||'g',minQuantity:Number(data.minQuantity||0),targetQuantity:Number(data.targetQuantity||0),purchasePrice:data.purchasePrice==null||data.purchasePrice===''?null:Number(data.purchasePrice),priceUnit:data.priceUnit||'kg',ean:normalizeEAN(data.ean),aliases:Array.isArray(data.aliases)?[...new Set(data.aliases.map(x=>String(x).trim()).filter(Boolean))]:[],category:String(data.category||'').trim(),updatedAt:now,createdAt:data.createdAt||now}; if(!item.name)throw new Error('Podaj nazwę produktu.'); await db.put('inventory',item); const i=items.findIndex(x=>x.id===item.id); if(i>=0)items[i]=item;else items.push(item);items.sort((a,b)=>a.name.localeCompare(b.name,'pl'));emit();return item; }
export async function seedTestInventory() {
  const demo = [
    { id: 'demo_stock_flour', name: 'Mąka 00 test', quantity: 1.2, unit: 'kg', minQuantity: 5, targetQuantity: 12, purchasePrice: 4.5, priceUnit: 'kg', category: 'Suche' },
    { id: 'demo_stock_mozzarella', name: 'Mozzarella test', quantity: 1.5, unit: 'kg', minQuantity: 3, targetQuantity: 6, purchasePrice: 28, priceUnit: 'kg', category: 'Nabiał' },
    { id: 'demo_stock_pecorino', name: 'Pecorino Romano test', quantity: 0.4, unit: 'kg', minQuantity: 1, targetQuantity: 2, purchasePrice: 55, priceUnit: 'kg', category: 'Nabiał' },
    { id: 'demo_stock_guanciale', name: 'Guanciale test', quantity: 0.7, unit: 'kg', minQuantity: 1.5, targetQuantity: 3, purchasePrice: 72, priceUnit: 'kg', category: 'Mięso' },
    { id: 'demo_stock_tomato', name: 'Pomodoro test', quantity: 8, unit: 'szt', minQuantity: 4, targetQuantity: 12, purchasePrice: 6, priceUnit: 'szt', category: 'Warzywa' },
    { id: 'demo_stock_oil', name: 'Oliwa EVO test', quantity: 0.8, unit: 'l', minQuantity: 2, targetQuantity: 5, purchasePrice: 32, priceUnit: 'l', category: 'Tłuszcze' },
    { id: 'demo_stock_basil', name: 'Bazylia test', quantity: 0.2, unit: 'kg', minQuantity: 0.5, targetQuantity: 1, purchasePrice: 45, priceUnit: 'kg', category: 'Zioła' },
    { id: 'demo_stock_salt', name: 'Sól morska test', quantity: 3, unit: 'kg', minQuantity: 1, targetQuantity: 4, purchasePrice: 5, priceUnit: 'kg', category: 'Przyprawy' },
  ];
  await loadInventory();
  const created = [];
  for (const row of demo) {
    await db.delete('inventory', row.id);
    created.push(await saveInventoryItem(row));
  }
  return created;
}

export async function adjustInventory(id,delta,reason='manual'){const item=items.find(x=>x.id===id);if(!item)return null;const before=Number(item.quantity||0),after=Math.max(0,before+Number(delta||0)),now=Date.now(),next={...item,quantity:after,updatedAt:now};await db.tx(['inventory','inventoryLog'],t=>{t.put('inventory',next);t.put('inventoryLog',{id:uid('stocklog_'),ingredientId:id,type:reason,delta:after-before,before,after,at:now});});Object.assign(item,next);emit();return item;}
export async function removeInventoryItem(id){await db.delete('inventory',id);items=items.filter(x=>x.id!==id);emit();}
export function findInventoryByEAN(ean) {
  const key = normalizeEAN(ean);
  if (!key) return null;
  return items.find(x => normalizeEAN(x.ean) === key) || null;
}
export function findInventoryByName(name) {
  const n = ingredientKey(name);
  return items.find(x => ingredientKey(x.name) === n || (x.aliases || []).some(a => ingredientKey(a) === n)) || null;
}
export function findInventoryMatch(ingredient) {
  const ean = normalizeEAN(ingredient?.ean);
  if (ean) {
    const byEAN = findInventoryByEAN(ean);
    if (byEAN) return { item: byEAN, source: 'ean' };
  }
  const byName = findInventoryByName(ingredient?.name);
  if (byName) return { item: byName, source: 'name' };
  return null;
}

const UNIT_TO_BASE = { g: 1, kg: 1000, ml: 1, l: 1000, szt: 1, opak: 1 };
const normalizeUnit = (unit) => String(unit || '').trim().toLowerCase().replace(/\.$/, '');
const compatibleUnits = (a, b) => {
  if (a === b) return true;
  return (a in UNIT_TO_BASE) && (b in UNIT_TO_BASE) && ((a === 'g' || a === 'kg') && (b === 'g' || b === 'kg') || (a === 'ml' || a === 'l') && (b === 'ml' || b === 'l'));
};
const toBase = (value, unit) => Number(value || 0) * (UNIT_TO_BASE[unit] || 1);

export async function consumeRecipeIngredients(recipe, factor = 1, options = {}) {
  await loadInventory();
  const sourceId = String(options.sourceId || '').trim();
  if (sourceId) {
    const existingLog = (await db.getAll('inventoryLog')).find((x) => x?.sourceId === sourceId && x?.type === 'recipe');
    if (existingLog) return { changes: [], shortages: [], alreadyConsumed: true };
  }
  const shortages = [];
  const usedByItem = new Map();
  const remainingByItem = new Map();

  for (const ing of (recipe?.sections || []).flatMap((s) => s.ingredients || [])) {
    if (!ing?.name || ing.amount == null || ing.unit === '%') continue;
    const required = Number(ing.amount) * Number(factor || 1);
    if (!(required > 0)) continue;

    const item = findInventoryMatch(ing)?.item;
    const itemUnit = normalizeUnit(item?.unit);
    const ingredientUnit = normalizeUnit(ing.unit);
    if (!item || !compatibleUnits(itemUnit, ingredientUnit)) {
      shortages.push({ name: ing.name, amount: required, unit: ing.unit, missing: required });
      continue;
    }

    if (!remainingByItem.has(item.id)) {
      remainingByItem.set(item.id, toBase(item.quantity, itemUnit));
    }
    const remainingBase = remainingByItem.get(item.id);
    const requiredBase = toBase(required, ingredientUnit);
    const usedBase = Math.min(requiredBase, remainingBase);
    const missingBase = requiredBase - usedBase;

    remainingByItem.set(item.id, Math.max(0, remainingBase - usedBase));
    usedByItem.set(item.id, (usedByItem.get(item.id) || 0) + usedBase);

    if (missingBase > 0) {
      shortages.push({
        name: ing.name,
        amount: required,
        unit: ing.unit,
        missing: missingBase / UNIT_TO_BASE[ingredientUnit],
      });
    }
  }

  if (!usedByItem.size) return { changes: [], shortages };

  const now = Date.now();
  const next = [...usedByItem.entries()].map(([id, usedBase]) => {
    const item = items.find((x) => x.id === id);
    const itemUnit = normalizeUnit(item.unit);
    return {
      ...item,
      quantity: Math.max(0, Number(item.quantity || 0) - usedBase / UNIT_TO_BASE[itemUnit]),
      updatedAt: now,
    };
  });

  await db.tx(['inventory', 'inventoryLog', 'stockMovements'], (t) => {
    next.forEach((item) => {
      const before = Number(items.find((x) => x.id === item.id)?.quantity || 0);
      const delta = item.quantity - before;
      t.put('inventory', item);
      t.put('inventoryLog', {
        id: uid('stocklog_'),
        ingredientId: item.id,
        type: 'recipe',
        recipeId: recipe.id,
        recipeName: recipe.name,
        sourceId: sourceId || null,
        delta,
        before,
        after: item.quantity,
        at: now,
      });
      t.put('stockMovements', {
        id: uid('mov_'),
        at: now,
        type: 'recipe_consumption',
        inventoryId: item.id,
        inventoryName: item.name,
        delta,
        unit: item.unit,
        before,
        after: item.quantity,
        sourceId: sourceId || null,
        reason: 'gotowanie',
        note: recipe.name || '',
      });
    });
  });

  next.forEach((item) => {
    const i = items.findIndex((x) => x.id === item.id);
    if (i >= 0) items[i] = item;
  });
  emit();
  return { changes: next, shortages };
}


export const unitCompatible = (a, b) => compatibleUnits(normalizeUnit(a), normalizeUnit(b));
export const unitToBase = (value, unit) => toBase(value, normalizeUnit(unit));
export const unitFromBase = (value, unit) => Number(value || 0) / (UNIT_TO_BASE[normalizeUnit(unit)] || 1);

export async function receiveStock(name, amount, unit = 'szt', meta = {}) {
  await loadInventory();
  const qty = Number(amount);
  if (!name || !(qty > 0)) return { changed: false, reason: 'invalid' };
  const existing = findInventoryByName(name);
  if (existing && compatibleUnits(normalizeUnit(existing.unit), normalizeUnit(unit))) {
    const delta = unitFromBase(unitToBase(qty, unit), existing.unit);
    const updated = await adjustInventory(existing.id, delta, meta.reason || 'shopping');
    return { changed: true, item: updated, delta, created: false };
  }
  if (existing) return { changed: false, reason: 'unit-mismatch', item: existing };
  const created = await saveInventoryItem({
    name, quantity: qty, unit,
    minQuantity: 0, purchasePrice: null, priceUnit: unit,
    ean: meta.ean || '', category: meta.category || ''
  });
  return { changed: true, item: created, delta: qty, created: true };
}
