/* ==========================================================================
   views-start.js — ekran Start: nagłówek, szybkie akcje, ostatnie, ulubione.
   ========================================================================== */
import { h, icon, screen, emptyState, button } from './ui.js';
import { navigate } from './router.js';
import { state, subscribe, listRecipes, getSetting } from './recipes.js';
import { recipeTile, sectionHead } from './components.js';
import { openTimersSheet } from './timers.js';
import { pendingCount } from './shopping.js';
import { backupDue, daysSinceBackup } from './backup.js';

const plural = (n) => `${n} ${n === 1 ? 'receptura' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'receptury' : 'receptur'}`;
const HEADLINE = 'Gotuj lepiej. Gotuj po swojemu.';

export function startView() {
  const s = screen({ title: 'Żarłok', cls: 'start' });
  const c = s.content;
  let unsub;

  const tile = (label, ico, path, { primary = false, badge = 0 } = {}) =>
    h('a', { class: 'tile' + (primary ? ' primary' : ''), href: '#' + path, onClick: (e) => { e.preventDefault(); navigate(path); } },
      h('span', { class: 'tile-ico' }, icon(ico, 26), badge ? h('span', { class: 'badge' }, String(badge > 99 ? '99+' : badge)) : null),
      h('span', { class: 'tile-label' }, label));

  const qchip = (label, ico, fn) => h('button', { type: 'button', class: 'chip qchip', onClick: fn }, icon(ico, 18), label);

  function paint() {
    const all = listRecipes();
    const recent = all.filter((r) => r.lastOpenedAt).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 8);
    const favs = all.filter((r) => r.favorite).sort((a, b) => (b.favoritedAt || 0) - (a.favoritedAt || 0)).slice(0, 6);
    const n = pendingCount();

    const kids = [
      h('div', { class: 'hero' },
        h('h2', { class: 'hero-line' }, HEADLINE),
        h('p', { class: 'muted hero-sub' }, `${plural(all.length)} w telefonie · działa bez internetu`)),
      h('div', { class: 'tiles' },
        tile('Nowa receptura', 'plus', '/new', { primary: true }),
        tile('Moje receptury', 'book', '/recipes'),
        tile('Ostatnio używane', 'clock', '/recipes?f=recent'),
        tile('Ulubione', 'heart', '/recipes?f=fav'),
        tile('Kalkulatory', 'calc', '/calc'),
        tile('Lista zakupów', 'cart', '/shopping', { badge: n })),
      h('h3', { class: 'group-title' }, 'Szybkie narzędzia'),
      h('div', { class: 'chips quick-tools' },
        qchip('Szukaj w sieci', 'globe', () => navigate('/search')),
        qchip('Minutnik', 'timer', () => openTimersSheet()),
        qchip('Co dziś gotujemy?', 'shuffle', () => navigate('/calc/random')),
        qchip('Co mam w lodówce?', 'fridge', () => navigate('/calc/pantry')),
        qchip('Przelicznik', 'scale', () => navigate('/calc/units')),
        qchip('Temperatury', 'thermo', () => navigate('/calc/doneness')),
        qchip('Zamienniki', 'swap', () => navigate('/calc/subs')),
        qchip('Importuj', 'upload', () => navigate('/import'))),
    ];

    if (backupDue()) {
      const d = daysSinceBackup();
      kids.push(h('div', { class: 'notice' },
        icon('download', 22),
        h('div', { class: 'notice-text' }, h('strong', null, 'Zrób kopię zapasową'),
          h('span', { class: 'muted' }, d == null ? 'Jeszcze jej nie zrobiono — dane są tylko w tym telefonie.' : `Ostatnia: ${d} dni temu.`)),
        button('Kopia', { sm: true, onClick: () => navigate('/settings') })));
    }

    if (!all.length) {
      kids.push(emptyState('📒', 'Pusto w książce', 'Dodaj pierwszą recepturę albo wklej przepis z internetu.',
        button('Nowa receptura', { kind: 'primary', icon: 'plus', onClick: () => navigate('/new') }),
        button('Importuj', { icon: 'upload', onClick: () => navigate('/import') })));
    } else {
      const rail = (title, list, more, emptyText) => {
        kids.push(sectionHead(title, list.length && more ? { action: 'Wszystkie', onAction: () => navigate(more) } : {}));
        kids.push(list.length ? h('div', { class: 'rail' }, list.map((r) => recipeTile(r))) : h('p', { class: 'muted pad' }, emptyText));
      };
      rail('Ostatnio używane', recent, '/recipes?f=recent', 'Tu pojawią się receptury, które otworzysz.');
      rail('Ulubione', favs, '/recipes?f=fav', 'Stuknij serce przy recepturze, żeby była zawsze pod ręką.');
      const day = Math.floor(Date.now() / 86400000);
      const inspire = all.filter((r) => !r.lastOpenedAt).map((r, i) => ({ r, k: (i * 7919 + day * 104729) % 1009 })).sort((a, b) => a.k - b.k).slice(0, 8).map((x) => x.r);
      rail('Na dziś', inspire, '/calc/random', 'Otwórz kilka receptur, a pojawią się tu pomysły.');
      const trad = all.filter((r) => r.traditional).sort((a, b) => a.name.localeCompare(b.name, 'pl')).slice(0, 10);
      if (trad.length) rail('Tradycyjne', trad, '/recipes?f=trad', '');
    }
    c.replaceChildren(...kids);
  }

  paint();
  unsub = subscribe((t) => { if (t === 'recipes' || t === 'shopping' || t === 'settings') paint(); });
  return { el: s.el, destroy: () => unsub && unsub() };
}
