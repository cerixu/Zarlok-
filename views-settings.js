/* ==========================================================================
   views-settings.js — Ustawienia: wygląd i tryb, kategorie, kopia zapasowa,
   pamięć i PWA, aktualizacje, strefa ryzyka, prywatność.
   ========================================================================== */
import {
  h, icon, screen, button, toast, openSheet, confirmDialog, promptDialog, segmented, switchEl, selectEl, field,
} from './ui.js';
import { navigate, rerender } from './router.js';
import { state, getSetting, setSetting, restoreSeeds, listRecipes } from './recipes.js';
import { openCategoryManager } from './views-recipes.js';
import { exportBackup, readBackupFile, importBackup, wipeAll, daysSinceBackup } from './backup.js';
import { checkForUpdate, swVersion, storageInfo, requestPersist, isStandalone, isIOS, swSupported } from './pwa.js';
import { searchGoogle, googleConfigured } from './search.js';
import { textInput } from './ui.js';
import { APP_VERSION, fmtDateTime } from './util.js';

const mb = (b) => (b == null ? '—' : b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB');

export function settingsView() {
  const s = screen({ title: 'Ustawienia', cls: 'settings' });
  const c = s.content;
  const group = (title, ...kids) => h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, title), ...kids);

  const set = (k) => async (v) => { await setSetting(k, v); };

  /* ----- Wygląd ----- */
  const scaleVal = h('span', { class: 'num' }, getSetting('textScale') + '%');
  const range = h('input', { type: 'range', min: 90, max: 130, step: 5, value: getSetting('textScale'), 'aria-label': 'Wielkość tekstu', class: 'range' });
  range.addEventListener('input', () => { scaleVal.textContent = range.value + '%'; document.documentElement.style.setProperty('--ts', String(range.value / 100)); });
  range.addEventListener('change', () => setSetting('textScale', +range.value));

  const glassVal = h('span', { class: 'num' }, getSetting('glass') + '%');
  const glassRange = h('input', { type: 'range', min: 0, max: 100, step: 5, value: getSetting('glass'), 'aria-label': 'Przezroczystość szkła', class: 'range' });
  glassRange.addEventListener('input', () => { glassVal.textContent = glassRange.value + '%'; document.documentElement.style.setProperty('--glass', String(glassRange.value / 100)); });
  glassRange.addEventListener('change', () => setSetting('glass', +glassRange.value));

  const appearance = group('Wygląd',
    h('div', null, h('div', { class: 'field-label' }, 'Motyw'),
      segmented([['auto', 'Auto'], ['light', 'Jasny'], ['dark', 'Ciemny']], getSetting('theme'), set('theme'), { label: 'Motyw' })),
    h('div', null, h('div', { class: 'field-label' }, 'Tryb'),
      segmented([['pro', 'Pro'], ['amateur', 'Amator']], getSetting('mode'), async (v) => { await setSetting('mode', v); rerender(); }, { label: 'Tryb aplikacji' }),
      h('p', { class: 'muted small' }, 'Pro: procenty piekarskie, food cost, historia zmian, ciemna stal i szafran. Amator: zielony, zaokrąglony, prostszy wygląd — bez zaawansowanych funkcji.')),
    h('div', null, h('div', { class: 'field-label' }, 'Wielkość przycisków'),
      segmented([['normal', 'Normalne'], ['large', 'Duże'], ['xl', 'Bardzo duże']], getSetting('tapSize'), set('tapSize'), { label: 'Wielkość przycisków' }),
      h('p', { class: 'muted small' }, 'Większe przyciski są wygodniejsze przy mokrych rękach.')),
    h('div', null, h('div', { class: 'row between' }, h('span', { class: 'field-label' }, 'Wielkość tekstu'), scaleVal), range),
    h('div', null, h('div', { class: 'row between' }, h('span', { class: 'field-label' }, 'Przezroczystość szkła'), glassVal), glassRange,
      h('p', { class: 'muted small' }, 'Jak suwak Liquid Glass w iOS 27: mniej = czytelniej (bardziej kryjące panele), więcej = bardziej przezroczyste.')));

  /* ----- Receptury ----- */
  const recipes = group('Receptury',
    button('Kategorie', { icon: 'tag', block: true, onClick: () => openCategoryManager() }),
    switchEl(!!getSetting('pinTraditional'), set('pinTraditional'), 'Tradycyjne receptury na górze', 'Z gwiazdką i flagą kraju'),
    switchEl(!!getSetting('keepAwake'), set('keepAwake'), 'Nie gaś ekranu w trybie „Gotuję”', 'Działa, gdy przeglądarka obsługuje Wake Lock'),
    field('Waluta', selectEl(['zł', '€', '$', '£', 'Kč', 'Ft'], getSetting('currency'), set('currency'))),
    button('Przywróć przykładowe receptury', { icon: 'refresh', block: true, kind: 'ghost', onClick: async () => {
      const n = await restoreSeeds();
      toast(n ? `Przywrócono receptury: ${n}` : 'Przykładowe receptury już są (edytowanych nie nadpisuję)');
    } }));

  /* ----- Wyszukiwanie w sieci ----- */
  const keyIn = textInput({ value: getSetting('googleKey') || '', label: 'Klucz API Google', placeholder: 'AIza…', capitalize: 'none', type: 'password', onInput: (v) => { setSetting('googleKey', v.trim()); } });
  const cxIn = textInput({ value: getSetting('googleCx') || '', label: 'Identyfikator wyszukiwarki (cx)', placeholder: 'np. 0123456789abcdef0', capitalize: 'none', onInput: (v) => { setSetting('googleCx', v.trim()); } });
  const proxyIn = textInput({ value: getSetting('proxyUrl') || '', label: 'Adres własnego pośrednika', placeholder: 'https://moj-worker.workers.dev/?url={url}', type: 'url', capitalize: 'none', onInput: (v) => { setSetting('proxyUrl', v.trim()); } });
  const mmIn = textInput({ value: getSetting('mmEmail') || '', label: 'E-mail dla MyMemory', placeholder: 'twoj@email.pl (opcjonalnie)', type: 'email', capitalize: 'none', onInput: (v) => { setSetting('mmEmail', v.trim()); } });
  const proxyWrap = h('div', { class: 'field-wrap', hidden: getSetting('proxyMode') !== 'custom' }, field('Własny pośrednik CORS', proxyIn, 'Szablon z {url} — zostanie podstawiony zakodowany adres strony.'));
  const search = group('Wyszukiwanie w sieci',
    h('p', { class: 'muted small' }, 'Wyszukiwarka przepisów działa w aplikacji (zakładka Receptury → Szukaj w sieci). Wbudowana baza przepisów działa bez konfiguracji. Prawdziwe wyniki Google wymagają Twojego darmowego klucza (100 zapytań dziennie).'),
    field('Klucz API Google (Custom Search)', keyIn), field('Identyfikator wyszukiwarki (cx)', cxIn),
    h('div', { class: 'row wrap gap' },
      button('Sprawdź połączenie', { icon: 'check', onClick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try {
          if (!googleConfigured()) throw new Error('Wpisz klucz i identyfikator wyszukiwarki.');
          const res = await searchGoogle('pizza');
          toast(`Google działa — wyników: ${res.length}`);
        } catch (err) { toast(err.message || 'Nie udało się połączyć', { type: 'error', ms: 6000 }); }
        b.disabled = false;
      } }),
      button('Jak to ustawić', { icon: 'info', kind: 'ghost', onClick: () => navigate('/search?help=1') })),
    h('div', null, h('div', { class: 'field-label' }, 'Pobieranie stron z przepisami (pośrednik CORS)'),
      segmented([['auto', 'Auto'], ['custom', 'Własny'], ['off', 'Wyłączony']], getSetting('proxyMode'), async (v) => { await setSetting('proxyMode', v); proxyWrap.hidden = v !== 'custom'; }, { label: 'Pośrednik' }),
      h('p', { class: 'muted small' }, 'Strona na GitHub Pages nie może pobrać cudzej strony bez pośrednika. Tryb Auto używa publicznych bezpłatnych pośredników — widzą adres strony, którą wczytujesz. Możesz ustawić własny (np. Cloudflare Worker) albo wyłączyć.')),
    proxyWrap,
    switchEl(!!getSetting('autoTranslate'), set('autoTranslate'), 'Tłumacz obce przepisy na polski', 'Przy dodawaniu z wyszukiwarki (MyMemory, darmowe, dzienny limit)'),
    field('E-mail dla tłumaczeń (zwiększa limit)', mmIn));

  const cooking = group('Gotowanie',
    switchEl(!!getSetting('guideSpeak'), set('guideSpeak'), 'Czytaj kroki na głos', 'W trybie „GOTUJĘ” (głos systemowy iOS)'));

  /* ----- Kopia zapasowa ----- */
  const backupInfo = h('p', { class: 'muted small' });
  const paintBackupInfo = () => {
    const last = getSetting('lastBackupAt');
    const d = daysSinceBackup();
    backupInfo.textContent = last ? `Ostatnia kopia: ${fmtDateTime(last)}${d > 14 ? ` (${d} dni temu — czas na nową)` : ''}` : 'Nie zrobiono jeszcze żadnej kopii. Dane są tylko w tym telefonie.';
  };
  paintBackupInfo();
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-file', 'aria-label': 'Wybierz plik kopii' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files && fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    try { openRestore(await readBackupFile(f)); }
    catch (e) { toast(e.message || 'Nie udało się wczytać pliku', { type: 'error', ms: 4000 }); }
  });

  function openRestore({ backup, summary }) {
    const sh = openSheet({
      title: 'Wczytać kopię zapasową?', variant: 'sheet',
      body: h('div', { class: 'stack' },
        h('div', { class: 'kv' },
          h('div', { class: 'kv-row' }, h('span', null, 'Receptury'), h('span', { class: 'num' }, String(summary.recipes))),
          h('div', { class: 'kv-row' }, h('span', null, 'Kategorie'), h('span', { class: 'num' }, String(summary.categories))),
          h('div', { class: 'kv-row' }, h('span', null, 'Pozycje zakupów'), h('span', { class: 'num' }, String(summary.shopping))),
          h('div', { class: 'kv-row' }, h('span', null, 'Wpisy historii'), h('span', { class: 'num' }, String(summary.history))),
          summary.exportedAt ? h('div', { class: 'kv-row' }, h('span', null, 'Zrobiona'), h('span', { class: 'num' }, fmtDateTime(summary.exportedAt))) : null),
        h('p', { class: 'muted small' }, '„Połącz” dodaje brakujące receptury i zostawia nowszą wersję każdej z nich. „Zastąp” usuwa obecne dane i wczytuje tylko kopię.')),
      actions: [
        { label: 'Anuluj', kind: 'ghost' },
        { label: 'Zastąp wszystko', kind: 'danger', onClick: async () => {
          const ok = await confirmDialog({ title: 'Zastąpić wszystkie dane?', message: `Obecnych receptur (${listRecipes().length}) nie będzie już w aplikacji. Tej operacji nie da się cofnąć.`, confirmText: 'Zastąp', danger: true });
          if (!ok) return false;
          await doImport(backup, 'replace');
        } },
        { label: 'Połącz', kind: 'primary', onClick: () => doImport(backup, 'merge') },
      ],
    });
    void sh;
  }
  async function doImport(backup, mode) {
    try {
      const r = await importBackup(backup, mode);
      toast(`Wczytano kopię — receptur: ${r.recipes}`);
      rerender();
    } catch (e) { console.error(e); toast('Nie udało się wczytać kopii: ' + (e && e.message), { type: 'error', sticky: true }); }
  }

  const backup = group('Kopia zapasowa (JSON)',
    h('p', { class: 'muted' }, 'Receptury, składniki, kategorie, uwagi, ulubione, ustawienia, zakupy i historia w jednym pliku. Zapisz go w Plikach / iCloud Drive — to jedyna ochrona, gdyby Safari wyczyściło dane witryny.'),
    backupInfo,
    button('Eksportuj kopię', { icon: 'download', kind: 'primary', block: true, onClick: async () => {
      const r = await exportBackup();
      if (r === 'cancelled') return;
      paintBackupInfo();
      toast(r === 'shared' ? 'Kopia gotowa do zapisania' : r === 'downloaded' ? 'Plik kopii pobrany' : r === 'copied' ? 'Kopia skopiowana do schowka' : 'Nie udało się zapisać kopii', { type: r ? '' : 'error' });
    } }),
    button('Wczytaj kopię z pliku', { icon: 'upload', block: true, onClick: () => fileIn.click() }), fileIn);

  /* ----- Pamięć i aplikacja ----- */
  const storageBox = h('div', { class: 'kv' });
  const swRow = h('span', { class: 'num' }, '…');
  async function paintStorage() {
    const si = await storageInfo();
    const cnt = listRecipes().length;
    storageBox.replaceChildren(
      h('div', { class: 'kv-row' }, h('span', null, 'Receptur'), h('span', { class: 'num' }, String(cnt))),
      h('div', { class: 'kv-row' }, h('span', null, 'Zajęte miejsce'), h('span', { class: 'num' }, mb(si.usage))),
      h('div', { class: 'kv-row' }, h('span', null, 'Trwały magazyn'), h('span', { class: 'num' }, si.persisted ? 'tak' : 'nie (kopia JSON chroni dane)')),
      h('div', { class: 'kv-row' }, h('span', null, 'Połączenie'), h('span', { class: 'num' }, navigator.onLine ? 'online' : 'offline')),
      h('div', { class: 'kv-row' }, h('span', null, 'Tryb'), h('span', { class: 'num' }, isStandalone() ? 'aplikacja (ekran początkowy)' : 'karta przeglądarki')));
    const v = await swVersion();
    swRow.textContent = !swSupported() ? 'niedostępny' : v ? `aktywny (${v})` : 'jeszcze się instaluje';
  }
  paintStorage();

  const app = group('Aplikacja i pamięć',
    storageBox,
    h('div', { class: 'kv' }, h('div', { class: 'kv-row' }, h('span', null, 'Wersja aplikacji'), h('span', { class: 'num' }, APP_VERSION)), h('div', { class: 'kv-row' }, h('span', null, 'Service worker'), swRow)),
    button('Poproś o trwały magazyn', { icon: 'info', block: true, kind: 'ghost', onClick: async () => { const ok = await requestPersist(); toast(ok ? 'Magazyn oznaczony jako trwały' : 'Przeglądarka nie nadała trwałości — rób kopie JSON'); paintStorage(); } }),
    button('Sprawdź aktualizacje', { icon: 'refresh', block: true, onClick: async () => {
      const r = await checkForUpdate();
      const msg = { available: 'Jest nowa wersja — stuknij „Odśwież”', current: 'Masz najnowszą wersję', offline: 'Jesteś offline', unsupported: 'Aktualizacje niedostępne w tej przeglądarce', error: 'Nie udało się sprawdzić' }[r];
      if (r !== 'available') toast(msg, { type: r === 'error' ? 'error' : '' });
    } }));

  const install = !isStandalone() ? group('Instalacja',
    isIOS()
      ? h('ol', { class: 'plain steps-mini' }, h('li', null, 'Otwórz tę stronę w Safari.'), h('li', null, 'Stuknij przycisk Udostępnij (kwadrat ze strzałką).'), h('li', null, 'Wybierz „Do ekranu początkowego”, a potem „Dodaj”.'))
      : h('p', { class: 'muted' }, 'W menu przeglądarki wybierz „Zainstaluj aplikację” / „Dodaj do ekranu głównego”.'),
    h('p', { class: 'muted small' }, 'Zainstalowana aplikacja działa w pełnym ekranie i bez internetu.')) : null;

  /* ----- Ryzyko i prywatność ----- */
  const danger = group('Strefa ryzyka',
    h('p', { class: 'muted' }, 'Usunięcie danych kasuje receptury, historię, zakupy i ustawienia z tego telefonu. Najpierw zrób kopię JSON.'),
    button('Usuń wszystkie dane', { icon: 'trash', kind: 'danger', block: true, onClick: async () => {
      const t = await promptDialog({ title: 'Usunąć wszystkie dane?', message: 'Wpisz USUŃ, aby potwierdzić. Tej operacji nie da się cofnąć.', label: 'Potwierdzenie', placeholder: 'USUŃ', confirmText: 'Usuń wszystko' });
      if (t == null) return;
      if (t.trim().toUpperCase() !== 'USUŃ') { toast('Nie wpisano USUŃ — nic nie usunięto', { type: 'error' }); return; }
      await wipeAll({ keepSeeds: false });
      toast('Dane usunięte');
      navigate('/', { replace: true });
    } }));

  const about = group('Prywatność',
    h('p', { class: 'muted' }, 'Kucharzyna nie ma konta, reklam, śledzenia ani analityki. Wszystkie dane są w pamięci tego urządzenia (IndexedDB) i nigdzie nie są wysyłane. Internet jest używany tylko wtedy, gdy sam otworzysz wyszukiwarkę Google lub Google Tłumacz.'));

  c.append(appearance, recipes, cooking, search, backup, app, install, danger, about);
  void state;
  return { el: s.el };
}
