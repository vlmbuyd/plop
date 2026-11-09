import { useCalendarController } from '@fullcalendar/react';
import { useCallback, useState } from 'react';

import { loadCalendarView, saveCalendarView, type CalendarViewId } from './views';

/** 캘린더 이동과 보기 전환. 단축키에서도 쓰려고 App에서 만든다. */
export function useCalendarState() {
  const controller = useCalendarController();
  const [view, setView] = useState<CalendarViewId>(loadCalendarView);

  const changeView = useCallback(
    (next: CalendarViewId) => {
      setView(next);
      saveCalendarView(next);
      controller.changeView(next);
    },
    [controller],
  );

  return { controller, view, changeView };
}

export type CalendarState = ReturnType<typeof useCalendarState>;
