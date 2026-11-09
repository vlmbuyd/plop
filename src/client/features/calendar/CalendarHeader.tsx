import type { CalendarController } from '@fullcalendar/react';

import { formatCalendarTitle } from './formatTitle';
import { CALENDAR_VIEWS, type CalendarViewId } from './views';

interface CalendarHeaderProps {
  controller: CalendarController;

  view: CalendarViewId;

  onViewChange: (view: CalendarViewId) => void;
}

export function CalendarHeader({ controller, view, onViewChange }: CalendarHeaderProps) {
  const current = controller.view;
  const title = current ? formatCalendarTitle(current.currentStart, current.currentEnd) : '';

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 px-5">
      <h1 className="mr-auto text-xl font-semibold tracking-tight">{title}</h1>

      <div role="radiogroup" aria-label="보기" className="flex rounded-lg bg-surface-muted p-0.5">
        {CALENDAR_VIEWS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={view === option.id}
            onClick={() => onViewChange(option.id)}
            className="rounded-md px-3 py-1 text-sm text-ink-muted transition-colors aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-sm"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex items-center rounded-lg border border-line">
        <NavButton label="이전" onClick={() => controller.prev()}>
          <path d="M10 3 5 8l5 5" />
        </NavButton>
        <button
          type="button"
          onClick={() => controller.today()}
          className="border-x border-line px-3 py-1 text-sm hover:bg-surface-muted"
        >
          오늘
        </button>
        <NavButton label="다음" onClick={() => controller.next()}>
          <path d="m6 3 5 5-5 5" />
        </NavButton>
      </div>
    </header>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="grid size-8 place-items-center hover:bg-surface-muted">
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
