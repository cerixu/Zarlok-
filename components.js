/* ==========================================================================
   components.js — wspólne elementy interfejsu (karta receptury, nagłówki sekcji).
   ========================================================================== */
import { h, icon, toast } from './ui.js';
import { navigate } from './router.js';
import { catName, catIcon, ORIGINS, toggleFavorite } from './recipes.js';
import { fmtMinutes, fmtAmount, fmtNum } from './util.js';
import { recipeArtUrl } from './art.js';

export const originOf = (code) => ORIGINS.find((o) => o.code === code);

/** Czas czynny + osobno fermentacja, np. "45 min · ferm. 24 h". */
export function timeText(r) {
  const active = (r.prepTime || 0) + (r.cookTime || 0);
  const parts = [];
  if (active) parts.push(fmtMinutes(active));
  if (r.fermentTime) parts.push('ferm. ' + fmtMinutes(r.fermentTime));
  return parts.join(' · ');
}

export function metaLine(r) {
  const parts = [catName(r.category)];
  if (r.servings) parts.push(`${r.servings} porc.`);
  const t = timeText(r);
  if (t) parts.push(t);
  return parts.join(' · ');
}

/** Gwiazdka + flaga dla receptur tradycyjnych. */
export function tradMark(r) {
  if (!r.traditional) return null;
  const o = originOf(r.origin);
  return h('span', { class: 'trad', title: o ? `Tradycyjna — ${o.name}` : 'Tradycyjna', 'aria-label': o ? `Tradycyjna, ${o.name}` : 'Tradycyjna' },
    icon('star', 16), o ? h('span', { class: 'flag', 'aria-hidden': 'true' }, o.flag) : null);
}

export function heartBtn(r, onToggle) {
  const b = h('button', { type: 'button', class: 'heart' + (r.favorite ? ' on' : ''), 'aria-pressed': !!r.favorite,
    'aria-label': r.favorite ? `Usuń z ulubionych: ${r.name}` : `Dodaj do ulubionych: ${r.name}`,
    onClick: async (e) => {
      e.stopPropagation();
      const next = await toggleFavorite(r.id);
      toast(next.favorite ? 'Dodano do ulubionych' : 'Usunięto z ulubionych');
      if (onToggle) onToggle(next);
    } }, icon('heart', 22));
  return b;
}

/** Miniatura: własne zdjęcie, a gdy go brak — ilustracja potrawy rysowana w kodzie. */
export function thumbEl(r, cls = '') {
  return h('div', { class: 'rthumb ' + cls }, h('img', { src: r.thumb || recipeArtUrl(r), alt: '', loading: 'lazy', decoding: 'async' }));
}

/** Duży kafelek do poziomych list (Start). */
export function recipeTile(r) {
  return h('a', { class: 'rtile', href: '#/recipe/' + encodeURIComponent(r.id), 'aria-label': r.name,
    onClick: (e) => { e.preventDefault(); navigate('/recipe/' + encodeURIComponent(r.id)); } },
    h('div', { class: 'rtile-img' }, h('img', { src: r.thumb || recipeArtUrl(r), alt: '', loading: 'lazy', decoding: 'async' }), r.traditional ? h('span', { class: 'rtile-badge' }, tradMark(r)) : null),
    h('div', { class: 'rtile-name' }, r.name || 'Bez nazwy'),
    h('div', { class: 'rtile-meta' }, metaLine(r)));
}

/** Karta receptury (lista, ekran startowy). */
export function recipeCard(r, { onFav } = {}) {
  const activeTime = (r.prepTime || 0) + (r.cookTime || 0);
  const ingredients = (r.sections || []).flatMap((s) => s.ingredients || []).filter((i) => i.name).slice(0, 4);
  return h('article', { class: 'rcard ref-recipe-card' },
    h('a', { class: 'rcard-main', href: '#/recipe/' + encodeURIComponent(r.id), 'aria-label': r.name,
      onClick: (e) => { e.preventDefault(); navigate('/recipe/' + encodeURIComponent(r.id)); } },
      h('div', { class: 'ref-card-photo' },
        h('img', { src: r.photo || r.thumb || recipeArtUrl(r), alt: '', loading: 'lazy', decoding: 'async' }),
        h('div', { class: 'ref-card-photo-glow', 'aria-hidden': 'true' })),
      h('div', { class: 'ref-card-body' },
        h('div', { class: 'ref-card-topline' },
          h('span', { class: 'ref-card-category' }, catName(r.category)),
          r.traditional ? h('span', { class: 'ref-card-trad' }, icon('star', 13)) : null),
        h('div', { class: 'ref-card-title' }, r.name || 'Bez nazwy'),
        h('div', { class: 'ref-card-metrics' },
          r.rating ? h('span', { class: 'ref-rating' }, icon('star', 14), fmtNum(r.rating, 1)) : null,
          activeTime ? h('span', null, icon('clock', 14), fmtMinutes(activeTime)) : null,
          r.calories ? h('span', null, fmtNum(r.calories, 0) + ' kcal') : null),
        ingredients.length ? h('div', { class: 'ref-card-ingredients' },
          ingredients.map((i) => h('span', { class: 'ref-mini-ingredient', title: i.name }, i.name))) : null,
        h('div', { class: 'ref-card-footer' },
          h('span', null, 'Pokaż więcej szczegółów', icon('down', 14)),
          heartBtn(r, onFav))),
      h('span', { class: 'ref-card-tap', 'aria-hidden': 'true' })));
}
export function sectionHead(title, { action, onAction, count } = {}) {
  return h('div', { class: 'sechead' },
    h('h2', null, title, count != null ? h('span', { class: 'count' }, String(count)) : null),
    action ? h('button', { type: 'button', class: 'linkbtn', onClick: onAction }, action, icon('right', 16)) : null);
}

/** Ilość składnika do wyświetlenia: { num: '1000', unit: 'g' } albo { num: '', unit: 'do smaku' }. */
export function qtyParts(ing) {
  if (ing.amount == null || !Number.isFinite(ing.amount)) return { num: '', unit: 'do smaku' };
  return { num: fmtAmount(ing.amount), unit: ing.unit === 'szt.' ? 'szt.' : ing.unit || '' };
}

/** Receptura jako czysty tekst (kopiowanie, udostępnianie). */
export function recipeToText(r) {
  const L = [r.name];
  const meta = [];
  if (r.servings) meta.push(`Porcje: ${r.servings}`);
  if (r.yieldAmount) meta.push(`Wydajność: ${fmtAmount(r.yieldAmount)} ${r.yieldUnit}`);
  if (r.prepTime) meta.push(`Przygotowanie: ${fmtMinutes(r.prepTime)}`);
  if (r.cookTime) meta.push(`Gotowanie: ${fmtMinutes(r.cookTime)}`);
  if (r.fermentTime) meta.push(`Fermentacja: ${fmtMinutes(r.fermentTime)}`);
  if (r.temperature) meta.push(`Temperatura: ${r.temperature}`);
  if (meta.length) L.push(meta.join(' · '));
  if (r.description) L.push('', r.description);
  L.push('', 'SKŁADNIKI');
  r.sections.forEach((s) => {
    if (s.name) L.push('', s.name + ':');
    s.ingredients.forEach((i) => {
      const q = qtyParts(i);
      L.push(`- ${i.name}${q.num || q.unit ? ' — ' + [q.num, q.unit].filter(Boolean).join(' ') : ''}${i.percent != null ? ` (${fmtNum(i.percent, 2)}%)` : ''}`);
    });
  });
  if (r.steps.length) { L.push('', 'PRZYGOTOWANIE'); r.steps.forEach((s, n) => L.push(`${n + 1}. ${s.text}`)); }
  if (r.notes) L.push('', 'UWAGI', r.notes);
  if (r.sourceUrl || r.source) L.push('', `Źródło: ${[r.source, r.sourceUrl].filter(Boolean).join(' — ')}`);
  return L.join('\n');
}
