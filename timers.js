/* ==========================================================================
   timers.js — wiele minutników jednocześnie. Czasy końca są zapisane w
   localStorage, więc po przeładowaniu/powrocie do aplikacji nadal odliczają.
   Dźwięk i wibracja działają, gdy aplikacja jest na ekranie (iOS usypia
   JavaScript w tle — dlatego tryb „Gotuj” trzyma ekran włączony).
   ========================================================================== */
import { h, icon, button, iconBtn, toast, openSheet, numInput, textInput, field } from './ui.js';
import { uid, fmtClock } from './util.js';

const KEY = 'k:timers';
let timers = load();
let handle = null;
let audioCtx = null;
const subs = new Set();

function load() {
  try { return (JSON.parse(localStorage.getItem(KEY) || '[]') || []).filter((t) => t && t.end); } catch (_) { return []; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(timers)); } catch (_) { /* tryb prywatny */ } }
const notify = () => subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

export const listTimers = () => timers;
export const onTimers = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const remaining = (t) => Math.max(0, Math.ceil((t.end - Date.now()) / 1000));

function ensureAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (_) { /* brak audio */ }
}

export function beep(times = 6) {
  ensureAudio();
  if (audioCtx) {
    const t0 = audioCtx.currentTime;
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = i % 2 ? 988 : 784;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.32);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.32 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.32 + 0.28);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0 + i * 0.32); o.stop(t0 + i * 0.32 + 0.3);
    }
  }
  try { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]); } catch (_) { /* */ }
}

function alarm(t) {
  beep();
  toast(`Minutnik: koniec${t.label ? ' — ' + t.label : ''}!`, { sticky: true, action: { label: 'OK', fn: () => stopTimer(t.id) } });
}

function ensureTick() {
  if (timers.length && !handle) handle = setInterval(tick, 250);
  if (!timers.length && handle) { clearInterval(handle); handle = null; }
}

function tick() {
  let changed = false;
  for (const t of timers) {
    if (!t.done && Date.now() >= t.end) { t.done = true; changed = true; alarm(t); }
  }
  if (changed) save();
  notify();
}

export function startTimer(seconds, label = '') {
  ensureAudio();   // musi nastąpić po geście użytkownika (iOS)
  const t = { id: uid('tmr_'), label, end: Date.now() + seconds * 1000, total: seconds, done: false };
  timers.push(t);
  save(); ensureTick(); notify();
  return t;
}
export function stopTimer(id) {
  timers = timers.filter((t) => t.id !== id);
  save(); ensureTick(); notify();
}
export function addTime(id, seconds) {
  const t = timers.find((x) => x.id === id);
  if (!t) return;
  if (t.done) { t.end = Date.now() + seconds * 1000; t.total = seconds; t.done = false; }
  else { t.end += seconds * 1000; t.total += seconds; }
  save(); ensureTick(); notify();
}
export function clearAllTimers() { timers = []; save(); ensureTick(); notify(); }

/** Wywołaj raz na starcie: wznawia odliczanie i zgłasza minutniki, które skończyły się w tle. */
export function initTimers() {
  const ended = timers.filter((t) => !t.done && Date.now() >= t.end);
  ended.forEach((t) => { t.done = true; });
  if (ended.length) { save(); toast(`Minutnik zakończony: ${ended.map((t) => t.label || fmtClock(t.total)).join(', ')}`, { sticky: true, action: { label: 'OK', fn: () => {} } }); }
  ensureTick();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  notify();
}

/* ---------- Pastylka (widoczna na każdym ekranie, gdy coś odlicza) ---------- */

export function mountTimerPill(host, onOpen) {
  const pill = h('button', { type: 'button', class: 'timer-pill', hidden: true, 'aria-label': 'Minutniki', onClick: onOpen });
  host.appendChild(pill);
  const paint = () => {
    if (!timers.length) { pill.hidden = true; return; }
    const done = timers.filter((t) => t.done);
    const running = timers.filter((t) => !t.done).sort((a, b) => a.end - b.end);
    pill.hidden = false;
    pill.classList.toggle('done', done.length > 0);
    const t = done[0] || running[0];
    pill.replaceChildren(icon('timer', 20),
      h('span', { class: 'tp-time num' }, done.length ? 'Koniec!' : fmtClock(remaining(t))),
      t.label ? h('span', { class: 'tp-label' }, t.label) : null,
      timers.length > 1 ? h('span', { class: 'tp-count' }, '+' + (timers.length - 1)) : null);
    pill.setAttribute('aria-label', `Minutniki: ${timers.length}. ${done.length ? 'Zakończony' : 'Następny za ' + fmtClock(remaining(t))}`);
  };
  onTimers(paint);
  paint();
}

/* ---------- Arkusz minutników ---------- */

const PRESETS = [[1, '1 min'], [3, '3 min'], [5, '5 min'], [8, '8 min'], [10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 h']];

export function openTimersSheet() {
  let label = '', minutes = null;
  const list = h('div', { class: 'timer-list' });
  let unsub = null;

  const row = (t) => {
    const left = remaining(t);
    const pct = t.done ? 100 : Math.min(100, Math.max(0, 100 - (left / Math.max(1, t.total)) * 100));
    return h('div', { class: 'timer-row' + (t.done ? ' done' : '') },
      h('div', { class: 'timer-info' },
        h('div', { class: 'timer-big num' }, t.done ? 'Koniec!' : fmtClock(left)),
        h('div', { class: 'muted small' }, t.label || fmtClock(t.total)),
        h('div', { class: 'progress thin' }, h('span', { class: 'bar', style: { width: pct + '%' } }))),
      h('div', { class: 'row gap' },
        button(t.done ? 'Jeszcze 1 min' : '+1 min', { sm: true, onClick: () => addTime(t.id, 60) }),
        button(t.done ? 'OK' : 'Stop', { sm: true, kind: t.done ? 'primary' : 'ghost', onClick: () => stopTimer(t.id) })));
  };
  const paint = () => {
    list.replaceChildren(...(timers.length ? timers.map(row) : [h('p', { class: 'muted pad' }, 'Brak aktywnych minutników. Wybierz czas poniżej.')]));
  };

  const labelIn = textInput({ value: '', label: 'Nazwa minutnika', placeholder: 'np. makaron, ciasto…', capitalize: 'sentences', onInput: (v) => { label = v; } });
  const minIn = numInput({ value: null, label: 'Własny czas w minutach', dec: 2, placeholder: 'np. 7,5', onInput: (v) => { minutes = v; } });

  openSheet({
    title: 'Minutniki', variant: 'sheet',
    body: h('div', { class: 'stack' }, list,
      h('div', { class: 'field-label' }, 'Nowy minutnik'),
      field('Nazwa (opcjonalnie)', labelIn),
      h('div', { class: 'preset-grid' }, PRESETS.map(([m, l]) => h('button', { type: 'button', class: 'btn', onClick: () => { startTimer(m * 60, label.trim()); labelIn.value = ''; label = ''; } }, l))),
      h('div', { class: 'row gap' }, h('div', { class: 'grow' }, minIn),
        button('Start', { kind: 'primary', icon: 'timer', onClick: () => {
          if (!(minutes > 0)) { toast('Wpisz liczbę minut', { type: 'error' }); return; }
          startTimer(Math.round(minutes * 60), label.trim()); minIn.value = ''; minutes = null; labelIn.value = ''; label = '';
        } })),
      h('p', { class: 'muted small' }, 'Dźwięk zadziała, gdy aplikacja jest na ekranie. Minutniki są zapamiętane i odliczają dalej po powrocie do aplikacji.')),
    actions: [{ label: 'Zamknij', kind: 'ghost' }],
    onClose: () => { if (unsub) unsub(); },
  });
  paint();
  unsub = onTimers(paint);
}
