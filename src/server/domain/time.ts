const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, '0');

/** 로컬 날짜 'YYYY-MM-DD'. */
export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** 'YYYY-MM-DD'와 'HH:mm'을 로컬 시각으로. */
export function atLocal(dateKey: string, time = '00:00') {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const [h, min] = time.split(':').map(Number) as [number, number];
  return new Date(y, m - 1, d, h, min);
}

/** AI가 돌려준 'YYYY-MM-DDTHH:mm'(시간대 없음)을 로컬 시각으로. 잘못된 값이면 null. */
export function parseLocalDateTime(value: string | undefined | null) {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(value);
  if (!match) return null;
  const date = atLocal(match[1]!, match[2] ?? '00:00');
  return Number.isNaN(date.getTime()) ? null : date;
}

/** AI에게 보여 주는 로컬 시각 'YYYY-MM-DDTHH:mm'. */
export function formatLocalDateTime(date: Date) {
  return `${localDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatHourMinute(date: Date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const meridiem = h < 12 ? '오전' : '오후';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${meridiem} ${hour12}시` : `${meridiem} ${hour12}시 ${m}분`;
}

export function weekdayName(date: Date) {
  return WEEKDAYS[date.getDay()]!;
}

/** 15분 단위로 올림. 제안 시각을 보기 좋게 맞춘다. */
export function ceilToQuarter(date: Date) {
  const quarter = 15 * MINUTE;
  return new Date(Math.ceil(date.getTime() / quarter) * quarter);
}
