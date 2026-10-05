/* ==========================================================================
   views-history.js — prosta historia gotowania.
   ========================================================================== */
import { h, icon, screen, button, emptyState } from './ui.js';
import { navigate } from './router.js';
import { listCookHistory } from './history.js';
import { listRecipes } from './recipes.js';
import { fmtDateTime, fmtNum } from './util.js';
import { recipeArtUrl } from './art.js';

export function historyView() {
  const s = screen({ title: 'Historia gotowania', right: button('Receptury', { icon: 'book', onClick: () => navigate('/recipes') }), cls: 'history' });
  const content = h('div', { class: 'stack' });
  s.content.replaceChildren(content);

  const paint = async () => {
    const [events, recipes] = await Promise.all([listCookHistory(100), Promise.resolve(listRecipes())]);
    const map = new Map(recipes.map((r) => [r.id, r]));
    if (!events.length) {
      content.replaceChildren(emptyState('🧑‍🍳', 'Historia jest pusta', 'Ukończ gotowanie receptury, a pojawi się tutaj.',
        button('Przejdź do receptur', { icon: 'book', kind: 'primary', onClick: () => navigate('/recipes') })));
      return;
    }

    const groups = [];
    let currentDay = '';
    for (const e of events) {
      const d = new Date(e.at);
      const day = d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
      if (day !== currentDay) {
        currentDay = day;
        groups.push(h('h3', { class: 'group-title' }, icon('history', 16), day));
      }
      const r = map.get(e.recipeId);
      const title = r?.name || e.recipeName || 'Receptura';
      const meta = [
        fmtDateTime(e.at),
        e.factor !== 1 ? '×' + fmtNum(e.factor, 3) : null,
        e.servings ? e.servings + (e.servings === 1 ? ' porcja' : ' porcji') : null,
        e.inventoryConsumed ? 'Magazyn ✓' : null,
      ].filter(Boolean).join(' · ');
      const card = h('button', {
        type: 'button', class: 'history-card',
        'aria-label': `${title}, ${meta}`,
        onClick: () => navigate('/recipe/' + encodeURIComponent(e.recipeId)),
      },
        h('img', { class: 'history-thumb', src: r?.image || recipeArtUrl(r || { name: title }), alt: '', loading: 'lazy' }),
        h('span', { class: 'history-main' },
          h('strong', null, title),
          h('span', { class: 'muted small' }, meta)),
        icon('chevron-right', 18));
      groups.push(card);
    }
    content.replaceChildren(...groups);
  };

  paint().catch(() => {
    content.replaceChildren(emptyState('⚠️', 'Nie udało się wczytać historii', 'Spróbuj ponownie.',
      button('Odśwież', { kind: 'primary', onClick: () => paint() })));
  });

  return { el: s.el, destroy: () => {} };
}
