/* ==========================================================================
   pwa.js — rejestracja service workera, wykrywanie nowej wersji,
   stan offline/instalacji, trwały magazyn.
   Nowa wersja NIE podmienia się po cichu: użytkownik klika „Odśwież”.
   ========================================================================== */
import { toast } from './ui.js';

let registration = null;
let userAskedForUpdate = false;
let updateShown = false;
const listeners = new Set();

export const swSupported = () => 'serviceWorker' in navigator;
export const onPwaChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => listeners.forEach((f) => { try { f(); } catch (_) { /* */ } });

export const isStandalone = () =>
  window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function promptUpdate(worker) {
  if (updateShown) return;
  updateShown = true;
  toast('Nowa wersja Kucharzyny jest dostępna', {
    sticky: true,
    action: {
      label: 'Odśwież',
      fn: () => { userAskedForUpdate = true; worker.postMessage({ type: 'SKIP_WAITING' }); },
    },
  });
  notify();
}

export const updateWaiting = () => updateShown;

export async function registerSW() {
  if (!swSupported()) return null;
  try {
    registration = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
  } catch (e) {
    console.warn('Service worker nie został zarejestrowany:', e);
    return null;
  }
  const hadController = !!navigator.serviceWorker.controller;

  if (registration.waiting && hadController) promptUpdate(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const nw = registration.installing;
    if (!nw) return;
    nw.addEventListener('statechange', () => {
      if (nw.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(nw);
    });
  });

  // Przeładuj tylko wtedy, gdy użytkownik sam kliknął „Odśwież”.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (userAskedForUpdate) { userAskedForUpdate = false; location.reload(); }
  });

  // Regularne sprawdzanie: po powrocie do aplikacji i co ~30 min.
  const check = () => { if (navigator.onLine) registration.update().catch(() => {}); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('online', check);
  setInterval(check, 30 * 60 * 1000);
  check();
  return registration;
}

/** Ręczne sprawdzenie: 'available' | 'current' | 'offline' | 'unsupported' | 'error'. */
export async function checkForUpdate() {
  if (!swSupported() || !registration) return 'unsupported';
  if (!navigator.onLine) return 'offline';
  try {
    await registration.update();
    if (registration.waiting || updateShown) {
      if (registration.waiting) promptUpdate(registration.waiting);
      return 'available';
    }
    if (registration.installing) {
      await new Promise((res) => {
        const w = registration.installing;
        w.addEventListener('statechange', () => { if (w.state === 'installed' || w.state === 'redundant') res(); });
        setTimeout(res, 8000);
      });
      if (registration.waiting) { promptUpdate(registration.waiting); return 'available'; }
    }
    return 'current';
  } catch (_) { return 'error'; }
}

/** Wersja działającego service workera (do ekranu ustawień). */
export async function swVersion() {
  try {
    const reg = registration || (await navigator.serviceWorker.getRegistration());
    const w = reg && reg.active;
    if (!w) return null;
    return await new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => resolve(e.data && e.data.version);
      w.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
      setTimeout(() => resolve(null), 1500);
    });
  } catch (_) { return null; }
}

/** Prośba o trwały magazyn (iOS/Chrome mogą odmówić — wtedy kopia JSON jest kluczowa). */
export async function requestPersist() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (_) { return false; }
}
export async function storageInfo() {
  const out = { persisted: false, usage: null, quota: null };
  try {
    if (navigator.storage) {
      if (navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
      if (navigator.storage.estimate) { const e = await navigator.storage.estimate(); out.usage = e.usage; out.quota = e.quota; }
    }
  } catch (_) { /* */ }
  return out;
}
