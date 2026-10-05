/* ==========================================================================
   calc-kit.js — wspólne klocki kalkulatorów i narzędzi.
   ========================================================================== */
import { h, screen, iconBtn } from './ui.js';
import { goBack } from './router.js';
import { kv } from './db.js';
import { debounce } from './util.js';

export const calcScreen = (title, ...content) => screen({ title, left: iconBtn('left', 'Kalkulatory', () => goBack('/calc')), cls: 'calc' }, ...content);

/** Stan kalkulatora z pamięcią w IndexedDB (calc:<klucz>). */
export function memo(key, defaults) {
  const st = { ...defaults };
  const save = debounce(() => { kv.set('calc:' + key, st).catch(() => {}); }, 400);
  const ready = kv.get('calc:' + key).then((v) => { if (v && typeof v === 'object') Object.assign(st, v); }).catch(() => {});
  return { st, save, ready };
}

export const col = (el) => h('div', { class: 'grow' }, el);
export const result = (label, value, unit = '', cls = '') =>
  h('div', { class: 'result ' + cls }, h('span', { class: 'result-k' }, label), h('span', { class: 'result-v num' }, value, unit ? h('small', null, ' ' + unit) : null));
