export const CALENDAR_VIEWS = [
  { id: 'timeGridDay', label: '하루' },
  { id: 'timeGridFiveDay', label: '5일' },
  { id: 'timeGridWeek', label: '주' },
] as const;

export type CalendarViewId = (typeof CALENDAR_VIEWS)[number]['id'];

const STORAGE_KEY = 'plop.calendarView';
const DEFAULT_VIEW: CalendarViewId = 'timeGridFiveDay';

function isCalendarViewId(value: unknown): value is CalendarViewId {
  return CALENDAR_VIEWS.some((view) => view.id === value);
}

/** 마지막으로 본 보기를 기억한다. 저장소를 못 쓰면 기본 보기로 연다. */
export function loadCalendarView(): CalendarViewId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isCalendarViewId(saved) ? saved : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveCalendarView(view: CalendarViewId) {
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // 저장하지 못해도 보기 전환은 그대로 동작한다.
  }
}
