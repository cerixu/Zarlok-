/* ==========================================================================
   shopping.js — lista zakupów: logika (IndexedDB), widok, „Dodaj do zakupów”.
   ========================================================================== */
import { db } from './db.js';
import { state, subscribe, emit, getSetting, setSetting, allIngredients } from './recipes.js';
import { uid, norm, fmtAmount, UNITS, parseNum, copyText } from './util.js';
import {
  h, icon, screen, button, iconBtn, toast, openSheet, confirmDialog, emptyState, field, textInput, numInput, selectEl, segmented,
} from './ui.js';
import { navigate } from './router.js';
import { loadInventory, listInventory, findInventoryMatch, unitCompatible, unitToBase, unitFromBase, receiveStock } from './inventory.js';

/* ---------- Logika ---------- */

export const pendingCount = () => state.shopping.filter((i) => !i.done).length;

async function persist(changed, removed = []) {
  await db.tx(['shoppingItems'], (t) => { changed.forEach((i) => t.put('shoppingItems', i)); removed.forEach((i) => t.delete('shoppingItems', i.id)); });
  emit('shopping');
}

/** Dodaje pozycje; te same (nazwa + jednostka, niekupione) łączy, sumując ilości. */
export async function addItems(items) {
  const changed = [];
  let merged = 0;
  items.forEach((it) => {
    const name = (it.name || '').trim();
    if (!name) return;
    const amount = it.amount != null && Number.isFinite(it.amount) ? it.amount : null;
    const unit = it.unit || '';
    const same = state.shopping.find((x) => !x.done && norm(x.name) === norm(name) && (x.unit || '') === unit && (x.amount == null) === (amount == null));
    if (same) {
      if (amount != null) same.amount = (same.amount || 0) + amount;
      if (it.recipeName && !(same.recipeName || '').includes(it.recipeName)) same.recipeName = same.recipeName ? `${same.recipeName}, ${it.recipeName}` : it.recipeName;
      if (!changed.includes(same)) changed.push(same);
      merged++;
    } else {
      const n = { id: uid('shp_'), name, amount, unit, done: false, recipeId: it.recipeId || '', recipeName: it.recipeName || '', createdAt: Date.now() + changed.length };
      state.shopping.push(n);
      changed.push(n);
    }
  });
  if (changed.length) await persist(changed);
  return { count: changed.length, merged };
}

export async function updateItem(item, patch) { Object.assign(item, patch); await persist([item]); }
export async function markPurchased(item) {
  if (!item || item.done) return { changed: false, reason: 'already-done' };
  if (item.amount == null || !(Number(item.amount) > 0)) {
    item.done = true; await persist([item]); return { changed: true, received: false };
  }
  const stock = await receiveStock(item.name, item.amount, item.unit || 'szt', { reason: 'shopping' });
  if (!stock.changed) return stock;
  item.done = true; item.inventoryId = stock.item.id; item.inventoryDelta = stock.delta; item.inventoryReceivedAt = Date.now();
  await persist([item]);
  return { changed: true, received: true, stock };
}
export async function addLowStockToShopping() {
  await loadInventory();
  const missing = [];
  for (const item of listInventory()) {
    const min = Number(item.minQuantity || 0), target = Number(item.targetQuantity || 0), qty = Number(item.quantity || 0);
    if (!(min > 0) || qty > min || !(target > qty)) continue;
    const needed = unitToBase(target - qty, item.unit);
    const pending = state.shopping.filter(x=>!x.done&&norm(x.name)===norm(item.name)&&x.amount!=null&&unitCompatible(x.unit,item.unit)).reduce((s,x)=>s+unitToBase(Number(x.amount||0),x.unit),0);
    const remaining = Math.max(0, needed - pending);
    if (remaining > 0) missing.push({name:item.name,amount:unitFromBase(remaining,item.unit),unit:item.unit,recipeName:'Magazyn · uzupełnienie stanu'});
  }
  return missing.length ? {...(await addItems(missing)),items:missing} : {count:0,merged:0,items:[]};
}
export async function addMissingFromRecipe(recipe, factor=1) {
  await loadInventory();
  const missing=[];
  for (const ing of (recipe?.sections||[]).flatMap(s=>s.ingredients||[])) {
    if (!ing?.name || ing.amount==null || ing.unit==='%') continue;
    const required=Number(ing.amount)*Number(factor||1); if (!(required>0)) continue;
    const stock=findInventoryMatch(ing)?.item;
    if (!stock || !unitCompatible(stock.unit,ing.unit)) { missing.push({name:ing.name,amount:required,unit:ing.unit,recipeId:recipe.id,recipeName:recipe.name}); continue; }
    const need=unitToBase(required,ing.unit), have=unitToBase(stock.quantity,stock.unit);
    if (have<need) missing.push({name:ing.name,amount:unitFromBase(need-have,ing.unit),unit:ing.unit,recipeId:recipe.id,recipeName:recipe.name});
  }
  return missing.length ? {...(await addItems(missing)),items:missing} : {count:0,merged:0,items:[]};
}
export async function deleteItem(item) { state.shopping = state.shopping.filter((x) => x.id !== item.id); await persist([], [item]); }
export async function clearDone() { const gone = state.shopping.filter((x) => x.done); state.shopping = state.shopping.filter((x) => !x.done); await persist([], gone); return gone.length; }
export async function clearAllItems() { const gone = state.shopping; state.shopping = []; await persist([], gone); }

/* ---------- Alejki sklepowe (zgadywane po nazwie) ---------- */

const AISLES = [
  ['Warzywa i owoce', /pomidor|cebul|czosnek|ziemniak|marchew|papryk|cukini|bakłażan|sałat|rukola|szpinak|ogórek|cytryn|limonk|pomarańcz|jabłk|banan|bazyli|pietruszk|kolendr|tymianek|rozmaryn|mięta|natka|szczypior|por\b|seler|pieczark|grzyb|awokado|imbir|chili|ziele|liście|liscie|pelati/],
  ['Nabiał i jaja', /mleko|śmietan|masło|ser\b|serek|mozzarell|parmezan|pecorino|ricotta|mascarpone|jogurt|jaj|żółtk|białk|kefir|twaróg|feta|gorgonzola/],
  ['Mięso i ryby', /mięso|mięs|wołow|wieprz|kurczak|indyk|boczek|guanciale|pancetta|szynk|kiełbas|salami|łosoś|losos|dorsz|tuńczyk|krewetk|ryb|małże|kałamarnic|mielon|schab|żeber|kaczk|jagni/],
  ['Sypkie i pieczywo', /mąk|cukier|makaron|spaghetti|penne|ryż|kasza|płatki|chleb|bułk|drożdż|proszek|soda|skrobia|bułka tart|semolin|grys|fasol|soczewic|ciecierzyc|orzech|migdał/],
  ['Przyprawy, oleje, sosy', /sól|pieprz|oliw|olej|ocet|przypraw|papryka mielona|oregano|curry|kmin|cynamon|wanili|musztard|ketchup|koncentrat|passata|sos\b|sojow|miód|tahini|bulion/],
  ['Napoje', /woda|wino|piwo|sok|cola|tonik|rum|wódk|whisk|gin\b|likier|prosecco|kawa|herbata/],
];
export function aisleOf(name) {
  const n = norm(name);
  for (const [label, rx] of AISLES) if (rx.test(n) || rx.test(name.toLowerCase())) return label;
  return 'Inne';
}
const AISLE_ORDER = [...AISLES.map((a) => a[0]), 'Inne'];

export const qtyText = (i) => (i.amount != null ? `${fmtAmount(i.amount)}${i.unit ? '\u00a0' + i.unit : ''}` : i.unit && !UNITS.includes(i.unit) ? i.unit : '');

function listAsText(items) {
  const lines = items.filter((i) => !i.done).map((i) => `☐ ${i.name}${qtyText(i) ? ' — ' + qtyText(i) : ''}`);
  return 'Lista zakupów (Kucharzyna)\n' + lines.join('\n');
}

/* ---------- Dodawanie z receptury ---------- */

/** Arkusz z listą składników receptury (przeskalowanych przez factor) do wyboru. */
export function openAddToShopping(recipe, factor = 1) {
  const rows = [];
  recipe.sections.forEach((s) => s.ingredients.forEach((i) => {
    if (!i.name || i.unit === '%') return;
    rows.push({ ing: i, sec: s.name, on: true, amount: i.amount != null ? i.amount * factor : null });
  }));
  if (!rows.length) { toast('Ta receptura nie ma składników'); return; }

  const boxes = [];
  const list = h('div', { class: 'checklist' }, rows.map((r, idx) => {
    const cb = h('input', { type: 'checkbox', checked: true, id: 'as' + idx, 'aria-label': r.ing.name });
    cb.addEventListener('change', () => { r.on = cb.checked; refresh(); });
    boxes.push(cb);
    return h('label', { class: 'check-row', for: 'as' + idx }, cb, h('span', { class: 'check-box' }, icon('check', 18)),
      h('span', { class: 'check-text' }, h('span', { class: 'check-name' }, r.ing.name), h('span', { class: 'check-qty num' }, r.amount != null ? `${fmtAmount(r.amount)} ${r.ing.unit}` : r.ing.unit || '')));
  }));
  const allBtn = button('Odznacz wszystko', { sm: true, kind: 'ghost', onClick: () => {
    const any = rows.some((r) => !r.on);
    rows.forEach((r, i) => { r.on = any; boxes[i].checked = any; });
    refresh();
  } });
  const addAction = { label: 'Dodaj', kind: 'primary', icon: 'cart', onClick: async () => {
    const picked = rows.filter((r) => r.on).map((r) => ({ name: r.ing.name, amount: r.amount, unit: r.ing.unit, recipeId: recipe.id, recipeName: recipe.name }));
    const res = await addItems(picked);
    toast(`Dodano do zakupów: ${res.count}${res.merged ? ` (połączono ${res.merged})` : ''}`, { action: { label: 'Pokaż', fn: () => navigate('/shopping') } });
  } };
  const sheet = openSheet({
    title: 'Dodaj do zakupów',
    body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, factor !== 1 ? `${recipe.name} · przeliczone ×${fmtAmount(factor)}` : recipe.name), allBtn, list),
    actions: [{ label: 'Anuluj', kind: 'ghost' }, addAction],
  });
  const foot = sheet.panel.querySelectorAll('.panel-foot .btn');
  const addBtn = foot[foot.length - 1];
  function refresh() {
    const n = rows.filter((r) => r.on).length;
    addBtn.disabled = n === 0;
    addBtn.lastChild.textContent = `Dodaj (${n})`;
    allBtn.lastChild.textContent = rows.some((r) => !r.on) ? 'Zaznacz wszystko' : 'Odznacz wszystko';
  }
  refresh();
}

/* ---------- Widok ---------- */

function editItemSheet(item) {
  let name = item.name, amount = item.amount, unit = item.unit || '';
  const unitOpts = ['', ...UNITS];
  if (unit && !unitOpts.includes(unit)) unitOpts.push(unit);
  openSheet({
    title: 'Edytuj pozycję', variant: 'center',
    body: h('div', { class: 'stack' },
      field('Nazwa', textInput({ value: name, label: 'Nazwa', onInput: (v) => { name = v; } })),
      h('div', { class: 'row gap' },
        h('div', { class: 'grow' }, field('Ilość', numInput({ value: amount, label: 'Ilość', onInput: (v) => { amount = v; } }))),
        h('div', { class: 'grow' }, field('Jednostka', selectEl(unitOpts.map((u) => [u, u || '—']), unit, (v) => { unit = v; }))))),
    actions: [
      { label: 'Usuń', kind: 'danger', icon: 'trash', onClick: async () => { await deleteItem(item); toast('Usunięto pozycję'); } },
      { label: 'Zapisz', kind: 'primary', onClick: async () => {
        if (!name.trim()) { toast('Podaj nazwę', { type: 'error' }); return false; }
        await updateItem(item, { name: name.trim(), amount, unit });
      } },
    ],
  });
}

export function shoppingView() {
  let unsub;
  const groupMode = () => getSetting('shopGroup') || 'aisle';

  const nameIn = textInput({ placeholder: 'Dodaj pozycję…', label: 'Nowa pozycja', cls: 'grow' });
  const amtIn = numInput({ placeholder: 'Ilość', label: 'Ilość', cls: 'amt' });
  const unitSel = selectEl(['', ...UNITS].map((u) => [u, u || '—']), '', null, { label: 'Jednostka', cls: 'unit' });
  let amt = null;
  amtIn.addEventListener('input', () => { amt = parseNum(amtIn.value); });
  const addManual = async () => {
    const name = nameIn.value.trim();
    if (!name) { nameIn.focus(); return; }
    await addItems([{ name, amount: amt, unit: unitSel.value }]);
    nameIn.value = ''; amtIn.value = ''; amt = null; unitSel.value = '';
    nameIn.focus();
  };
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addManual(); } });
  const addRow = h('div', { class: 'addrow' }, nameIn, amtIn, unitSel, iconBtn('plus', 'Dodaj do listy', addManual, 'primary'));

  const more = iconBtn('more', 'Więcej opcji', () => {
    const sh = openSheet({
      title: 'Lista zakupów',
      body: h('div', { class: 'stack' },
        h('div', null, h('div', { class: 'field-label' }, 'Grupowanie'),
          segmented([['aisle', 'Alejki'], ['recipe', 'Receptury'], ['none', 'Brak']], groupMode(), (v) => setSetting('shopGroup', v), { label: 'Grupowanie' })),
        h('div', { class: 'menu' },
          button('Skopiuj / udostępnij listę', { icon: 'share', block: true, onClick: async () => {
            sh.close();
            const text = listAsText(state.shopping);
            if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
            const ok = await copyText(text);
            toast(ok ? 'Skopiowano listę' : 'Nie udało się skopiować', { type: ok ? '' : 'error' });
          } }),
          button('Wyczyść kupione', { icon: 'check', block: true, onClick: async () => { sh.close(); const n = await clearDone(); toast(n ? `Usunięto kupione: ${n}` : 'Nic do wyczyszczenia'); } }),
          button('Usuń całą listę', { icon: 'trash', kind: 'danger', block: true, onClick: async () => {
            sh.close();
            if (!state.shopping.length) return;
            if (await confirmDialog({ title: 'Usunąć całą listę?', message: `Zostanie usuniętych ${state.shopping.length} pozycji.`, confirmText: 'Usuń', danger: true })) { await clearAllItems(); toast('Lista wyczyszczona'); }
          } }))),
    });
  });

  const s = screen({ title: 'Zakupy', right: more, sub: addRow, cls: 'shopping' });

  function itemRow(item) {
    const cb = h('button', { type: 'button', class: 'shop-check' + (item.done ? ' on' : ''), role: 'checkbox', 'aria-checked': !!item.done, 'aria-label': `${item.name}: ${item.done ? 'kupione' : 'do kupienia'}`,
      onClick: async () => { try { const r = await markPurchased(item); if (r.changed) toast(r.received ? 'Kupione · dodano do Magazynu 📦' : 'Odhaczono'); else if (r.reason === 'unit-mismatch') toast('Nie dodano do Magazynu: niezgodna jednostka.', { type: 'error' }); } catch(e) { toast(e.message || 'Nie udało się oznaczyć zakupu.', { type: 'error' }); } } }, icon('check', 20));
    return h('div', { class: 'shop-item' + (item.done ? ' done' : '') },
      cb,
      h('button', { type: 'button', class: 'shop-main', onClick: async () => { try { const r = await markPurchased(item); if (r.changed) toast(r.received ? 'Kupione · dodano do Magazynu 📦' : 'Odhaczono'); } catch(e) { toast(e.message || 'Nie udało się oznaczyć zakupu.', { type: 'error' }); } } },
        h('span', { class: 'shop-name' }, item.name),
        item.recipeName && groupMode() !== 'recipe' ? h('span', { class: 'shop-from muted' }, item.recipeName) : null),
      h('span', { class: 'shop-qty num' }, qtyText(item)),
      iconBtn('edit', `Edytuj: ${item.name}`, () => editItemSheet(item), 'quiet'));
  }

  function paint() {
    const items = state.shopping;
    const todo = items.filter((i) => !i.done), done = items.filter((i) => i.done);
    const kids = [];
    if (!items.length) {
      kids.push(emptyState('🛒', 'Lista jest pusta', 'Dodaj pozycję powyżej albo wrzuć składniki z receptury (przycisk „Do zakupów” przy recepturze).',
        button('Otwórz receptury', { icon: 'book', onClick: () => navigate('/recipes') })));
    } else {
      kids.push(h('p', { class: 'muted counter' }, `Do kupienia: ${todo.length}${done.length ? ` · kupione: ${done.length}` : ''}`));
      const mode = groupMode();
      let groups;
      if (mode === 'none') groups = [['', todo]];
      else if (mode === 'recipe') {
        const m = new Map();
        todo.forEach((i) => { const k = i.recipeName || 'Dodane ręcznie'; if (!m.has(k)) m.set(k, []); m.get(k).push(i); });
        groups = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pl'));
      } else {
        const m = new Map();
        todo.forEach((i) => { const k = aisleOf(i.name); if (!m.has(k)) m.set(k, []); m.get(k).push(i); });
        groups = AISLE_ORDER.filter((k) => m.has(k)).map((k) => [k, m.get(k)]);
      }
      groups.forEach(([label, list]) => {
        if (label) kids.push(h('h3', { class: 'group-title' }, label, h('span', { class: 'count' }, String(list.length))));
        kids.push(h('div', { class: 'shop-list' }, list.map(itemRow)));
      });
      if (done.length) {
        kids.push(h('div', { class: 'sechead' }, h('h2', null, 'Kupione', h('span', { class: 'count' }, String(done.length))),
          h('button', { type: 'button', class: 'linkbtn', onClick: async () => { const n = await clearDone(); toast(`Usunięto kupione: ${n}`); } }, 'Wyczyść')));
        kids.push(h('div', { class: 'shop-list' }, done.map(itemRow)));
      }
    }
    s.content.replaceChildren(...kids);
  }
  paint();
  unsub = subscribe((t) => { if (t === 'shopping' || t === 'settings') paint(); });
  return { el: s.el, destroy: () => unsub && unsub() };
}
