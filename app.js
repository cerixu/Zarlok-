/* ==========================================================================
   app.js — start aplikacji: baza, ustawienia, motyw, nawigacja dolna,
   obsługa klawiatury iOS (visualViewport), trasy, service worker.
   ========================================================================== */
import { openDB, storageMode } from './db.js';
import { loadAll, state, subscribe, getSetting } from './recipes.js';
import { h, icon, toast, $ } from './ui.js';
import { route, startRouter, navigate } from './router.js';
import { registerSW, requestPersist } from './pwa.js';
import { mountTimerPill, initTimers, openTimersSheet } from './timers.js';

import { startView } from './views-start.js';
import { recipesView } from './views-recipes.js';
import { detailView } from './views-detail.js';
import { editorView } from './views-editor.js';
import { cookView } from './views-cook.js';
import { calcView } from './views-calc.js';
import { shoppingView, pendingCount } from './shopping.js';
import { importView } from './views-import.js';
import { settingsView } from './views-settings.js';
import { guideView } from './views-guide.js';
import { searchView } from './views-search.js';

const root = document.documentElement;

/* ---------- Motyw, tryb, rozmiary ---------- */

const BG = { light: { pro: '#f4f4f1', amateur: '#eef7f0' }, dark: { pro: '#111214', amateur: '#0f1a13' } };
const dark = matchMedia('(prefers-color-scheme: dark)');

function applyAppearance() {
  const theme = getSetting('theme'), mode = getSetting('mode'), tap = getSetting('tapSize'), ts = getSetting('textScale'), glass = getSetting('glass');
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-mode', mode);
  root.setAttribute('data-tap', tap);
  root.style.setProperty('--ts', String((ts || 100) / 100));
  root.style.setProperty('--glass', String(Math.min(100, Math.max(0, glass == null ? 70 : glass)) / 100));
  try {
    localStorage.setItem('k:theme', theme); localStorage.setItem('k:mode', mode);
    localStorage.setItem('k:tap', tap); localStorage.setItem('k:ts', String(ts)); localStorage.setItem('k:glass', String(glass));
  } catch (_) { /* tryb prywatny */ }
  // Kolor paska systemowego zgodny z faktycznie wybranym motywem (nie tylko z systemowym).
  const eff = theme === 'auto' ? (dark.matches ? 'dark' : 'light') : theme;
  const color = BG[eff][mode] || BG[eff].pro;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.setAttribute('content', color); m.removeAttribute('media'); });
}
dark.addEventListener && dark.addEventListener('change', () => { if (getSetting('theme') === 'auto') applyAppearance(); });

/* ---------- Dolna nawigacja ---------- */

const TABS = [
  ['start', 'Start', 'home', '/'],
  ['recipes', 'Receptury', 'book', '/recipes'],
  ['calc', 'Kalkulatory', 'calc', '/calc'],
  ['shopping', 'Zakupy', 'cart', '/shopping'],
  ['settings', 'Ustawienia', 'sliders', '/settings'],
];

function buildTabbar() {
  const bar = $('#tabbar');
  bar.replaceChildren(...TABS.map(([id, label, ico, path]) => {
    const a = h('a', { href: '#' + path, class: 'tab', dataset: { tab: id }, 'aria-label': label,
      onClick: (e) => { e.preventDefault(); navigate(path, { replace: true }); } },
      h('span', { class: 'tab-ico' }, icon(ico, 24), id === 'shopping' ? h('span', { class: 'badge', id: 'cart-badge', hidden: true }) : null),
      h('span', { class: 'tab-label' }, label));
    return a;
  }));
  updateBadge();
}

function updateBadge() {
  const b = $('#cart-badge');
  if (!b) return;
  const n = pendingCount();
  b.textContent = n > 99 ? '99+' : String(n);
  b.hidden = n === 0;
  const a = $('.tab[data-tab="shopping"]');
  if (a) a.setAttribute('aria-label', n ? `Zakupy, do kupienia: ${n}` : 'Zakupy');
}

function setActiveTab(meta) {
  document.body.classList.toggle('no-tabs', meta.tabs === false);
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === meta.tab;
    t.classList.toggle('on', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
}

/* ---------- Klawiatura ekranowa i rozmiar widoku (iOS) ---------- */

function watchViewport() {
  const vv = window.visualViewport;
  const update = () => {
    if (!vv) return;
    const kb = window.innerHeight - vv.height > 150;
    document.body.classList.toggle('kb-open', kb);
    if (kb) {
      root.style.setProperty('--app-h', vv.height + 'px');
      root.style.setProperty('--vv-top', vv.offsetTop + 'px');
    } else {
      root.style.removeProperty('--app-h');
      root.style.removeProperty('--vv-top');
    }
  };
  if (vv) { vv.addEventListener('resize', update); vv.addEventListener('scroll', update); }
  window.addEventListener('orientationchange', () => setTimeout(update, 250));
  window.addEventListener('resize', update);
  // Pole, w którym piszemy, zawsze ma być widoczne nad klawiaturą.
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    setTimeout(() => { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { /* */ } }, 320);
  });
  // Safari↔aplikacja: po powrocie odśwież wymiary.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(update, 100); });
  window.addEventListener('pageshow', () => setTimeout(update, 50));
  update();
}

/* ---------- Offline ---------- */

function watchNetwork() {
  const set = () => root.classList.toggle('offline', !navigator.onLine);
  window.addEventListener('offline', () => { set(); toast('Brak sieci — aplikacja działa normalnie offline'); });
  window.addEventListener('online', () => { set(); toast('Połączenie wróciło'); });
  set();
}

/* ---------- Trasy ---------- */

route('/', () => startView(), { tab: 'start' });
route('/recipes', (p, q) => recipesView(q), { tab: 'recipes' });
route('/recipe/:id', (p) => detailView(p), { tab: 'recipes' });
route('/edit/:id', (p) => editorView(p), { tab: 'recipes', tabs: false });
route('/new', (p, q) => editorView({ id: null }, q), { tab: 'recipes', tabs: false });
route('/cook/:id', (p) => cookView(p), { tab: 'recipes', tabs: false });
route('/guide/:id', (p) => guideView(p), { tab: 'recipes', tabs: false });
route('/search', (p, q) => searchView(q), { tab: 'recipes' });
route('/import', (p, q) => importView(q), { tab: 'recipes' });
route('/calc', () => calcView({}), { tab: 'calc' });
route('/calc/:kind', (p, q) => calcView(p, q), { tab: 'calc' });
route('/shopping', () => shoppingView(), { tab: 'shopping' });
route('/settings', () => settingsView(), { tab: 'settings' });

/* ---------- Start ---------- */

function fatal(err) {
  console.error(err);
  const bootEl = $('#boot');
  if (bootEl) bootEl.remove();
  $('#view').replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'scroll' }, h('div', { class: 'content' },
    h('div', { class: 'empty' }, h('div', { class: 'empty-emoji' }, '⚠️'), h('h2', null, 'Nie mogę otworzyć bazy danych'),
      h('p', { class: 'muted' }, 'Aplikacja nie mogła otworzyć magazynu danych. Spróbuj ponownie po zamknięciu innych kart tej aplikacji; jeżeli problem dotyczy Safari, Żarłok podczas normalnego startu korzysta z magazynu zgodności zamiast zatrzymywać aplikację.'),
      h('p', { class: 'muted small' }, String(err && err.message || err)))))));
}

async function boot() {
  try {
    await openDB();
    await loadAll();
  } catch (e) { fatal(e); return; }

  applyAppearance();
  const storeMode = storageMode();
  if (storeMode !== 'indexeddb') {
    const label = storeMode === 'fallback-cache' ? 'Cache API' : storeMode === 'fallback-localStorage' ? 'localStorage' : 'pamięć sesyjna';
    toast(`Tryb zgodności pamięci: ${label}. Zrób kopię JSON.`, { type: 'warning', ms: 5000 });
  }
  subscribe((type) => {
    if (type === 'settings') applyAppearance();
    if (type === 'shopping') updateBadge();
  });
  buildTabbar();
  watchViewport();
  watchNetwork();
  startRouter($('#view'), (path, meta) => { setActiveTab(meta); updateBadge(); });
  const bootEl = $('#boot');
  if (bootEl) { bootEl.classList.add('gone'); setTimeout(() => bootEl.remove(), 350); }

  mountTimerPill($('#app'), openTimersSheet);
  initTimers();
  requestPersist();
  registerSW();
  window.__kucharzyna = { state, ready: true };
}

boot();
