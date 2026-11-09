import { z } from 'zod';

/** 반복 규칙. days는 요일 번호(0=일요일)다. until은 마지막 회차 시작 한도(ISO)다. */
export const recurrenceSchema = z.discriminatedUnion('freq', [
  z.object({ freq: z.literal('daily'), until: z.iso.datetime().optional() }),
  z.object({ freq: z.literal('weekdays'), until: z.iso.datetime().optional() }),
  z.object({
    freq: z.literal('weekly'),
    days: z.array(z.number().int().min(0).max(6)).min(1),
    until: z.iso.datetime().optional(),
  }),
]);

export type Recurrence = z.infer<typeof recurrenceSchema>;

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export function describeRecurrence(rule: Recurrence) {
  if (rule.freq === 'daily') return '매일';
  if (rule.freq === 'weekdays') return '평일마다';
  const days = [...rule.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return `매주 ${days.map((d) => WEEKDAY_NAMES[d]).join(', ')}`;
}

function matchesDay(rule: Recurrence, weekday: number) {
  if (rule.freq === 'daily') return true;
  if (rule.freq === 'weekdays') return weekday >= 1 && weekday <= 5;
  return rule.days.includes(weekday);
}

/**
 * 반복 일정의 회차 시작 시각들을 [from, to) 기간과 겹치는 것만 돌려준다.
 * 회차는 첫 회차의 로컬 시각을 그대로 쓴다. 서버와 사용자가 같은 컴퓨터라 로컬 시간대가 곧 사용자 시간대다.
 */
export function expandOccurrences(
  seriesStart: Date,
  durationMs: number,
  rule: Recurrence,
  from: Date,
  to: Date,
  excludedStarts: readonly number[] = [],
): Date[] {
  const excluded = new Set(excludedStarts);
  const until = rule.until ? new Date(rule.until).getTime() : Infinity;
  const result: Date[] = [];

  // 기간 시작보다 길이만큼 앞선 날부터 본다. 전날 시작해 기간까지 이어지는 회차를 놓치지 않으려고.
  const cursor = new Date(Math.max(seriesStart.getTime(), from.getTime() - durationMs));
  cursor.setHours(0, 0, 0, 0);

  for (let guard = 0; guard < 800 && cursor < to; guard++) {
    if (matchesDay(rule, cursor.getDay())) {
      const start = new Date(cursor);
      start.setHours(seriesStart.getHours(), seriesStart.getMinutes(), seriesStart.getSeconds(), 0);
      const t = start.getTime();
      const overlaps = t < to.getTime() && (t + durationMs > from.getTime() || t >= from.getTime());

      if (t >= seriesStart.getTime() && t <= until && overlaps && !excluded.has(t)) result.push(start);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

/** 요일을 옮긴 만큼 반복 요일도 옮긴다. 수요일 회차를 목요일로 옮기면 매주 수는 매주 목이 된다. */
export function shiftRecurrenceDays(rule: Recurrence, dayDelta: number): Recurrence {
  if (rule.freq !== 'weekly' || dayDelta % 7 === 0) return rule;
  return { ...rule, days: rule.days.map((d) => (((d + dayDelta) % 7) + 7) % 7) };
}
