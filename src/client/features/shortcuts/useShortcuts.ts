import { useEffect } from 'react';

import { useUiStore } from '../../shared/uiStore';
import type { CalendarState } from '../calendar/useCalendarState';

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
}

export function useShortcuts({ controller, changeView }: CalendarState) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ui = useUiStore.getState();

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.requestChatInput();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;

      const actions: Record<string, () => void> = {
        n: () => ui.requestInboxInput(),
        '/': () => ui.requestChatInput(),
        p: () => document.querySelector<HTMLButtonElement>('[data-plan-button]')?.click(),
        t: () => controller.today(),
        ArrowLeft: () => controller.prev(),
        ArrowRight: () => controller.next(),
        '1': () => changeView('timeGridDay'),
        '2': () => changeView('timeGridFiveDay'),
        '3': () => changeView('timeGridWeek'),
        i: () => ui.setInboxOpen(!ui.inboxOpen),
        '?': () => ui.setShortcutsOpen(true),
      };
      const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [controller, changeView]);
}
