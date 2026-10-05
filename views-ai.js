/* ==========================================================================
   views-ai.js — wspólny arkusz rozmowy z Żarłok AI.
   ========================================================================== */
import { h, icon, button, textArea, toast } from './ui.js';
import { askRecipeAI, aiEnabled, hasAIAccess, recipeAIContext } from './ai.js';

export function openRecipeAiSheet({ openSheet, recipe, currentStep = '' }) {
  const history = [];
  const transcript = h('div', { class: 'ai-transcript', 'aria-live': 'polite' });
  const answer = h('div', { class: 'ai-answer', hidden: true });
  const input = textArea({
    label: 'Pytanie do Żarłok AI',
    rows: 3,
    placeholder: 'Np. Mam boczek zamiast guanciale. Mogę?',
    cls: 'ai-input'
  });

  const suggestions = h('div', { class: 'ai-suggestions' },
    ...[
      'Mam boczek zamiast guanciale. Mogę?',
      'Czym mogę to zastąpić?',
      'Czy mogę podkręcić temperaturę?',
      'Jak uratować zbyt słony sos?'
    ].map((q) => h('button', {
      type: 'button',
      class: 'chip',
      onClick: () => { input.value = q; input._fit?.(); input.focus(); }
    }, q))
  );

  const renderHistory = () => {
    transcript.replaceChildren(...history.flatMap((x) => [
      h('div', { class: 'ai-q' }, h('span', { class: 'ai-role' }, 'Ty'), h('span', null, x.q)),
      h('div', { class: 'ai-a' }, h('span', { class: 'ai-role' }, 'AI'), h('span', null, x.a))
    ]));
    transcript.hidden = history.length === 0;
  };

  async function ask() {
    if (!aiEnabled()) { toast('Włącz Żarłok AI w Ustawieniach', { type: 'error' }); return; }
    if (!hasAIAccess()) { toast('Najpierw połącz Żarłoka z AI Gateway w Ustawieniach', { type: 'error' }); return; }
    const q = input.value.trim();
    if (!q) { input.focus(); return; }

    const send = sheet.panel.querySelector('[data-ai-send]');
    if (send) send.disabled = true;
    answer.hidden = false;
    answer.replaceChildren(h('span', { class: 'ai-thinking' }, icon('sparkle', 18), 'Żarłok AI myśli…'));
    try {
      const a = await askRecipeAI({
        question: q,
        recipe: recipeAIContext(recipe),
        currentStep,
        history
      });
      history.push({ q, a });
      renderHistory();
      answer.replaceChildren(h('span', { class: 'ai-live' }, a));
      input.value = '';
      input._fit?.();
    } catch (e) {
      answer.hidden = false;
      answer.replaceChildren(h('span', { class: 'ai-error' }, e?.message || 'Nie udało się połączyć z AI.'));
    } finally {
      if (send) send.disabled = false;
    }
  }

  const body = h('div', { class: 'ai-panel stack' },
    h('div', { class: 'ai-intro' },
      h('div', { class: 'ai-orb' }, icon('sparkle', 22)),
      h('div', null,
        h('strong', null, 'Żarłok AI'),
        h('p', { class: 'muted small' }, currentStep ? 'Widzę recepturę i aktualny krok gotowania.' : 'Widzę całą recepturę i odpowiem praktycznie.'))),
    suggestions,
    transcript,
    answer,
    input);

  const sheet = openSheet({
    title: 'Zapytaj AI',
    variant: 'sheet',
    body,
    actions: [
      { label: 'Zamknij', kind: 'ghost' },
      { label: 'Zapytaj', kind: 'primary', icon: 'sparkle', onClick: () => { void ask(); return false; }, close: false }
    ]
  });
  const send = sheet.panel.querySelector('.panel-foot button:last-child');
  if (send) send.dataset.aiSend = '1';
  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void ask(); }
  });
  return sheet;
}
