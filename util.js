/* ==========================================================================
   util.js — czyste funkcje pomocnicze (bez DOM, bez IndexedDB)
   Liczby, jednostki, daty, formatowanie po polsku.
   ========================================================================== */

export const APP_VERSION = '1.7.0';

/** Stabilne ID z prefiksem (rcp_, sec_, ing_, stp_, cat_, shp_, his_). */
export function uid(prefix = '') {
  let r;
  if (globalThis.crypto && crypto.randomUUID) r = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  else r = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  return prefix + r;
}

/* ---------- Liczby ---------- */

const VULGAR = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };

/** Parsuje "1,5", "1.5", "1/2", "1 1/2", "½" → number albo null. */
export function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, (m) => ' ' + VULGAR[m]).replace(/\s+/g, ' ').trim();
  let m;
  if ((m = s.match(/^(\d+) (\d+)\/(\d+)$/))) return m[3] === '0' ? null : +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[2] === '0' ? null : m[1] / m[2];
  s = s.replace(/\s/g, '').replace(',', '.');
  if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return parseFloat(s);
  return null;
}

function trimZeros(s) {
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

/** Liczba z przecinkiem, max `dec` miejsc, bez zbędnych zer. */
export function fmtNum(n, dec = 2) {
  if (n == null || !Number.isFinite(n)) return '';
  const p = 10 ** dec;
  return trimZeros((Math.round(n * p) / p).toFixed(dec));
}

/** Ilość składnika — adaptacyjna precyzja (2 g → "2", 0,2 → "0,2", 1032,5 → "1033"). */
export function fmtAmount(n) {
  if (n == null || !Number.isFinite(n)) return '';
  const a = Math.abs(n);
  return fmtNum(n, a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3);
}

export const fmtPct = (n) => (n == null || !Number.isFinite(n) ? '' : fmtNum(n, Math.abs(n) < 1 ? 2 : 1) + '%');

export function fmtMoney(n, cur = 'zł') {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(2).replace('.', ',') + '\u00a0' + cur;
}

/** minuty → "45 min", "1 h 30 min", "48 h" */
export function fmtMinutes(min) {
  if (!min || min <= 0) return '';
  min = Math.round(min);
  if (min < 60) return min + ' min';
  const h = Math.floor(min / 60), m = min % 60;
  return h + ' h' + (m ? ' ' + m + ' min' : '');
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return (h ? h + ':' + p(m) : m) + ':' + p(s);
}

/* ---------- Daty ---------- */
const p2 = (n) => String(n).padStart(2, '0');
export function fmtDate(ts, withYear = false) {
  const d = new Date(ts);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}${withYear ? '.' + d.getFullYear() : ''}`;
}
export function fmtDateTime(ts) {
  const d = new Date(ts);
  const same = d.getFullYear() === new Date().getFullYear();
  return `${fmtDate(ts, !same)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/* ---------- Tekst ---------- */

/** Normalizacja do wyszukiwania: małe litery, bez polskich znaków. */
export function norm(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
export const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Flaga kraju (emoji) z kodu ISO-3166 alfa-2. */
export function flagEmoji(code) {
  if (!code || code.length !== 2) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/* ---------- Jednostki ---------- */

export const UNITS = ['g', 'kg', 'ml', 'l', 'szt.', 'łyżeczka', 'łyżka', 'szczypta', 'porcja', '%'];

// Przybliżenie: 1 ml ≈ 1 g. Łyżka 15, łyżeczka 5, szczypta 0,3.
const UF = { g: 1, kg: 1000, ml: 1, l: 1000, 'łyżeczka': 5, 'łyżka': 15, szczypta: 0.3 };
export const isWV = (u) => Object.prototype.hasOwnProperty.call(UF, u);
export const toGrams = (amount, unit) => (isWV(unit) && Number.isFinite(amount) ? amount * UF[unit] : null);
export const fromGrams = (g, unit) => g / UF[unit];
export const unitFactor = (u) => UF[u];

/** Konwersja wydajności/ilości między jednostkami (g↔kg, ml↔l, ~g↔ml). null gdy niezgodne. */
export function convertAmount(v, from, to) {
  if (from === to) return v;
  const wv = ['g', 'kg', 'ml', 'l'];
  if (wv.includes(from) && wv.includes(to)) return (v * UF[from]) / UF[to];
  return null;
}

/* ---------- Różne ---------- */

export function debounce(fn, ms = 250) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);

export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch (_) { /* fallback poniżej */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (_) { return false; }
}
