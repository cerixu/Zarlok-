/* ==========================================================================
   views-guide.js — „Prowadź mnie”: gotowanie krok po kroku, jeden krok na
   ekranie. Ekran „Przygotuj” (mise en place + porcje), potem kroki z
   automatycznie wykrytymi minutnikami i składnikami potrzebnymi w danym
   kroku, czytanie na głos, gesty przesunięcia, wznawianie od ostatniego
   kroku i ekran końcowy z oceną i notatką.
   ========================================================================== */
import { h, icon, screen, button, iconBtn, toast, openSheet, emptyState, textArea } from './ui.js';
import { navigate, goBack } from './router.js';
import { getRecipe, kv, patchRecipe, getSetting, setSetting, allIngredients } from './recipes.js';
import { scaleRecipe } from './calculator.js';
import { qtyParts } from './components.js';
import { ingredientArtUrl } from './art.js';
import { ingredientsInText } from './kitchen.js';
import { findTimes } from './views-cook.js';
import { startTimer, openTimersSheet } from './timers.js';
import { fmtNum, fmtMinutes, debounce } from './util.js';

/* ---------- Czytanie na głos ---------- */

let voice = null;
function pickVoice() {
  if (voice || !('speechSynthesis' in window)) return voice;
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => /^pl/i.test(v.lang)) || null;
  return voice;
}
export const speechSupported = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
function speak(text) {
  if (!speechSupported()) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pl-PL'; u.rate = 0.95;
    const v = pickVoice(); if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (_) { /* brak głosu */ }
}
const stopSpeaking = () => { try { if (speechSupported()) speechSynthesis.cancel(); } catch (_) { /* */ } };

/* ---------- Widok ---------- */

export function guideView({ id }) {
  const r0 = getRecipe(id);
  if (!r0) {
    const s = screen({ title: 'Prowadź mnie', large: false, left: iconBtn('x', 'Zamknij', () => goBack('/recipes')) },
      emptyState('🤷', 'Nie ma takiej receptury', '', button('Receptury', { kind: 'primary', onClick: () => navigate('/recipes', { replace: true }) })));
    return { el: s.el };
  }

  let st = { page: 0, factor: 1, have: {}, rating: 0 };
  let dir = 1;
  let loaded = false;
  const base = () => getRecipe(id) || r0;
  const view = () => scaleRecipe(base(), st.factor || 1);
  const stepsCount = () => base().steps.length;
  const lastPage = () => stepsCount() + 1;
  const saveSt = debounce(() => { kv.set('guide:' + id, st).catch(() => {}); }, 250);

  const speakBtn = iconBtn(getSetting('guideSpeak') ? 'volume' : 'mute', 'Czytaj kroki na głos', () => toggleSpeak(), getSetting('guideSpeak') ? 'active' : '');
  const s = screen({
    title: r0.name, large: false, cls: 'guide',
    left: iconBtn('x', 'Zamknij tryb prowadzenia', () => close()),
    right: h('div', { class: 'row' }, speechSupported() ? speakBtn : null, iconBtn('timer', 'Minutniki', () => openTimersSheet())),
  });
  const segs = h('div', { class: 'guide-progress', role: 'progressbar', 'aria-label': 'Postęp' });
  s.top.append(segs);
  const body = h('div', { class: 'guide-body' });
  s.content.append(body);
  const back = button('Wstecz', { icon: 'left', cls: 'guide-back', onClick: () => go(-1) });
  const next = button('Dalej', { kind: 'primary', lg: true, cls: 'guide-next', onClick: () => (st.page >= lastPage() ? finish() : go(1)) });
  const bar = h('div', { class: 'guidebar' }, back, next);
  s.el.append(bar);

  function toggleSpeak() {
    const on = !getSetting('guideSpeak');
    setSetting('guideSpeak', on);
    speakBtn.replaceChildren(icon(on ? 'volume' : 'mute', 22));
    speakBtn.classList.toggle('active', on);
    if (on) speakStep(); else stopSpeaking();
    toast(on ? 'Czytam kroki na głos' : 'Czytanie wyłączone');
  }

  const stepText = () => { const n = st.page - 1; return view().steps[n] ? view().steps[n].text : ''; };
  function speakStep() { if (st.page >= 1 && st.page <= stepsCount()) speak(`Krok ${st.page}. ${stepText()}`); else if (st.page === 0) speak(`${base().name}. Przygotuj składniki.`); else speak('Smacznego!'); }

  async function close() {
    stopSpeaking();
    saveSt.flush();
    goBack('/recipe/' + id);
  }

  function go(d) {
    if (st.page + d < 0) return;
    if (st.page + d > lastPage()) return;
    dir = d; st.page += d; saveSt(); paint(true);
    s.scroll.scrollTop = 0;
  }

  /* ----- Strony ----- */

  function paintProgress() {
    const total = lastPage() + 1;
    segs.setAttribute('aria-valuenow', st.page); segs.setAttribute('aria-valuemax', lastPage());
    segs.replaceChildren(...Array.from({ length: total }, (_, i) => h('button', { type: 'button', class: 'gseg' + (i < st.page ? ' done' : i === st.page ? ' now' : ''), 'aria-label': i === 0 ? 'Przygotowanie' : i === total - 1 ? 'Koniec' : `Krok ${i}`,
      onClick: () => { dir = i > st.page ? 1 : -1; st.page = i; saveSt(); paint(true); s.scroll.scrollTop = 0; } })));
  }

  function introPage() {
    const r = view();
    const ings = allIngredients(r).filter((i) => i.name);
    const checked = ings.filter((i) => st.have[i.id]).length;
    const sv = base().servings ? Math.round(base().servings * st.factor * 10) / 10 : null;
    const stepper = base().servings ? h('div', { class: 'stepper', role: 'group', 'aria-label': 'Liczba porcji' },
      iconBtn('minus', 'Mniej porcji', () => { setFactor(Math.max(0.1, (sv - (sv > 1 ? 1 : 0.5)) / base().servings)); }, 'glassy'),
      h('div', { class: 'stepper-val' }, h('strong', { class: 'num' }, fmtNum(sv, 1)), h('span', { class: 'muted small' }, 'porcji')),
      iconBtn('plus', 'Więcej porcji', () => { setFactor((sv + 1) / base().servings); }, 'glassy')) : null;
    const total = (base().prepTime || 0) + (base().cookTime || 0);
    return h('div', { class: 'guide-card' },
      h('div', { class: 'guide-kicker' }, 'Przygotuj'),
      h('h2', { class: 'guide-title' }, base().name),
      h('div', { class: 'guide-meta muted' }, [total ? `ok. ${fmtMinutes(total)}` : '', `${stepsCount()} ${stepsCount() === 1 ? 'krok' : 'kroków'}`, base().fermentTime ? `+ ferm. ${fmtMinutes(base().fermentTime)}` : ''].filter(Boolean).join(' · ')),
      stepper,
      h('div', { class: 'guide-sub' }, `Odłóż na blat składniki (${checked}/${ings.length})`),
      h('div', { class: 'cook-list' }, r.sections.flatMap((sec) => {
        const list = sec.ingredients.filter((i) => i.name);
        if (!list.length) return [];
        return [sec.name ? h('div', { class: 'tape' }, sec.name) : null, ...list.map((i) => {
          const q = qtyParts(i);
          const row = h('div', { class: 'cook-row' + (st.have[i.id] ? ' on' : ''), role: 'checkbox', tabindex: '0', 'aria-checked': !!st.have[i.id] },
            h('span', { class: 'cbox' }, icon('check', 22)),
            h('span', { class: 'cook-text' }, h('span', { class: 'cook-name' }, i.name), h('span', { class: 'cook-qty' }, h('span', { class: 'amt num' }, q.num), h('span', { class: 'unit' }, q.unit))));
          const tgl = () => { st.have[i.id] = !st.have[i.id]; if (!st.have[i.id]) delete st.have[i.id]; saveSt(); paint(false); };
          row.addEventListener('click', tgl);
          row.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tgl(); } });
          return row;
        })];
      })));
  }

  function setFactor(k) { st.factor = Math.round(k * 1000) / 1000; saveSt(); paint(false); }

  function stepPage() {
    const n = st.page - 1;
    const r = view();
    const step = r.steps[n];
    const ings = ingredientsInText(step.text, allIngredients(r).filter((i) => i.name)).slice(0, 8);
    const times = findTimes(step.text);
    return h('div', { class: 'guide-card' },
      h('div', { class: 'guide-kicker' }, `Krok ${st.page} z ${stepsCount()}`),
      h('p', { class: 'guide-text' }, step.text),
      ings.length ? h('div', null, h('div', { class: 'guide-sub' }, 'Potrzebne w tym kroku'),
        h('div', { class: 'guide-chips' }, ings.map((i) => {
          const q = qtyParts(i);
          return h('span', { class: 'gchip' },
            h('span', { class: 'gchip-art' }, h('img', { src: ingredientArtUrl(i.name), alt: '', loading: 'lazy' })),
            h('span', { class: 'gchip-copy' }, h('span', null, i.name.replace(/\s*\(.*\)\s*/, '')), h('strong', { class: 'num' }, [q.num, q.unit].filter(Boolean).join('\u00a0'))));
        }))) : null,
      times.length ? h('div', { class: 'guide-timers' }, times.map((t) => button(`Minutnik: ${t.label}`, { icon: 'timer', kind: 'primary', block: true,
        onClick: () => { startTimer(t.sec, `krok ${st.page} · ${base().name}`); toast(`Minutnik: ${t.label}`); } }))) : null,
      speechSupported() ? button('Czytaj ten krok', { icon: 'volume', kind: 'ghost', onClick: () => speak(`Krok ${st.page}. ${step.text}`) }) : null);
  }

  let notes = base().notes || '';
  const saveNotes = debounce((v) => patchRecipe(id, { notes: v }, { touch: true }), 500);
  function finishPage() {
    const stars = h('div', { class: 'stars', role: 'radiogroup', 'aria-label': 'Ocena' }, [1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', class: 'star' + (st.rating >= n ? ' on' : ''),
      role: 'radio', 'aria-checked': st.rating === n, 'aria-label': `${n} z 5`, onClick: () => { st.rating = st.rating === n ? 0 : n; saveSt(); paint(false); } }, icon('star', 34))));
    const ta = textArea({ value: notes, label: 'Notatka po gotowaniu', rows: 3, placeholder: 'Co poprawić następnym razem? (zapisze się w uwagach)', onInput: (v) => { notes = v; saveNotes(v); } });
    return h('div', { class: 'guide-card center' },
      h('div', { class: 'guide-done' }, '🍽️'),
      h('h2', { class: 'guide-title' }, 'Smacznego!'),
      h('p', { class: 'muted' }, `${base().name} gotowe.${base().cookCount ? ` Gotowane już ${base().cookCount} ${base().cookCount === 1 ? 'raz' : 'razy'}.` : ''}`),
      h('div', { class: 'guide-sub' }, 'Jak wyszło?'), stars, ta);
  }

  function paint(animate) {
    paintProgress();
    const p = st.page;
    const node = p === 0 ? introPage() : p > stepsCount() ? finishPage() : stepPage();
    if (animate) node.classList.add(dir > 0 ? 'in-right' : 'in-left');
    body.replaceChildren(node);
    back.disabled = p === 0;
    const label = next.querySelector('span');
    if (p === 0) label.textContent = stepsCount() ? 'Zaczynamy' : 'Zakończ';
    else if (p >= lastPage()) label.textContent = 'Zakończ';
    else label.textContent = p === stepsCount() ? 'Ostatni krok zrobiony' : 'Dalej';
    if (animate && getSetting('guideSpeak')) speakStep();
  }

  async function finish() {
    stopSpeaking();
    saveNotes.flush(notes);
    const b = base();
    await patchRecipe(id, { cookCount: (b.cookCount || 0) + 1, lastCookedAt: Date.now(), rating: st.rating || b.rating || 0 });
    await kv.del('guide:' + id).catch(() => {});
    st = { page: 0, factor: 1, have: {}, rating: 0 };
    toast('Zapisano. Smacznego! 👨‍🍳');
    goBack('/recipe/' + id);
  }

  /* ----- Gesty i klawiatura ----- */

  let tx = 0, ty = 0, t0 = 0;
  body.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; tx = t.clientX; ty = t.clientY; t0 = Date.now(); }, { passive: true });
  body.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45 && Date.now() - t0 < 600 && !e.target.closest('textarea,input')) go(dx < 0 ? 1 : -1);
  }, { passive: true });
  const onKey = (e) => {
    if (e.target.closest && e.target.closest('textarea,input,select')) return;
    if (e.key === 'ArrowRight') { if (st.page < lastPage()) go(1); }
    else if (e.key === 'ArrowLeft') go(-1);
  };
  document.addEventListener('keydown', onKey);

  /* ----- Wake Lock ----- */
  let lock = null;
  async function acquire() {
    if (!getSetting('keepAwake') || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch (_) { /* odmowa */ }
  }
  const onVis = () => { if (document.visibilityState === 'visible' && !lock) acquire(); };
  document.addEventListener('visibilitychange', onVis);

  /* ----- Start / wznowienie ----- */
  paint(false);
  kv.get('guide:' + id).then((p) => {
    loaded = true;
    if (p && typeof p === 'object') {
      st = { page: 0, factor: 1, have: {}, rating: 0, ...p };
      st.page = Math.min(st.page, lastPage());
      paint(false);
      if (st.page > 0 && st.page <= stepsCount()) {
        toast(`Wznowiono od kroku ${st.page}`, { action: { label: 'Od początku', fn: () => { st.page = 0; st.have = {}; saveSt(); paint(true); } } });
      }
    }
  }).catch(() => { loaded = true; });
  acquire();

  return {
    el: s.el,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      stopSpeaking();
      if (loaded) saveSt.flush();
      saveNotes.flush(notes);
      if (lock) { try { lock.release(); } catch (_) { /* */ } lock = null; }
    },
  };
}
