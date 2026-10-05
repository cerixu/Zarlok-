/* ==========================================================================
   ui.js — pomocniki DOM: h(), ikony, toast, okna modalne / arkusze, formularze.
   Zero alert()/confirm() — wszystko własne, dostępne (aria, focus, Escape).
   ========================================================================== */
import { fmtNum, parseNum } from './util.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const PROP_KEYS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'readOnly', 'multiple', 'indeterminate']);

/** Tworzy element: h('div', {class:'x', onClick: fn}, 'tekst', child, [children]) */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') el.className = v;
    else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'ref') v(el);
    else if (/^on[A-Z]/.test(k)) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') value = v;
    else if (PROP_KEYS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  if (value !== undefined) el.value = value;
  return el;
}

/* ---------- Ikony (SVG 24×24, obrys) ---------- */
const ICONS = {
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  shuffle: '<path d="M3 7h3c5 0 5 10 10 10h5"/><path d="M3 17h3c1.5 0 2.6-.8 3.5-2"/><path d="M13.5 9c.9-1.2 2-2 3.5-2h4"/><path d="M18 4l3 3-3 3"/><path d="M18 14l3 3-3 3"/>',
  ruler: '<rect x="2" y="8" width="20" height="8" rx="2"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/>',
  scale: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M8 8a4 4 0 0 1 8 0"/><path d="M12 15l2.5-2.5"/>',
  drop: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
  flame: '<path d="M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.5 1.1.5 2.1h6c0-1 0-1.7.5-2.1A6 6 0 0 0 12 3z"/>',
  fridge: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M6 10h12M9 5v2M9 13v3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  wave: '<path d="M2 12h3l2-6 4 12 3-9 2 3h6"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  book: '<path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h11"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h9.3a1 1 0 0 0 1-.8L21 7H6"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  chef: '<path d="M6 14a4 4 0 0 1 1-7.9A5 5 0 0 1 17 6a4 4 0 0 1 1 8"/><path d="M6 14v6h12v-6M6 17h12"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  up: '<path d="M5 15l7-7 7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  swap: '<path d="M4 8h12M12 4l4 4-4 4"/><path d="M20 16H8M12 12l-4 4 4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  share: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  download: '<path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 19h14"/>',
  upload: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 19h14"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
  sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  coins: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9a3 3 0 0 0-2.5-1.3c-1.7 0-3 .9-3 2.3s1.3 2 3 2.4 3 1 3 2.4-1.3 2.3-3 2.3A3 3 0 0 1 9.5 15M12 6v1.7M12 16.3V18"/>',
  percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/>',
  pizza: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="10" r="1.2"/><circle cx="11" cy="15" r="1.2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  barcode: '<path d="M4 5v14M7 5v14M10 5v14M14 5v14M17 5v14M20 5v14"/><path d="M2 3h20M2 21h20"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
};

export function icon(name, size = 22) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.9'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  s.classList.add('ico');
  s.innerHTML = ICONS[name] || '';
  return s;
}

/* ---------- Przyciski ---------- */

/** button('Zapisz', {kind:'primary', icon:'check', onClick, block, lg, sm}) */
export function button(label, o = {}) {
  const cls = ['btn', o.kind || '', o.block ? 'block' : '', o.lg ? 'lg' : '', o.sm ? 'sm' : '', o.cls || ''].filter(Boolean).join(' ');
  return h('button', { type: 'button', class: cls, onClick: o.onClick, disabled: o.disabled, 'aria-label': o.aria, title: o.title },
    o.icon ? icon(o.icon, o.iconSize || 20) : null, label ? h('span', null, label) : null);
}

/** Przycisk-ikona z obowiązkowym aria-label. */
export function iconBtn(name, label, onClick, cls = '') {
  return h('button', { type: 'button', class: 'iconbtn ' + cls, 'aria-label': label, title: label, onClick }, icon(name, 24));
}

/* ---------- Ekran (nagłówek + przewijana treść) ---------- */

export function screen({ title, left, right, sub, cls = '', large = true }, ...content) {
  if (sub) large = false;      // ekrany z wyszukiwarką/zakładkami: tytuł mały, wyśrodkowany (jak w iOS przy pasku wyszukiwania)
  const mini = h('div', { class: 'topbar-mini', 'aria-hidden': large ? 'true' : null }, title);
  const row = h('div', { class: 'topbar-row' }, left || h('span', { class: 'nav-spacer' }), mini, right || h('span', { class: 'nav-spacer' }));
  const top = h('header', { class: 'topbar' + (large ? '' : ' compact') + (sub ? ' has-sub' : '') }, row, sub || null);
  const big = large ? h('h1', { class: 'topbar-title' }, title) : null;
  const inner = h('div', { class: 'content' }, ...content);
  const scroll = h('div', { class: 'scroll' }, big, inner);
  const el = h('section', { class: 'screen ' + cls }, scroll, top);   // pasek nad treścią: przewijana treść „wchodzi” pod szkło
  // Wysokość paska (zmienia się z wyszukiwarką/zakładkami) → odstęp na górze przewijanej treści.
  const measure = () => el.style.setProperty('--top-h', top.offsetHeight + 'px');
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(top);
  requestAnimationFrame(measure);
  scroll.addEventListener('scroll', () => {
    const limit = big ? Math.max(24, big.offsetTop + big.offsetHeight * 0.55 - (parseFloat(el.style.getPropertyValue('--top-h')) || 0)) : 2;
    top.classList.toggle('scrolled', scroll.scrollTop > limit);
  }, { passive: true });
  const setTitle = (t) => { mini.textContent = t; if (big) big.textContent = t; };
  return { el, top, scroll, content: inner, setTitle };
}

export const emptyState = (emoji, title, text, ...actions) =>
  h('div', { class: 'empty' }, h('div', { class: 'empty-emoji', 'aria-hidden': 'true' }, emoji), h('h2', null, title),
    text ? h('p', { class: 'muted' }, text) : null, actions.length ? h('div', { class: 'row wrap center' }, actions) : null);

/* ---------- Toast ---------- */

export function toast(msg, o = {}) {
  const box = $('#toasts');
  if (!box) return { dismiss() {} };
  const t = h('div', { class: 'toast ' + (o.type || ''), role: 'status' }, h('span', { class: 'toast-msg' }, msg));
  let timer;
  const dismiss = () => { clearTimeout(timer); t.classList.remove('in'); setTimeout(() => t.remove(), 200); };
  if (o.action) t.appendChild(h('button', { type: 'button', class: 'toast-act', onClick: () => { dismiss(); o.action.fn(); } }, o.action.label));
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  requestAnimationFrame(() => t.classList.add('in'));
  if (!o.sticky) timer = setTimeout(dismiss, o.ms || (o.action ? 6000 : 2400));
  return { dismiss };
}

/* ---------- Arkusze i okna dialogowe ---------- */

const stack = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * openSheet({ title, body, actions:[{label, kind, onClick}], variant:'sheet'|'center', onClose })
 * onClick może zwrócić false (lub Promise<false>), by nie zamykać okna.
 */
export function openSheet({ title, body, actions = [], variant = 'sheet', onClose, dismissible = true, cls = '' }) {
  const prevFocus = document.activeElement;
  let closed = false;
  const close = (reason = 'api') => {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
    ov.classList.remove('in');
    setTimeout(() => ov.remove(), 180);
    if (!stack.length) document.body.classList.remove('modal-open');
    if (prevFocus && prevFocus.focus && document.contains(prevFocus)) { try { prevFocus.focus({ preventScroll: true }); } catch (_) { /* */ } }
    if (onClose) onClose(reason);
  };
  const bodyEl = h('div', { class: 'panel-body' }, body);
  const foot = actions.length ? h('div', { class: 'panel-foot' }, actions.map((a) => h('button', {
    type: 'button', class: 'btn ' + (a.kind || ''), disabled: a.disabled,
    onClick: async (e) => {
      const r = a.onClick ? await a.onClick(e) : undefined;
      if (r !== false && a.close !== false) close('action');
    },
  }, a.icon ? icon(a.icon, 20) : null, a.label))) : null;
  const panel = h('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Okno', tabindex: '-1' },
    title ? h('div', { class: 'panel-head' }, h('h2', null, title), dismissible ? iconBtn('x', 'Zamknij', () => close('x')) : null) : null,
    bodyEl, foot);
  const ov = h('div', { class: `overlay ${variant} ${cls}` }, h('div', { class: 'backdrop', onClick: dismissible ? () => close('backdrop') : null }), panel);
  const api = { close, panel, body: bodyEl, el: ov, dismissible };
  $('#overlays').appendChild(ov);
  stack.push(api);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => { ov.classList.add('in'); panel.focus({ preventScroll: true }); });
  return api;
}

export function closeAllOverlays() { [...stack].forEach((s) => s.close('route')); }

if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape' && top.dismissible) { e.preventDefault(); top.close('escape'); }
  if (e.key === 'Tab') {
    const f = [...top.panel.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === top.panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

/** Własne potwierdzenie (zamiast confirm()). Zwraca Promise<boolean>. */
export function confirmDialog({ title, message, confirmText = 'OK', cancelText = 'Anuluj', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    openSheet({
      title, variant: 'center', body: h('p', { class: 'dialog-msg' }, message),
      actions: [
        { label: cancelText, kind: 'ghost' },
        { label: confirmText, kind: danger ? 'danger' : 'primary', onClick: () => { result = true; } },
      ],
      onClose: () => resolve(result),
    });
  });
}

/** Własne pole tekstowe (zamiast prompt()). Zwraca Promise<string|null>. */
export function promptDialog({ title, label, value = '', placeholder = '', confirmText = 'OK', message, inputmode }) {
  return new Promise((resolve) => {
    let result = null;
    const input = h('input', { class: 'input', type: 'text', value, placeholder, autocomplete: 'off', inputmode, 'aria-label': label || title });
    const submit = () => { result = input.value.trim(); sh.close('action'); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    const sh = openSheet({
      title, variant: 'center',
      body: h('div', { class: 'stack' }, message ? h('p', { class: 'dialog-msg' }, message) : null, label ? h('label', { class: 'field-label' }, label) : null, input),
      actions: [{ label: 'Anuluj', kind: 'ghost' }, { label: confirmText, kind: 'primary', onClick: () => { result = input.value.trim(); } }],
      onClose: () => resolve(result),
    });
    setTimeout(() => { if (!/iPhone|iPad/.test(navigator.userAgent)) input.focus(); }, 60);
  });
}

/* ---------- Formularze ---------- */

export const field = (label, control, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);

export function textInput({ value = '', placeholder = '', onInput, label, cls = '', list, type = 'text', inputmode, capitalize = 'sentences' } = {}) {
  const el = h('input', { class: 'input ' + cls, type, value, placeholder, 'aria-label': label, autocomplete: 'off', autocapitalize: capitalize, list, inputmode, enterkeyhint: 'next' });
  if (onInput) el.addEventListener('input', () => onInput(el.value, el));
  return el;
}

export function autosize(el) {
  const fit = () => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 600) + 'px'; };
  el.addEventListener('input', fit);
  el.addEventListener('focus', fit);
  el._fit = fit;
  requestAnimationFrame(fit);
  return el;
}
export const autosizeAll = (root) => $$('textarea.auto', root).forEach((t) => t._fit && t._fit());

export function textArea({ value = '', placeholder = '', onInput, label, rows = 3, cls = '' } = {}) {
  const el = h('textarea', { class: 'input textarea auto ' + cls, rows, placeholder, 'aria-label': label, value, autocapitalize: 'sentences' });
  if (onInput) el.addEventListener('input', () => onInput(el.value, el));
  return autosize(el);
}

/** Pole liczbowe z przecinkiem dziesiętnym (klawiatura numeryczna iOS). */
export function numInput({ value = null, onInput, placeholder = '', label, dec = 3, cls = '' } = {}) {
  const el = h('input', { class: 'input num ' + cls, type: 'text', inputmode: 'decimal', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    'aria-label': label, placeholder, value: value == null ? '' : fmtNum(value, dec), enterkeyhint: 'done' });
  el.addEventListener('input', () => {
    const n = parseNum(el.value);
    el.classList.toggle('invalid', el.value.trim() !== '' && n == null);
    if (onInput) onInput(n, el);
  });
  el.addEventListener('focus', () => setTimeout(() => { try { el.select(); } catch (_) { /* */ } }, 0));
  return el;
}

/** options: ['a','b'] albo [['val','Etykieta'],…] */
export function selectEl(options, value, onChange, { label, cls = '' } = {}) {
  const el = h('select', { class: 'input select ' + cls, 'aria-label': label },
    options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v }, l); }));
  el.value = value == null ? '' : value;
  if (onChange) el.addEventListener('change', () => onChange(el.value));
  return el;
}

/** Przełącznik segmentowy (radio). */
export function segmented(options, value, onChange, { label, cls = '' } = {}) {
  const wrap = h('div', { class: 'seg ' + cls, role: 'group', 'aria-label': label });
  const paint = () => [...wrap.children].forEach((b) => { const on = b.dataset.v === String(value); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  options.forEach((o) => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    wrap.appendChild(h('button', { type: 'button', dataset: { v: String(v) }, onClick: () => { value = v; paint(); onChange(v); } }, l));
  });
  paint();
  return wrap;
}

export function switchEl(checked, onChange, label, hint) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: !!checked });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'switch-row' }, h('span', { class: 'switch-text' }, h('span', null, label), hint ? h('small', { class: 'muted' }, hint) : null),
    h('span', { class: 'switch' }, input, h('span', { class: 'track' })));
}

export const chip = (label, { on = false, onClick, cls = '', aria } = {}) =>
  h('button', { type: 'button', class: `chip ${on ? 'on' : ''} ${cls}`, 'aria-pressed': on, 'aria-label': aria, onClick }, label);

/* ---------- Skróty ---------- */
export const scrollTop = (el) => { if (el) el.scrollTop = 0; };

export function focusPreservingPaint(fn, root = document) {
  const active = document.activeElement;
  const isField = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
  if (!isField) return fn();
  const key = active.getAttribute('aria-label') || active.id || active.name || active.placeholder || '';
  const tag = active.tagName;
  const start = typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const end = typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
  const value = active.value;
  const result = fn();
  const restore = () => {
    if (document.contains(active)) return;
    const candidates = [...root.querySelectorAll('input,textarea,select')];
    const next = candidates.find((el) => el.tagName === tag && key && (el.getAttribute('aria-label') === key || el.id === key || el.getAttribute('name') === key || el.getAttribute('placeholder') === key));
    if (!next) return;
    if ('value' in next && next.value !== value) next.value = value;
    try { next.focus({ preventScroll: true }); if (start != null && typeof next.setSelectionRange === 'function') { const max = next.value.length; next.setSelectionRange(Math.min(start, max), Math.min(end ?? start, max)); } } catch (_) {}
  };
  queueMicrotask(restore); requestAnimationFrame(restore); return result;
}

export function focusLater(el) { setTimeout(() => { try { el.focus(); } catch (_) { /* */ } }, 30); }
