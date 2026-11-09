import { IconButton } from '../../shared/ui/IconButton';
import { useUiStore } from '../../shared/uiStore';
import { PlanButton } from '../suggestions/PlanButton';
import { formatCalendarTitle } from './formatTitle';
import type { CalendarState } from './useCalendarState';
import { CALENDAR_VIEWS } from './views';

export function CalendarHeader({ controller, view, changeView }: CalendarState) {
  const current = controller.view;
  const title = current ? formatCalendarTitle(current.currentStart, current.currentEnd) : '';
  const { inboxOpen, setInboxOpen, setProfileOpen, setImportOpen, setShortcutsOpen } = useUiStore();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-5">
      <h1 className="mr-auto text-xl font-semibold tracking-tight">{title}</h1>

      <PlanButton />

      <div role="radiogroup" aria-label="보기" className="ml-2 flex rounded-lg bg-surface-muted p-0.5">
        {CALENDAR_VIEWS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={view === option.id}
            onClick={() => changeView(option.id)}
            className="rounded-md px-3 py-1 text-sm text-ink-muted transition-colors aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-sm"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex items-center rounded-lg border border-line">
        <IconButton icon="chevronLeft" label="이전" className="rounded-none" onClick={() => controller.prev()} />
        <button type="button" onClick={() => controller.today()} className="h-8 border-x border-line px-3 text-sm hover:bg-surface-muted">
          오늘
        </button>
        <IconButton icon="chevronRight" label="다음" className="rounded-none" onClick={() => controller.next()} />
      </div>

      <IconButton icon="person" label="Plop이 아는 나" onClick={() => setProfileOpen(true)} />
      <HeaderMenu onImport={() => setImportOpen(true)} onShortcuts={() => setShortcutsOpen(true)} />
      {!inboxOpen ? <IconButton icon="panel" label="할 일 목록 열기 (I)" onClick={() => setInboxOpen(true)} /> : null}
    </header>
  );
}

function HeaderMenu({ onImport, onShortcuts }: { onImport: () => void; onShortcuts: () => void }) {
  return (
    <details className="relative">
      <summary className="grid size-8 cursor-pointer list-none place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label="더 보기">
        <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
          <circle cx="3.5" cy="8" r="1.2" />
          <circle cx="8" cy="8" r="1.2" />
          <circle cx="12.5" cy="8" r="1.2" />
        </svg>
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-48 rounded-lg border border-line bg-surface p-1 shadow-lg">
        {[
          { label: 'TickTick 가져오기', onClick: onImport },
          { label: '단축키 보기', onClick: onShortcuts },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted"
            onClick={(e) => {
              (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
              item.onClick();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
