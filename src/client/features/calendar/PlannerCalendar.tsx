import FullCalendar, { type CalendarRef, type EventInput } from '@fullcalendar/react';
import interactionPlugin from '@fullcalendar/react/interaction';
import koLocale from '@fullcalendar/react/locales/ko';
import formaThemePlugin from '@fullcalendar/react/themes/forma';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import { useMemo, useRef, useState } from 'react';

import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/forma/theme.css';
import './calendar.css';

import type { CalendarItem, OccurrenceChangeInput, SuggestionView } from '@shared/task';

import { Icon } from '../../shared/ui/Icon';
import { useUiStore } from '../../shared/uiStore';
import { SuggestionBar } from '../suggestions/SuggestionBar';
import { SuggestionPopover } from '../suggestions/SuggestionPopover';
import { useCalendar, useTaskActions, type DateRange } from './api';
import { CalendarHeader } from './CalendarHeader';
import { CreatePopover } from './CreatePopover';
import { EventPopover } from './EventPopover';
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog';
import type { CalendarState } from './useCalendarState';

type EventProps = { kind: 'item'; item: CalendarItem } | { kind: 'suggestion'; suggestion: SuggestionView };

type Overlay =
  | { kind: 'create'; anchor: DOMRect; start: Date; end: Date; allDay: boolean }
  | { kind: 'event'; anchor: HTMLElement; itemId: string }
  | { kind: 'suggestion'; anchor: HTMLElement; suggestion: SuggestionView }
  | null;

interface ScopeRequest {
  item: CalendarItem;

  change: OccurrenceChangeInput['change'];

  label: string;

  revert?: () => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toEvents(items: CalendarItem[], suggestions: SuggestionView[]): EventInput[] {
  return [
    ...items.map((item) => ({
      id: item.id,
      title: item.title,
      start: item.startsAt,
      end: item.endsAt,
      allDay: item.allDay,
      className: [item.done ? 'is-done' : '', item.recurrence ? 'is-recurring' : ''].join(' ').trim() || undefined,
      extendedProps: { kind: 'item', item } satisfies EventProps,
    })),
    ...suggestions.map((suggestion) => ({
      id: `suggestion:${suggestion.id}`,
      title: suggestion.title,
      start: suggestion.startsAt,
      end: suggestion.endsAt,
      editable: false,
      className: 'is-suggestion',
      extendedProps: { kind: 'suggestion', suggestion } satisfies EventProps,
    })),
  ];
}

function isOverInbox(event: MouseEvent) {
  const panel = document.getElementById('inbox-panel');
  if (!panel) return false;
  const rect = panel.getBoundingClientRect();
  return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
}

export function PlannerCalendar(state: CalendarState) {
  const { controller, view } = state;
  const calendarRef = useRef<CalendarRef>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [scope, setScope] = useState<ScopeRequest | null>(null);
  const { data } = useCalendar(range);
  const actions = useTaskActions();
  const showNotice = useUiStore((s) => s.showNotice);

  const events = useMemo(() => toEvents(data?.items ?? [], data?.suggestions ?? []), [data]);
  const overlayItem = overlay?.kind === 'event' ? data?.items.find((i) => i.id === overlay.itemId) : undefined;

  const onError = (error: Error) => showNotice(error.message);

  const toggleDone = (item: CalendarItem) =>
    actions.complete.mutate(
      { id: item.taskId, done: !item.done, occurrenceStartsAt: item.occurrenceStartsAt ?? undefined },
      { onError },
    );

  const applyScope = (choice: 'this' | 'following') => {
    if (!scope) return;
    const { item, change, revert } = scope;
    actions.changeOccurrence.mutate(
      { id: item.taskId, occurrenceStartsAt: item.occurrenceStartsAt!, scope: choice, change },
      { onError: (error) => (revert?.(), onError(error)) },
    );
    setScope(null);
  };

  const moveItem = (item: CalendarItem, start: Date, end: Date | null, allDay: boolean, revert: () => void) => {
    const endsAt = end ?? new Date(start.getTime() + (allDay ? DAY_MS : 30 * 60 * 1000));
    if (item.recurrence) {
      setScope({ item, label: '옮기기', revert, change: { type: 'move', startsAt: start.toISOString(), endsAt: endsAt.toISOString(), allDay } });
      return;
    }
    actions.update.mutate(
      { id: item.taskId, startsAt: start.toISOString(), endsAt: endsAt.toISOString(), allDay },
      { onError: (error) => (revert(), onError(error)) },
    );
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <CalendarHeader {...state} />
      <SuggestionBar suggestions={data?.suggestions ?? []} />

      <div className="plop-calendar min-h-0 flex-1">
        <FullCalendar
          ref={calendarRef}
          controller={controller}
          plugins={[timeGridPlugin, interactionPlugin, formaThemePlugin]}
          locale={koLocale}
          initialView={view}
          views={{ timeGridFiveDay: { type: 'timeGrid', duration: { days: 5 } } }}
          headerToolbar={false}
          height="100%"
          firstDay={1}
          nowIndicator
          allDayText="종일"
          scrollTime="08:00:00"
          slotHeaderFormat={{ hour: 'numeric', meridiem: 'short' }}
          snapDuration="00:15:00"
          editable
          selectable
          selectMirror
          droppable
          unselectCancel=".plop-popover"
          dayHeaderContent={(arg) => (
            <div className="plop-day-header">
              <span className="plop-day-header__weekday">{arg.date.toLocaleDateString('ko-KR', { weekday: 'short' })}</span>
              <span className={arg.isToday ? 'plop-day-header__date is-today' : 'plop-day-header__date'}>{arg.date.getDate()}</span>
            </div>
          )}
          eventContent={(arg) => {
            const props = arg.event.extendedProps as EventProps;
            const short = arg.isShort ? ' is-short' : '';
            // 끌어서 만드는 중이거나 목록에서 끌어 오는 중인 임시 칸에는 우리 데이터가 없다.
            if (!(props as { kind?: string }).kind) {
              return (
                <div className={`plop-event${short}`}>
                  <span className="plop-event__body">
                    <span className="plop-event__title">{arg.event.title || '새 할 일'}</span>
                    {arg.timeText ? <span className="plop-event__time">{arg.timeText}</span> : null}
                  </span>
                </div>
              );
            }
            if (props.kind === 'suggestion') {
              return (
                <div className={`plop-event${short}`}>
                  <Icon name="sparkle" className="plop-event__icon" />
                  <span className="plop-event__body">
                    <span className="plop-event__title">{arg.event.title}</span>
                    {arg.timeText ? <span className="plop-event__time">{arg.timeText}</span> : null}
                  </span>
                </div>
              );
            }
            return (
              <div className={`plop-event${short}`}>
                <span className="plop-event__check" data-action="toggle" role="checkbox" aria-checked={props.item.done} aria-label="완료" />
                <span className="plop-event__body">
                  <span className="plop-event__title">{arg.event.title}</span>
                  {!arg.event.allDay && arg.timeText ? <span className="plop-event__time">{arg.timeText}</span> : null}
                </span>
                {props.item.recurrence ? <Icon name="repeat" className="plop-event__icon" /> : null}
              </div>
            );
          }}
          events={events}
          datesSet={(info) => setRange({ from: info.start, to: info.end })}
          select={(info) =>
            setOverlay({
              kind: 'create',
              anchor: info.jsEvent ? new DOMRect(info.jsEvent.clientX, info.jsEvent.clientY, 0, 0) : new DOMRect(window.innerWidth / 2, 200, 0, 0),
              start: info.start,
              end: info.end,
              allDay: info.allDay,
            })
          }
          eventClick={(info) => {
            const props = info.event.extendedProps as EventProps;
            if (props.kind === 'suggestion') {
              setOverlay({ kind: 'suggestion', anchor: info.el, suggestion: props.suggestion });
              return;
            }
            if ((info.jsEvent.target as Element).closest('[data-action="toggle"]')) {
              toggleDone(props.item);
              return;
            }
            setOverlay({ kind: 'event', anchor: info.el, itemId: props.item.id });
          }}
          eventDrop={(info) => {
            const props = info.event.extendedProps as EventProps;
            if (props.kind !== 'item' || !info.event.start) return info.revert();
            moveItem(props.item, info.event.start, info.event.end, info.event.allDay, info.revert);
          }}
          eventResize={(info) => {
            const props = info.event.extendedProps as EventProps;
            if (props.kind !== 'item' || !info.event.start) return info.revert();
            moveItem(props.item, info.event.start, info.event.end, info.event.allDay, info.revert);
          }}
          eventDragStop={(info) => {
            // 캘린더 밖 오른쪽 목록 위에 놓으면 날짜를 뺀다.
            const props = info.event.extendedProps as EventProps;
            if (props.kind !== 'item' || !isOverInbox(info.jsEvent)) return;
            if (props.item.recurrence) {
              showNotice('반복 일정은 목록으로 보낼 수 없어요.');
              return;
            }
            actions.update.mutate({ id: props.item.taskId, startsAt: null }, { onError });
          }}
          drop={(info) => {
            const { taskId, duration } = info.draggedEl.dataset;
            if (!taskId) return;
            const minutes = Number(duration) || 30;
            const end = new Date(info.date.getTime() + (info.allDay ? DAY_MS : minutes * 60 * 1000));
            actions.update.mutate({ id: taskId, startsAt: info.date.toISOString(), endsAt: end.toISOString(), allDay: info.allDay }, { onError });
          }}
        />
      </div>

      {overlay?.kind === 'create' ? (
        <CreatePopover
          {...overlay}
          onClose={() => {
            calendarRef.current?.getApi().unselect();
            setOverlay(null);
          }}
          onCreate={(title) =>
            actions.create.mutate(
              { title, startsAt: overlay.start.toISOString(), endsAt: overlay.end.toISOString(), allDay: overlay.allDay },
              { onError },
            )
          }
        />
      ) : null}

      {overlay?.kind === 'event' && overlayItem ? (
        <EventPopover
          key={overlayItem.id}
          item={overlayItem}
          anchor={overlay.anchor}
          onClose={() => setOverlay(null)}
          onRename={(title) =>
            overlayItem.recurrence
              ? setScope({ item: overlayItem, label: '이름 바꾸기', change: { type: 'rename', title } })
              : actions.update.mutate({ id: overlayItem.taskId, title }, { onError })
          }
          onToggleDone={() => toggleDone(overlayItem)}
          onUnschedule={() => {
            actions.update.mutate({ id: overlayItem.taskId, startsAt: null }, { onError });
            setOverlay(null);
          }}
          onDelete={() => {
            setOverlay(null);
            if (overlayItem.recurrence) setScope({ item: overlayItem, label: '삭제', change: { type: 'delete' } });
            else actions.remove.mutate(overlayItem.taskId, { onError });
          }}
          onRecurrenceChange={(recurrence) => actions.update.mutate({ id: overlayItem.taskId, recurrence }, { onError })}
        />
      ) : null}

      {overlay?.kind === 'suggestion' ? (
        <SuggestionPopover anchor={overlay.anchor} suggestion={overlay.suggestion} onClose={() => setOverlay(null)} />
      ) : null}

      <RecurrenceScopeDialog
        open={scope !== null}
        actionLabel={scope?.label ?? ''}
        onChoose={applyScope}
        onCancel={() => {
          scope?.revert?.();
          setScope(null);
        }}
      />
    </section>
  );
}
