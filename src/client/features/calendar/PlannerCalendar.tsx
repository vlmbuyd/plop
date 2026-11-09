import FullCalendar, { useCalendarController, type EventInput } from '@fullcalendar/react';
import interactionPlugin from '@fullcalendar/react/interaction';
import koLocale from '@fullcalendar/react/locales/ko';
import formaThemePlugin from '@fullcalendar/react/themes/forma';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import { useMemo, useState } from 'react';

import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/forma/theme.css';
import './calendar.css';

import type { Task } from '@shared/task';

import { CalendarHeader } from './CalendarHeader';
import { useTasksInRange, type DateRange } from './useTasksInRange';
import { loadCalendarView, saveCalendarView, type CalendarViewId } from './views';

function toEventInput(task: Task): EventInput {
  return {
    id: task.id,
    title: task.title,
    start: task.startsAt!,
    end: task.endsAt ?? undefined,
    allDay: task.allDay,
    className: task.completedAt ? 'is-done' : undefined,
    extendedProps: { done: task.completedAt !== null },
  };
}

export function PlannerCalendar() {
  const controller = useCalendarController();
  const [view, setView] = useState<CalendarViewId>(loadCalendarView);
  const [range, setRange] = useState<DateRange | null>(null);
  const { data: tasks = [] } = useTasksInRange(range);

  const events = useMemo(() => tasks.map(toEventInput), [tasks]);

  const changeView = (next: CalendarViewId) => {
    setView(next);
    saveCalendarView(next);
    controller.changeView(next);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <CalendarHeader controller={controller} view={view} onViewChange={changeView} />

      <div className="plop-calendar min-h-0 flex-1">
        <FullCalendar
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
          dayHeaderContent={(arg) => (
            <div className="plop-day-header">
              <span className="plop-day-header__weekday">{arg.date.toLocaleDateString('ko-KR', { weekday: 'short' })}</span>
              <span className={arg.isToday ? 'plop-day-header__date is-today' : 'plop-day-header__date'}>{arg.date.getDate()}</span>
            </div>
          )}
          eventContent={(arg) => (
            // 30분 이하 일정은 칸이 낮아 제목과 시간을 한 줄에 놓는다.
            <div className={arg.isShort ? 'plop-event is-short' : 'plop-event'}>
              <span className="plop-event__check" aria-hidden />
              <span className="plop-event__body">
                <span className="plop-event__title">{arg.event.title}</span>
                {!arg.event.allDay && arg.timeText ? <span className="plop-event__time">{arg.timeText}</span> : null}
              </span>
            </div>
          )}
          events={events}
          datesSet={(info) => setRange({ from: info.start, to: info.end })}
        />
      </div>
    </section>
  );
}
