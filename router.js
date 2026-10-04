/* ==========================================================================
   router.js — prosty router oparty o hash (#/ścieżka), działa na GitHub Pages
   bez konfiguracji serwera. Pamięta pozycję przewijania każdej ścieżki.
   ========================================================================== */
import { closeAllOverlays } from './ui.js';

const routes = [];
const scrollMemory = new Map();
let current = null;      // { path, view }
let mountEl = null;
let onChange = null;
let navDepth = 0;        // ile kroków „w głąb” zrobiono w tej sesji (do goBack)

/** route('/recipe/:id', (params, query) => ({ el, destroy?, onShow? }), { tab:'recipes', tabs:true }) */
export function route(pattern, render, meta = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z]+)/gi, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ re, keys, render, meta });
}

export const currentPath = () => (location.hash.replace(/^#/, '') || '/').split('?')[0] || '/';
const currentQuery = () => new URLSearchParams((location.hash.split('?')[1]) || '');

/** Przejście do ścieżki. replace=true nie dodaje wpisu do historii (np. zakładki). */
export function navigate(path, { replace = false } = {}) {
  const target = '#' + path;
  if (location.hash === target) { render(); return; }
  if (replace) { navDepth = 0; location.replace(target); }
  else { navDepth++; location.hash = target; }
}

/** Wstecz: jeśli w tej sesji były kroki w głąb — history.back(), inaczej ścieżka zapasowa. */
export function goBack(fallback = '/') {
  if (navDepth > 0) { navDepth--; history.back(); }
  else navigate(fallback, { replace: true });
}

export function startRouter(mount, changed) {
  mountEl = mount;
  onChange = changed;
  window.addEventListener('hashchange', render);
  render();
}

/** Wymusza ponowne narysowanie bieżącego widoku (np. po zmianie trybu/motywu). */
export function rerender() { render(true); }

function leave() {
  if (!current) return;
  const sc = mountEl.querySelector('.scroll');
  if (sc) scrollMemory.set(current.path, sc.scrollTop);
  try { current.view.destroy && current.view.destroy(); } catch (e) { console.error(e); }
  current = null;
}

function render(keepScroll) {
  const path = location.hash.replace(/^#/, '') || '/';   // razem z ?query
  if (current && current.path === path && keepScroll !== true) return;
  const prevScroll = keepScroll === true && mountEl.querySelector('.scroll') ? mountEl.querySelector('.scroll').scrollTop : null;
  leave();
  closeAllOverlays();
  let matched = null, params = {};
  const bare = path.split('?')[0] || '/';
  for (const r of routes) {
    const m = bare.match(r.re);
    if (m) { matched = r; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; }
  }
  if (!matched) { navigate('/', { replace: true }); return; }
  let view;
  try { view = matched.render(params, currentQuery()); }
  catch (e) {
    console.error(e);
    const d = document.createElement('div');
    d.className = 'screen';
    d.innerHTML = '<div class="empty"><div class="empty-emoji">⚠️</div><h2>Ups, coś poszło nie tak</h2><p class="muted">Dane są bezpieczne. Wróć na ekran startowy.</p><a class="btn primary" href="#/">Start</a></div>';
    view = { el: d };
  }
  current = { path, view, meta: matched.meta };
  mountEl.replaceChildren(view.el);
  view.el.classList.add('enter');
  const sc = mountEl.querySelector('.scroll');
  const saved = prevScroll != null ? prevScroll : scrollMemory.get(path);
  if (sc && saved) { sc.scrollTop = saved; requestAnimationFrame(() => { sc.scrollTop = saved; }); }
  if (view.onShow) view.onShow();
  if (onChange) onChange(path, matched.meta);
}
